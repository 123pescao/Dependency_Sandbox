import { Finding } from '@dsv/shared';

export type PolicyResultValue = 'PASS' | 'WARN' | 'FAIL' | 'NEEDS_REVIEW';
const VALID_RESULTS = new Set<PolicyResultValue>(['PASS', 'WARN', 'FAIL', 'NEEDS_REVIEW']);

export interface PolicyEngine {
  evaluate(findings: Finding[]): Promise<{ result: PolicyResultValue; details: object }>;
}

interface OPAQueryResponse {
  result?: { result?: string; details?: object };
}

export class OPAPolicyEngine implements PolicyEngine {
  private readonly opaUrl: string;

  constructor(opaUrl?: string) {
    this.opaUrl = (opaUrl ?? process.env.OPA_URL ?? 'http://localhost:8181') + '/v1/data/dsv/policy';
  }

  async evaluate(findings: Finding[]): Promise<{ result: PolicyResultValue; details: object }> {
    try {
      const res = await fetch(this.opaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: { findings } }),
        signal: AbortSignal.timeout(5_000),
      });

      if (!res.ok) throw new Error(`OPA HTTP ${res.status} ${res.statusText}`);

      const body = (await res.json()) as OPAQueryResponse;
      const rawResult = body.result?.result;
      const details = body.result?.details ?? {};

      if (!rawResult || !VALID_RESULTS.has(rawResult as PolicyResultValue)) {
        throw new Error(`OPA returned unexpected result value: ${JSON.stringify(rawResult)}`);
      }

      return { result: rawResult as PolicyResultValue, details };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[policy-engine] OPA unavailable (${msg}), using TypeScript fallback`);
      return evaluateFallback(findings);
    }
  }
}

// Mirrors policies/dsv.rego — keep in sync with any Rego changes.
export function evaluateFallback(findings: Finding[]): { result: PolicyResultValue; details: object } {
  let missingProvenance = false;
  let suspiciousSandbox = false;
  let critical_count = 0;
  let high_count = 0;
  let medium_count = 0;
  let low_count = 0;

  for (const f of findings) {
    if (f.severity === 'CRITICAL')          critical_count++;
    else if (f.severity === 'HIGH')         high_count++;
    else if (f.severity === 'MEDIUM')       medium_count++;
    else if (f.severity === 'LOW')          low_count++;
    if (f.type === 'PROVENANCE_MISSING')    missingProvenance = true;
    if (f.type === 'SANDBOX_SUSPICIOUS')    suspiciousSandbox = true;
  }

  const counts = { critical_count, high_count, medium_count, low_count, total_findings: findings.length, source: 'typescript-fallback' };

  if (critical_count > 0 || suspiciousSandbox) {
    return { result: 'FAIL', details: { ...counts, reason: critical_count > 0 ? 'Critical vulnerabilities present' : 'Suspicious sandbox behaviour' } };
  }
  if (high_count > 0 || missingProvenance) {
    return { result: 'NEEDS_REVIEW', details: { ...counts, reason: 'High-severity findings or missing provenance' } };
  }
  if (medium_count > 0) {
    return { result: 'WARN', details: { ...counts, reason: 'Medium-severity vulnerabilities present' } };
  }
  return { result: 'PASS', details: counts };
}
