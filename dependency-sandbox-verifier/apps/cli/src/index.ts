#!/usr/bin/env node

import { Command } from 'commander';
import { OSVAnalyzer, NpmDependencyParser, CycloneDXExporter } from '@dsv/analyzers';
import { OPAPolicyEngine } from '@dsv/policy-engine';
import { createAIService } from '@dsv/ai';
import fs from 'fs';

const program = new Command();

program
  .name('dsv')
  .description('Dependency Sandbox Verifier CLI')
  .version('1.0.0');

program
  .command('scan')
  .description('Scan dependencies in a local path')
  .argument('<path>', 'path to directory containing package.json')
  .option('-j, --json', 'output in JSON format')
  .action(async (dirPath: string, options: { json?: boolean }) => {
    const analyzer = new OSVAnalyzer();
    const parser = new NpmDependencyParser();
    const exporter = new CycloneDXExporter();
    const policyEngine = new OPAPolicyEngine();
    const aiService = createAIService();

    let manifest: string;
    let lockfile: string | undefined;

    try {
      manifest = fs.readFileSync(`${dirPath}/package.json`, 'utf-8');
    } catch {
      console.error(`Error: cannot read ${dirPath}/package.json`);
      process.exit(1);
    }

    try {
      lockfile = fs.readFileSync(`${dirPath}/package-lock.json`, 'utf-8');
    } catch {
      // lockfile is optional
    }

    try {
      // Treat all packages as newly added for MVP (no baseline manifest available).
      const changes = parser.parseDiff('{}', manifest, undefined, lockfile);
      const sbom = exporter.exportCycloneDX(changes);

      // Query all added/updated packages, not just the first
      const allVulns: Awaited<ReturnType<typeof analyzer.query>> = [];
      for (const change of changes.filter(c => c.changeType !== 'REMOVED')) {
        try {
          const vulns = await analyzer.query(change.packageName, change.newVersion, 'npm');
          allVulns.push(...vulns);
        } catch (err) {
          console.warn(`  Warning: OSV query failed for ${change.packageName}:`, err);
        }
      }

      const findings = allVulns.map(v => ({
        type: 'VULNERABILITY' as const,
        severity: v.severity,
        title: v.summary,
        description: v.details ?? '',
        evidence: v as object,
      }));

      const policyResult = await policyEngine.evaluate(findings);
      const aiResponse = await aiService.analyze({
        dependencyChanges: changes,
        vulnerabilities: allVulns,
        findings,
        attestations: [],
        sandboxEvents: [],
      });

      const result = { changes, sbom, vulnerabilities: allVulns, findings, policy: policyResult, aiExplanation: aiResponse };

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Changes:         ${changes.length}`);
        console.log(`Vulnerabilities: ${allVulns.length}`);
        console.log(`Policy:          ${policyResult.result}`);
        console.log(`AI summary:      ${aiResponse.executiveSummary}`);
      }
    } catch (error) {
      console.error('Scan failed:', error);
      process.exit(1);
    }
  });

program
  .command('diff')
  .description('Show dependency diff between two package.json files')
  .argument('<old>', 'path to old package.json')
  .argument('<new>', 'path to new package.json')
  .action((oldPath: string, newPath: string) => {
    let oldContent: string;
    let newContent: string;

    try {
      oldContent = fs.readFileSync(oldPath, 'utf-8');
    } catch {
      console.error(`Error: cannot read file: ${oldPath}`);
      process.exit(1);
    }

    try {
      newContent = fs.readFileSync(newPath, 'utf-8');
    } catch {
      console.error(`Error: cannot read file: ${newPath}`);
      process.exit(1);
    }

    const parser = new NpmDependencyParser();
    const changes = parser.parseDiff(oldContent, newContent);
    console.log('Dependency changes:', JSON.stringify(changes, null, 2));
  });

// policy test — subcommand
const policyCmd = program
  .command('policy')
  .description('Policy commands');

policyCmd
  .command('test')
  .description('Test policy evaluation against a findings JSON array')
  .argument('<findings>', 'JSON array of findings')
  .action(async (findingsJson: string) => {
    let findings: unknown[];
    try {
      findings = JSON.parse(findingsJson);
    } catch {
      console.error('Error: <findings> must be a valid JSON array');
      process.exit(1);
    }
    if (!Array.isArray(findings)) {
      console.error('Error: <findings> must be a JSON array');
      process.exit(1);
    }
    const policyEngine = new OPAPolicyEngine();
    const result = await policyEngine.evaluate(findings as Parameters<typeof policyEngine.evaluate>[0]);
    console.log('Policy result:', result);
  });

program
  .command('report')
  .description('Fetch and display a scan report from the API')
  .argument('<scanId>', 'scan ID to report on')
  .option('--api-url <url>', 'API base URL', process.env.DSV_API_URL ?? 'http://localhost:3000')
  .option('-j, --json', 'output raw JSON')
  .action(async (scanId: string, options: { apiUrl: string; json?: boolean }) => {
    const base = options.apiUrl;
    try {
      const [scanRes, policyRes, aiRes, evidenceRes] = await Promise.all([
        fetch(`${base}/scans/${scanId}`),
        fetch(`${base}/scans/${scanId}/policy`),
        fetch(`${base}/scans/${scanId}/ai-explanation`),
        fetch(`${base}/scans/${scanId}/evidence`),
      ]);

      if (!scanRes.ok) {
        console.error(`Scan ${scanId} not found (HTTP ${scanRes.status})`);
        process.exit(1);
      }

      const [scan, policy, ai, evidence] = await Promise.all([
        scanRes.json(),
        policyRes.json(),
        aiRes.json(),
        evidenceRes.json(),
      ]);

      if (options.json) {
        console.log(JSON.stringify({ scan, policy, aiExplanation: ai, evidence }, null, 2));
        return;
      }

      const policyResult = Array.isArray(policy) && policy.length > 0 ? policy[0].result : 'N/A';
      const findings = (scan as any).findings ?? [];
      const critCount = findings.filter((f: any) => f.severity === 'CRITICAL').length;
      const highCount = findings.filter((f: any) => f.severity === 'HIGH').length;

      console.log(`\nScan Report: ${scanId}`);
      console.log(`Status:          ${(scan as any).status}`);
      console.log(`Policy Result:   ${policyResult}`);
      console.log(`Findings:        ${findings.length} (CRITICAL=${critCount}, HIGH=${highCount})`);
      console.log(`Created:         ${(scan as any).createdAt}`);
      console.log(`Completed:       ${(scan as any).completedAt ?? 'N/A'}`);

      if (ai && (ai as any).executiveSummary) {
        console.log(`\nAI Summary:\n  ${(ai as any).executiveSummary}`);
      }

      if (findings.length > 0) {
        console.log('\nTop Findings:');
        for (const f of findings.slice(0, 5)) {
          console.log(`  [${f.severity}] ${f.packageName ?? ''}@${f.version ?? '?'} — ${f.title}`);
        }
        if (findings.length > 5) console.log(`  … and ${findings.length - 5} more`);
      }

      if (Array.isArray(policy) && policy.length > 0) {
        console.log('\nPolicy Decisions:');
        for (const pd of policy.slice(0, 3)) {
          console.log(`  ${pd.result}: ${JSON.stringify(pd.details)}`);
        }
      }
    } catch (error) {
      console.error('Report failed:', error);
      process.exit(1);
    }
  });

program
  .command('replay')
  .description('Re-evaluate an existing scan\'s findings against the current policy')
  .argument('<scanId>', 'scan ID to replay')
  .option('--api-url <url>', 'API base URL', process.env.DSV_API_URL ?? 'http://localhost:3000')
  .option('-j, --json', 'output raw JSON')
  .action(async (scanId: string, options: { apiUrl: string; json?: boolean }) => {
    const base = options.apiUrl;
    const policyEngine = new OPAPolicyEngine();
    const aiService = createAIService();

    try {
      const [findingsRes, evidenceRes] = await Promise.all([
        fetch(`${base}/scans/${scanId}/findings`),
        fetch(`${base}/scans/${scanId}/evidence`),
      ]);

      if (!findingsRes.ok) {
        console.error(`Scan ${scanId} not found (HTTP ${findingsRes.status})`);
        process.exit(1);
      }

      const findings = (await findingsRes.json()) as unknown[];
      const evidenceData = evidenceRes.ok ? await evidenceRes.json() : { evidence: [] };

      const policyResult = await policyEngine.evaluate(findings as Parameters<typeof policyEngine.evaluate>[0]);

      const aiResponse = await aiService.analyze({
        dependencyChanges: [],
        vulnerabilities: (evidenceData as any).evidence?.map((e: any) => e.raw).filter(Boolean) ?? [],
        findings: findings as any[],
        attestations: [],
        sandboxEvents: [],
      });

      if (options.json) {
        console.log(JSON.stringify({ scanId, policy: policyResult, aiExplanation: aiResponse }, null, 2));
        return;
      }

      console.log(`\nReplay Result: ${scanId}`);
      console.log(`Policy:   ${policyResult.result}`);
      console.log(`Details:  ${JSON.stringify(policyResult.details)}`);
      console.log(`AI:       ${aiResponse.executiveSummary}`);
    } catch (error) {
      console.error('Replay failed:', error);
      process.exit(1);
    }
  });

program.parse();
