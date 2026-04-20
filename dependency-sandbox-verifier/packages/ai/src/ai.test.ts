import { FakeAIService, OpenAIService, createAIService, AIResponseSchema } from './ai';
import { EvidencePacket } from '@dsv/shared';

const emptyEvidence: EvidencePacket = {
  dependencyChanges: [],
  vulnerabilities: [],
  attestations: [],
  sandboxEvents: [],
  findings: [],
};

const richEvidence: EvidencePacket = {
  dependencyChanges: [
    { packageName: 'lodash', newVersion: '4.17.21', changeType: 'UPDATED', ecosystem: 'NPM' },
    { packageName: 'axios',  newVersion: '1.6.0',   changeType: 'ADDED',   ecosystem: 'NPM' },
  ],
  vulnerabilities: [
    { id: 'GHSA-test-0001', severity: 'HIGH',   summary: 'Prototype pollution in lodash', details: 'Details here' },
    { id: 'GHSA-test-0002', severity: 'MEDIUM', summary: 'SSRF in axios',                 details: 'SSRF details' },
  ],
  attestations: [],
  sandboxEvents: [],
  findings: [
    { type: 'VULNERABILITY', severity: 'HIGH',   title: 'Prototype pollution', description: '', evidence: {} },
    { type: 'VULNERABILITY', severity: 'MEDIUM', title: 'SSRF',                description: '', evidence: {} },
  ],
};

// ---------------------------------------------------------------------------
// AIResponseSchema
// ---------------------------------------------------------------------------

describe('AIResponseSchema', () => {
  it('accepts a valid response', () => {
    const valid = {
      executiveSummary: 'Summary',
      technicalSummary: 'Technical',
      rationale: 'Rationale',
      confidence: 0.8,
      remediation: { suggestions: ['upgrade lodash'] },
    };
    expect(AIResponseSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects missing required fields', () => {
    expect(AIResponseSchema.safeParse({ executiveSummary: 'only this' }).success).toBe(false);
  });

  it('rejects confidence out of range', () => {
    const bad = {
      executiveSummary: 'x', technicalSummary: 'x', rationale: 'x',
      confidence: 1.5,
      remediation: { suggestions: [] },
    };
    expect(AIResponseSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects empty executiveSummary', () => {
    const bad = {
      executiveSummary: '', technicalSummary: 'x', rationale: 'x',
      confidence: 0.5,
      remediation: { suggestions: [] },
    };
    expect(AIResponseSchema.safeParse(bad).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FakeAIService
// ---------------------------------------------------------------------------

describe('FakeAIService', () => {
  const svc = new FakeAIService();

  it('returns valid schema for empty evidence', async () => {
    const result = await svc.analyze(emptyEvidence);
    expect(AIResponseSchema.safeParse(result).success).toBe(true);
  });

  it('returns valid schema for rich evidence', async () => {
    const result = await svc.analyze(richEvidence);
    expect(AIResponseSchema.safeParse(result).success).toBe(true);
  });

  it('references actual package names in summaries', async () => {
    const result = await svc.analyze(richEvidence);
    expect(result.executiveSummary).toMatch(/lodash|axios/);
  });

  it('reflects vulnerability count in technical summary', async () => {
    const result = await svc.analyze(richEvidence);
    expect(result.technicalSummary).toMatch(/2/); // 2 vulnerabilities
  });

  it('confidence is between 0 and 1', async () => {
    const result = await svc.analyze(richEvidence);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('remediation suggestions are non-empty for HIGH findings', async () => {
    const result = await svc.analyze(richEvidence);
    expect(result.remediation.suggestions.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// createAIService factory
// ---------------------------------------------------------------------------

describe('createAIService', () => {
  const origKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (origKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = origKey;
  });

  it('returns FakeAIService when OPENAI_API_KEY is not set', () => {
    delete process.env.OPENAI_API_KEY;
    const svc = createAIService();
    expect(svc).toBeInstanceOf(FakeAIService);
  });

  it('returns FakeAIService when OPENAI_API_KEY is "not-configured"', () => {
    process.env.OPENAI_API_KEY = 'not-configured';
    const svc = createAIService();
    expect(svc).toBeInstanceOf(FakeAIService);
  });

  it('returns OpenAIService when a real key is set', () => {
    process.env.OPENAI_API_KEY = 'sk-test-1234567890abcdef';
    const svc = createAIService();
    expect(svc).toBeInstanceOf(OpenAIService);
  });
});
