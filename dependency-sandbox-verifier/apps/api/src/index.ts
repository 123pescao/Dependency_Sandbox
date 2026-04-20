import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '@dsv/db';
import { createWebhookHandler } from '@dsv/github';

const app = Fastify({ logger: true });

const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const scanQueue = new Queue('scan', { connection: redis });

function sendInternalError(reply: FastifyReply, err: unknown): ReturnType<FastifyReply['send']> {
  app.log.error(err);
  return reply.status(500).send({ error: 'Internal server error' });
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const postRepoSchema = {
  schema: {
    body: {
      type: 'object',
      required: ['name', 'owner', 'url'],
      properties: {
        name: { type: 'string', minLength: 1 },
        owner: { type: 'string', minLength: 1 },
        url: { type: 'string', minLength: 1 },
        githubId: { type: 'string' },
      },
    },
  },
};

const postScanSchema = {
  schema: {
    body: {
      type: 'object',
      required: ['repositoryId'],
      properties: {
        repositoryId: { type: 'string', minLength: 1 },
        prNumber: { type: 'integer', minimum: 1 },
        oldManifest: { type: 'string' },
        newManifest: { type: 'string' },
        oldLockfile: { type: 'string' },
        newLockfile: { type: 'string' },
      },
    },
  },
};

const getScansSchema = {
  schema: {
    querystring: {
      type: 'object',
      properties: {
        page: { type: 'integer', minimum: 1, default: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      },
    },
  },
};

const postApprovalSchema = {
  schema: {
    body: {
      type: 'object',
      required: ['findingId', 'approvedBy'],
      properties: {
        findingId: { type: 'string', minLength: 1 },
        approvedBy: { type: 'string', minLength: 1 },
        reason: { type: 'string' },
      },
    },
  },
};

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', async () => {
  return { status: 'ok' };
});

// Repositories
app.get('/repositories', async (_req, reply) => {
  try {
    return await prisma.repository.findMany();
  } catch (err) {
    return sendInternalError(reply, err);
  }
});

app.post('/repositories', postRepoSchema, async (request: FastifyRequest, reply: FastifyReply) => {
  const { name, owner, url, githubId } = request.body as {
    name: string; owner: string; url: string; githubId?: string;
  };
  try {
    const repo = await prisma.repository.upsert({
      where: { owner_name: { owner, name } },
      update: { url, githubId },
      create: { name, owner, url, githubId },
    });
    return repo;
  } catch (err) {
    return sendInternalError(reply, err);
  }
});

