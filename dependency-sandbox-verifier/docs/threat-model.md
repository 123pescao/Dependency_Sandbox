# Threat Model

## Assets

| Asset | Description |
|-------|-------------|
| Scan results | OSV findings, policy decisions, AI explanations |
| Repository records | Owner, name, URL |
| Findings | Linked vulnerabilities with evidence |
| Approvals | Human-reviewed overrides |
| SBOM data | CycloneDX package lists |

## Threat Actors

| Actor | Capability |
|-------|-----------|
| Malicious package author | Publishes a package with malicious `install` scripts |
| Supply-chain attacker | Typosquats or compromises a dependency |
| Unauthenticated API caller | Makes requests to the DSV API |
| GitHub bot / webhook replayer | Sends forged webhook events |

## Mitigations

### Sandbox isolation

- All `npm install` runs execute in a Docker container with:
  - `NetworkDisabled: true` — no outbound connections
  - 256 MB memory cap — prevents fork bombs
  - 50% CPU quota — prevents CPU exhaustion
  - `--no-save` flag — no writes to host filesystem
- Package name and version strings are validated against `/^(@[a-z0-9-~]...)$/i` before reaching Docker.

### Webhook security

- `POST /webhooks` validates `x-hub-signature-256` using `@octokit/webhooks` before any DB write.
- Missing `WEBHOOK_SECRET` causes the handler to throw at call time; the route returns 500.

### AI grounding

- The AI prompt explicitly instructs the model not to fabricate CVE IDs, package names, or severity scores.
- AI responses are validated against a Zod schema before being stored; malformed responses are rejected.
- AI never overrides the policy decision.

### Evidence traceability

- Every finding links to raw OSV evidence stored in the `evidence` JSON column.
- Policy decisions link to the specific finding and policy that produced them.
- Approvals link to the finding and the reviewer.

## Known Gaps

| Gap | Risk | Mitigation |
|-----|------|-----------|
| No API authentication | Any caller can submit scans or read results | Add API key or OAuth before exposing publicly |
| No rate limiting | API could be flooded with scan jobs | Add queue depth limit and per-IP rate limiting |
| GitHub file fetching not implemented | Webhook creates scan without manifest content | Set `newManifest` / `newLockfile` by fetching from GitHub API using `GITHUB_TOKEN` |
| Sandbox only runs `npm install` | Does not monitor filesystem or network at the process level | Integrate `strace` or eBPF-based syscall monitoring |
| Single OPA policy | One policy applies to all repositories | Add per-repository policy routing |
