# Architecture

## Overview

DSV is a TypeScript monorepo (npm workspaces) with 4 applications and 7 shared packages.

```
apps/
  api/       Fastify 5 REST API — accepts repo/scan requests, enqueues jobs
  worker/    BullMQ worker — processes scan jobs from the queue
  web/       Next.js 15 dashboard — displays scan results, findings, AI explanations
  cli/       Commander CLI — local scans, diffs, policy tests, reports, replays
packages/
  db/            Prisma client + schema (PostgreSQL)
  shared/        TypeScript types used across all packages
  analyzers/     OSV queries, npm lockfile parser (transitive), CycloneDX SBOM export
  policy-engine/ OPA/Rego evaluation with automatic TypeScript fallback
  sandbox-runner/ Docker-based isolated npm install runner
  ai/            OpenAI GPT-4 wrapper; FakeAIService stub when no key
  github/        @octokit/webhooks handler + Octokit REST helpers
```

## Data Flow

```
GitHub PR webhook          CLI scan
       ↓                      ↓
POST /webhooks       dsv scan <path>
       ↓
POST /repositories ─→ upsert repo
POST /scans ────────→ create Scan(PENDING) + enqueue BullMQ job
                              ↓
                     Worker picks up job
                              ↓
               ┌──────────────┴──────────────┐
          Parse manifest/lockfile        Export CycloneDX SBOM
          (direct + transitive deps)          ↓
               ↓                       prisma.sbom.create
          OSV fan-out (per package)
               ↓
          prisma.finding.createMany
               ↓
    ┌──────────┴──────────┐
OPA evaluate           AI analyze
(with TS fallback)    (OpenAI or Fake)
    ↓                      ↓
prisma.policyDecision  prisma.aIExplanation
    ↓
Scan → COMPLETED
```

## Policy Engine

`packages/policy-engine/src/policy.ts`

- `OPAPolicyEngine`: Sends findings to `POST /v1/data/dsv/policy` on the OPA server.
- If OPA returns HTTP error or is unreachable, `evaluateFallback()` mirrors `policies/dsv.rego` exactly.
- Priority chain: FAIL (critical vulns / suspicious sandbox) > NEEDS_REVIEW (high / missing provenance) > WARN (medium) > PASS.

## Transitive Dependency Analysis

`packages/analyzers/src/dependencyParser.ts`

- Parses npm lockfile v1/v2/v3.
- v2/v3: reads the `packages` map with `node_modules/foo` keys.
- v1: reads the `dependencies` map.
- When a new lockfile is provided, all resolved package versions (direct + transitive) are diffed.
- Each changed package is flagged with `isDirect: boolean`.

## SBOM Export

`packages/analyzers/src/sbomExporter.ts`

- Outputs CycloneDX 1.4 JSON with a `dsv:isDirect` property per component.
- Stored in `Sbom` table as a JSON column; exposed via `GET /scans/:id/sbom`.

## Sandbox Runner

`packages/sandbox-runner/src/sandbox.ts`

- Pulls `node:18-alpine`, runs `npm install --no-save <pkg>@<version>` with:
  - `NetworkDisabled: true`
  - 256 MB memory cap
  - 50% CPU quota
- Collects stdout/stderr tail (4 KB cap per stream)
- Emits a `SCRIPT_EXECUTION` sandbox event with exit code and duration.
- Container is force-removed after completion.

## GitHub Webhook Flow

`packages/github/src/github.ts` + `apps/api/src/index.ts`

- `POST /webhooks` verifies HMAC-SHA256 signature via `@octokit/webhooks`.
- On `pull_request.opened / synchronize / reopened`:
  1. Upsert the repository in DB.
  2. Create a `Scan(PENDING, triggeredBy='github-webhook')`.
  3. Enqueue a scan job.
- PR comment posting via `GitHubAppService.createComment()` requires `GITHUB_TOKEN`.

## Security Boundaries

- Package names and versions are validated against safe-character allowlists before being passed to Docker.
- Sandbox containers run with no network access.
- Webhook payloads are HMAC-verified before any DB writes.
- AI output is schema-validated (Zod) before being stored.
- OPA policy is the authoritative decision-maker; AI is advisory only.
