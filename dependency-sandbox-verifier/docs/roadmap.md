# Roadmap

## Done (verified working)

- [x] Fastify 5 REST API (POST /repositories, POST /scans, GET /scans, GET /scans/:id, findings, policy, sbom, ai-explanation, evidence, dependency-diff)
- [x] POST /approvals — human review override
- [x] POST /webhooks — GitHub webhook with HMAC verification, triggers scan pipeline
- [x] BullMQ worker with async concurrency (SBOM+OSV in parallel, OPA+AI in parallel)
- [x] npm lockfile v1/v2/v3 transitive dependency analysis
- [x] CycloneDX 1.4 SBOM with `dsv:isDirect` property
- [x] OSV real vulnerability queries per package+version
- [x] OPA/Rego policy evaluation with TypeScript fallback
- [x] OpenAI GPT-4 AI explanation with Zod validation (FakeAIService default)
- [x] Docker sandbox with network isolation, memory/CPU caps
- [x] CLI: scan, diff, policy test, report, replay
- [x] Next.js 15 dashboard: scan list, scan detail, findings, policy, AI explanation, evidence
- [x] 0 npm audit vulnerabilities (fastify 5.8.5, next 15.5.15, @typescript-eslint 8.x)
- [x] 36/36 unit tests passing

## Near term

- [ ] API authentication (API key or JWT)
- [ ] GitHub file fetching in webhook handler (fetch package.json/lockfile from PR head/base)
- [ ] PR comment posting on scan completion via GitHubAppService
- [ ] Per-request rate limiting
- [ ] Structured logging with correlation IDs

## Medium term

- [ ] PYPI ecosystem support (pip requirements.txt + PyPI advisory database)
- [ ] SPDX SBOM format export
- [ ] Baseline snapshots — compare new scans against approved package sets
- [ ] Sandbox syscall monitoring (strace / eBPF) for deeper behavioural analysis
- [ ] Per-repository OPA policy routing

## Long term

- [ ] CARGO / MAVEN ecosystem support
- [ ] SLSA provenance attestation verification
- [ ] npm/PyPI provenance attestation via Sigstore
- [ ] Multi-tenant API with RBAC
- [ ] Webhook for Slack / PagerDuty on policy FAIL
