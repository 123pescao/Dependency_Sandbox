import { OPAPolicyEngine, evaluateFallback } from './policy';
import { Finding } from '@dsv/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    type: 'VULNERABILITY',
    severity: 'LOW',
    title: 'test',
    description: '',
    evidence: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TypeScript fallback — does not need OPA running
// ---------------------------------------------------------------------------

describe('evaluateFallback', () => {
  it('returns PASS for empty findings', async () => {
    const r = evaluateFallback([]);
    expect(r.result).toBe('PASS');
  });

  it('returns WARN for MEDIUM severity', async () => {
    const r = evaluateFallback([finding({ severity: 'MEDIUM' })]);
    expect(r.result).toBe('WARN');
  });

  it('returns NEEDS_REVIEW for HIGH severity', async () => {
    const r = evaluateFallback([finding({ severity: 'HIGH' })]);
    expect(r.result).toBe('NEEDS_REVIEW');
  });

  it('returns NEEDS_REVIEW for missing provenance', async () => {
    const r = evaluateFallback([finding({ type: 'PROVENANCE_MISSING', severity: 'LOW' })]);
    expect(r.result).toBe('NEEDS_REVIEW');
  });

  it('returns FAIL for CRITICAL severity', async () => {
    const r = evaluateFallback([finding({ severity: 'CRITICAL' })]);
    expect(r.result).toBe('FAIL');
  });

  it('returns FAIL for SANDBOX_SUSPICIOUS', async () => {
    const r = evaluateFallback([finding({ type: 'SANDBOX_SUSPICIOUS', severity: 'HIGH' })]);
    expect(r.result).toBe('FAIL');
  });

  it('FAIL takes priority over HIGH', async () => {
    const r = evaluateFallback([
      finding({ severity: 'CRITICAL' }),
      finding({ severity: 'HIGH' }),
    ]);
    expect(r.result).toBe('FAIL');
  });

  it('includes severity counts in details', async () => {
    const r = evaluateFallback([
      finding({ severity: 'CRITICAL' }),
      finding({ severity: 'HIGH' }),
      finding({ severity: 'MEDIUM' }),
    ]);
    expect((r.details as any).critical_count).toBe(1);
    expect((r.details as any).high_count).toBe(1);
    expect((r.details as any).medium_count).toBe(1);
    expect((r.details as any).total_findings).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// OPAPolicyEngine — test fallback path when OPA is not reachable
// ---------------------------------------------------------------------------

describe('OPAPolicyEngine', () => {
  it('falls back to TypeScript rules when OPA is unreachable', async () => {
    // Point at a port nothing is listening on
    const engine = new OPAPolicyEngine('http://localhost:19999');
    const result = await engine.evaluate([finding({ severity: 'CRITICAL' })]);
    expect(result.result).toBe('FAIL');
  });

  it('falls back gracefully and still returns a valid result', async () => {
    const engine = new OPAPolicyEngine('http://localhost:19999');
    const result = await engine.evaluate([]);
    expect(['PASS', 'WARN', 'FAIL', 'NEEDS_REVIEW']).toContain(result.result);
  });

  it('uses OPA result when server responds correctly', async () => {
    // Mock global fetch to simulate a live OPA response
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: { result: 'WARN', details: { total_findings: 1 } },
      }),
    } as any);

    const engine = new OPAPolicyEngine('http://fake-opa:8181');
    const result = await engine.evaluate([finding({ severity: 'MEDIUM' })]);
    expect(result.result).toBe('WARN');
    expect((result.details as any).total_findings).toBe(1);

    global.fetch = originalFetch;
  });

  it('falls back when OPA returns unexpected result value', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: { result: 'UNKNOWN_VALUE' } }),
    } as any);

    const engine = new OPAPolicyEngine('http://fake-opa:8181');
    // Should not throw — falls back to TypeScript rules
    const result = await engine.evaluate([finding({ severity: 'HIGH' })]);
    expect(['PASS', 'WARN', 'FAIL', 'NEEDS_REVIEW']).toContain(result.result);

    global.fetch = originalFetch;
  });

  it('falls back when OPA returns HTTP error', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    } as any);

    const engine = new OPAPolicyEngine('http://fake-opa:8181');
    const result = await engine.evaluate([finding({ severity: 'CRITICAL' })]);
    expect(result.result).toBe('FAIL');

    global.fetch = originalFetch;
  });
});
