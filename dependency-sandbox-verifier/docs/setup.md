# Setup Guide

## Prerequisites

- Node.js 18+ (Node.js 20+ recommended)
- Docker or Podman (for sandbox and for running Postgres/Redis/OPA)
- PostgreSQL 15+
- Redis 7+

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Start infrastructure

```bash
docker-compose up -d
```

This starts:
- PostgreSQL on port 5432
- Redis on port 6379
- OPA on port 8181 with the policy at `policies/dsv.rego`

### 3. Environment variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
# Edit .env — never commit it
```

Minimum required:
```
DATABASE_URL=postgresql://dsv_user:CHANGE_ME@localhost:5432/dsv
REDIS_URL=redis://localhost:6379
```

Optional:
```
OPA_URL=http://localhost:8181
OPENAI_API_KEY=SET_IN_ENV
GITHUB_TOKEN=SET_IN_ENV
WEBHOOK_SECRET=SET_IN_ENV
```

### 4. Generate Prisma client and run migrations

```bash
cd packages/db && npm run generate && npm run migrate && cd ../..
```

### 5. Build

```bash
npm run build
```

### 6. Run services

```bash
DATABASE_URL=... REDIS_URL=... node apps/api/dist/index.js       # port 3000
DATABASE_URL=... REDIS_URL=... node apps/worker/dist/index.js    # background
cd apps/web && API_URL=http://localhost:3000 npx next start -p 3001
```

## Troubleshooting

- **Prisma fails**: Check DATABASE_URL and run `npm run migrate` in packages/db.
- **OPA not reachable**: TypeScript fallback activates automatically — no action needed.
- **No AI output**: Set OPENAI_API_KEY. Without it, FakeAIService returns stub text.
- **GitHub webhooks**: Need a public URL. Use ngrok for local testing.
- **Engine warnings**: Fastify 5 and Next.js 15 run on Node 18 with advisory warnings; both work correctly.
