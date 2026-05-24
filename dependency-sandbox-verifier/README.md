# Dependency Sandbox Verifier (DSV)

AI-assisted supply-chain security platform for verifying dependency changes..

## Architecture

```
apps/api      – Fastify 5 REST API; enqueues scan jobs via BullMQ
apps/worker   – BullMQ worker; runs OSV queries, OPA policy eval, AI explanation
apps/cli      – CLI for local scans (no DB required)
apps/web      – Next.js 15 dashboard with real scan data
packages/db             – Prisma schema + client (PostgreSQL)
packages/shared         – Shared TypeScript types
packages/analyzers      – OSV vulnerability queries, dependency parser (+ transitive), SBOM export
packages/policy-engine  – OPA/Rego evaluation with TypeScript fallback
packages/sandbox-runner – Docker-based isolated npm install runner
packages/ai             – OpenAI GPT-4 wrapper (FakeAIService when no key)
packages/github         – GitHub App webhooks + Octokit helpers (wired via POST /webhooks)
```

## Setup

### Prerequisites

- Node.js 18+ (Node.js 20+ recommended for optimal engine compatibility)
- Docker (required only if using sandbox features)
- PostgreSQL 15+
- Redis 7+
- OPA (optional; TypeScript fallback activates automatically)

### Local Development

1. Clone the repo.

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start Postgres, Redis, and OPA:
   ```bash
   docker-compose up -d
   ```

4. Copy and fill in environment variables:
   ```bash
   cp .env.example .env
   # Edit DATABASE_URL, REDIS_URL, and optionally OPENAI_API_KEY / GITHUB_TOKEN
   ```

5. Generate Prisma client and run migrations:
   ```bash
   cd packages/db
   npm run generate
   npm run migrate
   cd ../..
   ```

6. Build all packages:
   ```bash
   npm run build
   ```

7. Start services (each in its own terminal):
   ```bash
   cd apps/api    && npm start   # API on $PORT (default 3000)
   cd apps/worker && npm start   # background job processor
   cd apps/web    && npm start   # dashboard on port 3001 (set API_URL=http://localhost:3000)
   ```

### Environment Variables

| Variable         | Required | Description                                        |
|------------------|----------|----------------------------------------------------|
| `DATABASE_URL`   | Yes      | PostgreSQL connection string                       |
| `REDIS_URL`      | Yes      | Redis connection string (default: localhost:6379)  |
| `PORT`           | No       | API listen port (default: 3000)                    |
| `OPA_URL`        | No       | OPA server URL (default: http://localhost:8181)    |
| `OPENAI_API_KEY` | No       | Enables real AI analysis (FakeAI used otherwise)   |
| `GITHUB_TOKEN`   | No       | GitHub API token for PR comments and file fetching |
| `WEBHOOK_SECRET` | No       | Required to register and verify GitHub webhooks    |
| `API_URL`        | No       | Dashboard → API base URL (default: localhost:3000) |
| `DSV_API_URL`    | No       | CLI → API base URL for report/replay commands      |

## Usage

### API

```bash
# Health check
curl http://localhost:3000/health

# Create a repository record
curl -X POST http://localhost:3000/repositories \
  -H 'Content-Type: application/json' \
  -d '{"name":"my-app","owner":"my-org","url":"https://github.com/my-org/my-app"}'

# Submit a scan
curl -X POST http://localhost:3000/scans \
  -H 'Content-Type: application/json' \
  -d '{"repositoryId":"<repoId>","newManifest":"{\"dependencies\":{\"lodash\":\"4.17.20\"}}"}'

# Poll results
curl http://localhost:3000/scans/<scanId>
curl http://localhost:3000/scans/<scanId>/findings
curl http://localhost:3000/scans/<scanId>/policy
curl http://localhost:3000/scans/<scanId>/sbom
curl http://localhost:3000/scans/<scanId>/ai-explanation
curl http://localhost:3000/scans/<scanId>/evidence
curl http://localhost:3000/scans/<scanId>/dependency-diff

# Approve a finding
curl -X POST http://localhost:3000/approvals \
  -H 'Content-Type: application/json' \
  -d '{"findingId":"<id>","approvedBy":"alice@example.com","reason":"known false positive"}'

# GitHub webhook (requires WEBHOOK_SECRET)
curl -X POST http://localhost:3000/webhooks \
  -H 'x-github-event: pull_request' \
  -H 'x-github-delivery: <uuid>' \
  -H 'x-hub-signature-256: <hmac>' \
  -d '<github-pr-payload>'
```

### CLI

```bash
# Scan a local project (reads package.json from the directory)
npx dsv scan ./my-project
npx dsv scan ./my-project --json

# Diff two manifests
npx dsv diff old-package.json new-package.json

# Test policy against a findings array
npx dsv policy test '[{"type":"VULNERABILITY","severity":"HIGH","title":"x","description":"","evidence":{}}]'

# Fetch and display a scan report from the API
npx dsv report <scanId>
npx dsv report <scanId> --json

# Re-evaluate an existing scan's findings against the current policy
npx dsv replay <scanId>
npx dsv replay <scanId> --json

# Use a non-default API URL
DSV_API_URL=http://api.internal npx dsv report <scanId>
```

## Feature Status

| Feature                  | Status        | Notes |
|--------------------------|---------------|-------|
| OPA/Rego policy          | **WORKING**   | Real OPA evaluation; TypeScript fallback when OPA is unreachable |
| Transitive dep analysis  | **WORKING**   | Lockfile v1/v2/v3 parsed; transitive deps diffed and scanned |
| CycloneDX SBOM           | **WORKING**   | Per-scan SBOM with `dsv:isDirect` property stored in DB |
| OSV vulnerability lookup | **WORKING**   | Real OSV API queries per package+version |
| AI analysis              | **WORKING**   | FakeAIService by default; set `OPENAI_API_KEY` for real GPT-4 |
| Web dashboard            | **WORKING**   | Scan list, scan detail, findings, policy, AI explanation, evidence |
| GitHub webhooks          | **WORKING**   | `POST /webhooks` wired; requires `WEBHOOK_SECRET` and `GITHUB_TOKEN` |
| Approvals endpoint       | **WORKING**   | `POST /approvals` links findings to reviewer decisions |
| CLI report               | **WORKING**   | `dsv report <scanId>` fetches all scan data from API |
| CLI replay               | **WORKING**   | `dsv replay <scanId>` re-evaluates findings with current policy |
| Sandbox monitoring       | **WORKING**   | `DockerSandboxRunner` runs npm install in isolated container; captures SCRIPT_EXECUTION events |
| Multi-ecosystem          | **NOT IMPL**  | Only npm/OSV supported; PYPI/CARGO/MAVEN not implemented |
| SPDX SBOM format         | **NOT IMPL**  | Only CycloneDX supported |

## Security Notes

- AI never makes final decisions; the policy engine does.
- Sandbox containers run with `NetworkDisabled: true`, 256 MB memory cap, and 50% CPU quota.
- Package names and version strings are validated against an allowlist before being passed to Docker.
- All findings link to verifiable OSV evidence.
- GitHub webhooks are HMAC-verified before any processing.
- API endpoints have no authentication — do not expose to the internet without adding auth.