// Scans
app.get('/scans', getScansSchema, async (request: FastifyRequest, reply: FastifyReply) => {
  const { page = 1, limit = 20 } = request.query as { page?: number; limit?: number };
  try {
    const [scans, total] = await Promise.all([
      prisma.scan.findMany({
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.scan.count(),
    ]);
    return { data: scans, total, page, limit };
  } catch (err) {
    return sendInternalError(reply, err);
  }
});

app.post('/scans', postScanSchema, async (request: FastifyRequest, reply: FastifyReply) => {
  const { repositoryId, prNumber, oldManifest, newManifest, oldLockfile, newLockfile } = request.body as {
    repositoryId: string;
    prNumber?: number;
    oldManifest?: string;
    newManifest?: string;
    oldLockfile?: string;
    newLockfile?: string;
  };

  try {
    const repo = await prisma.repository.findUnique({ where: { id: repositoryId } });
    if (!repo) {
      return reply.status(404).send({ error: `Repository ${repositoryId} not found` });
    }

    const scan = await prisma.scan.create({
      data: {
        repositoryId,
        status: 'PENDING',
        triggeredBy: 'api',
        prNumber,
      },
    });

    await scanQueue.add('scan', { scanId: scan.id, oldManifest, newManifest, oldLockfile, newLockfile });

    return reply.status(202).send(scan);
  } catch (err) {
    return sendInternalError(reply, err);
  }
});

app.get('/scans/:id', async (request: FastifyRequest, reply: FastifyReply) => {
  const { id } = request.params as { id: string };
  try {
    const scan = await prisma.scan.findUnique({
      where: { id },
      include: { findings: true },
    });
    if (!scan) return reply.status(404).send({ error: 'Scan not found' });
    return scan;
  } catch (err) {
    return sendInternalError(reply, err);
  }
});

app.get('/scans/:id/findings', async (request: FastifyRequest, reply: FastifyReply) => {
  const { id } = request.params as { id: string };
  try {
    return await prisma.finding.findMany({ where: { scanId: id } });
  } catch (err) {
    return sendInternalError(reply, err);
  }
});

app.get('/scans/:id/evidence', async (request: FastifyRequest, reply: FastifyReply) => {
  const { id } = request.params as { id: string };
  try {
    const findings = await prisma.finding.findMany({
      where: { scanId: id },
      select: { id: true, packageName: true, version: true, type: true, severity: true, evidence: true },
    });
    return { scanId: id, count: findings.length, evidence: findings.map(f => ({ findingId: f.id, packageName: f.packageName, version: f.version, type: f.type, severity: f.severity, raw: f.evidence })) };
  } catch (err) {
    return sendInternalError(reply, err);
  }
});

app.get('/scans/:id/dependency-diff', async (request: FastifyRequest, reply: FastifyReply) => {
  const { id } = request.params as { id: string };
  try {
    const scan = await prisma.scan.findUnique({
      where: { id },
      include: { scanTargets: { include: { dependencyChanges: true } } },
    });
    if (!scan) return reply.status(404).send({ error: 'Scan not found' });
    return scan.scanTargets.flatMap(t => t.dependencyChanges);
  } catch (err) {
    return sendInternalError(reply, err);
  }
});

app.get('/scans/:id/policy', async (request: FastifyRequest, reply: FastifyReply) => {
  const { id } = request.params as { id: string };
  try {
    return await prisma.policyDecision.findMany({
      where: { finding: { scanId: id } },
    });
  } catch (err) {
    return sendInternalError(reply, err);
  }
});

app.get('/scans/:id/sbom', async (request: FastifyRequest, reply: FastifyReply) => {
  const { id } = request.params as { id: string };
  try {
    const sbom = await prisma.sbom.findFirst({ where: { scanId: id } });
    if (!sbom) return reply.status(404).send({ error: 'SBOM not found for this scan' });
    return sbom;
  } catch (err) {
    return sendInternalError(reply, err);
  }
});

app.get('/scans/:id/ai-explanation', async (request: FastifyRequest, reply: FastifyReply) => {
  const { id } = request.params as { id: string };
  try {
    return await prisma.aIExplanation.findFirst({ where: { scanId: id } });
  } catch (err) {
    return sendInternalError(reply, err);
  }
});

// Approvals — look up repositoryId from the finding's scan
app.post('/approvals', postApprovalSchema, async (request: FastifyRequest, reply: FastifyReply) => {
  const { findingId, approvedBy, reason } = request.body as {
    findingId: string; approvedBy: string; reason?: string;
  };

  try {
    const finding = await prisma.finding.findUnique({
      where: { id: findingId },
      include: { scan: { select: { repositoryId: true } } },
    });
    if (!finding) return reply.status(404).send({ error: 'Finding not found' });

    return await prisma.approval.create({
      data: {
        findingId,
        repositoryId: finding.scan.repositoryId,
        approvedBy,
        reason,
      },
    });
  } catch (err) {
    return sendInternalError(reply, err);
  }
});

// GitHub Webhooks
// Initialise lazily so the route still registers even when WEBHOOK_SECRET is absent.
// The first call with a missing secret returns 500 rather than crashing at startup.
app.post('/webhooks', async (request: FastifyRequest, reply: FastifyReply) => {
  let webhooks: ReturnType<typeof createWebhookHandler>;
  try {
    webhooks = createWebhookHandler(async (payload: unknown) => {
      const pr = payload as {
        repository: { name: string; owner: { login: string }; clone_url: string; id: number };
        pull_request: { number: number };
      };
      const { name, owner, clone_url: url, id: githubId } = pr.repository;
      const prNumber = pr.pull_request.number;

      const repo = await prisma.repository.upsert({
        where: { owner_name: { owner: owner.login, name } },
        update: { url, githubId: String(githubId) },
        create: { name, owner: owner.login, url, githubId: String(githubId) },
      });

      const scan = await prisma.scan.create({
        data: { repositoryId: repo.id, status: 'PENDING', triggeredBy: 'github-webhook', prNumber },
      });

      await scanQueue.add('scan', { scanId: scan.id });
    });
  } catch (err) {
    return sendInternalError(reply, err);
  }

  const id = request.headers['x-github-delivery'] as string | undefined;
  const name = request.headers['x-github-event'] as string | undefined;
  const signature = (request.headers['x-hub-signature-256'] ?? '') as string;

  if (!id || !name) return reply.status(400).send({ error: 'Missing GitHub webhook headers' });

  try {
    await webhooks.verifyAndReceive({ id, name: name as Parameters<typeof webhooks.verifyAndReceive>[0]['name'], signature, payload: JSON.stringify(request.body) });
    return reply.status(200).send({ ok: true });
  } catch (err) {
    app.log.warn({ err }, 'Webhook verification failed');
    return reply.status(400).send({ error: 'Webhook verification failed' });
  }
});

// ── Startup / shutdown ────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3000', 10);

const start = async () => {
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

const shutdown = async () => {
  await scanQueue.close();
  await redis.quit();
  await app.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start();
