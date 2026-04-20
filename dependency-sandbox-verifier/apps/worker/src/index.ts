import { randomUUID } from 'crypto';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { prisma, Prisma } from '@dsv/db';
import { OSVAnalyzer, NpmDependencyParser, CycloneDXExporter } from '@dsv/analyzers';
import { OPAPolicyEngine } from '@dsv/policy-engine';
import { createAIService } from '@dsv/ai';

const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const analyzer = new OSVAnalyzer();
const parser = new NpmDependencyParser();
const sbomExporter = new CycloneDXExporter();
const policyEngine = new OPAPolicyEngine();
const aiService = createAIService();

const POLICY_DESCRIPTION = 'OPA/Rego policy at policies/dsv.rego. TypeScript fallback activates when OPA is unreachable.';
const POLICY_REGO = '# See policies/dsv.rego';

async function ensureDefaultPolicy(): Promise<string> {
  const policy = await prisma.policy.upsert({
    where: { name: 'Default Policy' },
    update: { description: POLICY_DESCRIPTION, regoCode: POLICY_REGO },
    create: { name: 'Default Policy', description: POLICY_DESCRIPTION, regoCode: POLICY_REGO, active: true },
  });
  return policy.id;
}

async function main() {
  const defaultPolicyId = await ensureDefaultPolicy();

  const worker = new Worker(
    'scan',
    async (job) => {
      const { scanId, oldManifest, newManifest, oldLockfile, newLockfile } = job.data as {
        scanId: string;
        oldManifest?: string;
        newManifest?: string;
        oldLockfile?: string;
        newLockfile?: string;
      };

      await prisma.scan.update({ where: { id: scanId }, data: { status: 'RUNNING' } });

      try {
        const changes = newManifest
          ? parser.parseDiff(oldManifest ?? '{}', newManifest, oldLockfile, newLockfile)
          : [];

        const sbomContent = sbomExporter.exportCycloneDX(changes, { scanId });

        // SBOM write and OSV fan-out are independent — run concurrently
        const [, perPackageResults] = await Promise.all([
          prisma.sbom.create({
            data: {
              scanId,
              format: 'CycloneDX',
              content: JSON.parse(sbomContent) as Prisma.InputJsonValue,
            },
          }),
          Promise.all(
            changes
              .filter(c => c.changeType !== 'REMOVED')
              .map(async (c) => {
                try {
                  const vulns = await analyzer.query(c.packageName, c.newVersion, 'npm');
                  return { change: c, vulns };
                } catch (err) {
                  console.error(`OSV query failed for ${c.packageName}@${c.newVersion}:`, err);
                  return { change: c, vulns: [] as Awaited<ReturnType<typeof analyzer.query>> };
                }
              }),
          ),
        ]);

        const findingRows = perPackageResults.flatMap(({ change, vulns }) =>
          vulns.map(v => ({
            id: randomUUID(),
            scanId,
            type: 'VULNERABILITY' as const,
            severity: v.severity,
            title: v.summary,
            description: v.details ?? '',
            evidence: v as object,
            packageName: change.packageName,
            version: change.newVersion,
          })),
        );

        if (findingRows.length > 0) {
          await prisma.finding.createMany({ data: findingRows });
        }

        // OPA evaluation and AI analysis are independent — run concurrently
        const allVulns = perPackageResults.flatMap(r => r.vulns);
        const [policyResult, aiResponse] = await Promise.all([
          policyEngine.evaluate(findingRows),
          aiService.analyze({
            dependencyChanges: changes,
            vulnerabilities: allVulns,
            findings: findingRows,
            attestations: [],
            sandboxEvents: [],
          }),
        ]);

        if (findingRows.length > 0) {
          await prisma.policyDecision.createMany({
            data: findingRows.map(f => ({
              findingId: f.id,
              policyId: defaultPolicyId,
              result: policyResult.result,
              details: policyResult.details as Prisma.InputJsonValue,
            })),
          });
        }

        await prisma.aIExplanation.create({
          data: {
            scanId,
            executiveSummary: aiResponse.executiveSummary,
            technicalSummary: aiResponse.technicalSummary,
            rationale: aiResponse.rationale,
            confidence: aiResponse.confidence,
            remediation: aiResponse.remediation as Prisma.InputJsonValue,
            policySuggestions: aiResponse.policySuggestions
              ? (aiResponse.policySuggestions as Prisma.InputJsonValue)
              : Prisma.JsonNull,
          },
        });

        await prisma.scan.update({
          where: { id: scanId },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
      } catch (error) {
        console.error(`Scan ${scanId} failed:`, error);
        await prisma.scan.update({ where: { id: scanId }, data: { status: 'FAILED' } });
        throw error;
      }
    },
    { connection: redis },
  );

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err);
  });

  const shutdown = async () => {
    await worker.close();
    await redis.quit();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(err => {
  console.error('Startup failed:', err);
  process.exit(1);
});
