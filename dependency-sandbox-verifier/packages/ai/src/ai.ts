import OpenAI from 'openai/index.mjs';
import { z } from 'zod';
import { EvidencePacket, AIResponse } from '@dsv/shared';

export const AIResponseSchema = z.object({
  executiveSummary: z.string().min(1),
  technicalSummary: z.string().min(1),
  rationale: z.string().min(1),
  confidence: z.number().min(0).max(1),
  remediation: z.object({
    suggestions: z.array(z.string()),
    alternatives: z.array(z.object({ package: z.string(), reason: z.string() })).optional(),
  }),
  policySuggestions: z.array(z.string()).optional(),
});

export interface AIService {
  analyze(evidence: EvidencePacket): Promise<AIResponse>;
}

export class OpenAIService implements AIService {
  private _client: OpenAI | null = null;

  private get client(): OpenAI {
    if (!this._client) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OPENAI_API_KEY environment variable is required');
      this._client = new OpenAI({ apiKey });
    }
    return this._client;
  }

  async analyze(evidence: EvidencePacket): Promise<AIResponse> {
    const prompt = `You are a supply-chain security analyst. Analyze the dependency change evidence below and return a JSON object.

Evidence (do NOT invent facts beyond what is provided here):
${JSON.stringify(evidence)}

Return a JSON object with exactly these fields:
- executiveSummary: string — one to three sentences for a non-technical audience
- technicalSummary: string — detailed technical analysis grounded in the evidence
- rationale: string — why the findings matter to this specific change
- confidence: number between 0.0 and 1.0
- remediation: { suggestions: string[], alternatives?: [{ package: string, reason: string }] }
- policySuggestions?: string[]

Base everything strictly on the provided evidence. Do not fabricate CVE IDs, package names, or severity scores.`;

    const response = await this.client.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from OpenAI');

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error(`OpenAI returned non-JSON content: ${content.slice(0, 200)}`);
    }

    const result = AIResponseSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`OpenAI response failed schema validation: ${result.error.message}`);
    }
    return result.data;
  }
}

export class FakeAIService implements AIService {
  async analyze(evidence: EvidencePacket): Promise<AIResponse> {
    const { dependencyChanges, vulnerabilities, findings } = evidence;

    // Single pass over each array
    const added: string[] = [];
    const updated: string[] = [];
    const removed: string[] = [];
    for (const c of dependencyChanges) {
      if (c.changeType === 'ADDED')   added.push(c.packageName);
      else if (c.changeType === 'UPDATED') updated.push(c.packageName);
      else                            removed.push(c.packageName);
    }

    let critCount = 0, highCount = 0, medCount = 0;
    for (const f of findings) {
      if (f.severity === 'CRITICAL')     critCount++;
      else if (f.severity === 'HIGH')    highCount++;
      else if (f.severity === 'MEDIUM')  medCount++;
    }

    const vulnCount = vulnerabilities.length;
    const severityLabel = critCount ? 'CRITICAL' : highCount ? 'HIGH' : medCount ? 'MEDIUM' : 'no notable';

    const summaryParts: string[] = [];
    if (added.length)   summaryParts.push(`${added.length} package(s) added: ${added.slice(0, 3).join(', ')}`);
    if (updated.length) summaryParts.push(`${updated.length} package(s) updated: ${updated.slice(0, 3).join(', ')}`);
    if (removed.length) summaryParts.push(`${removed.length} package(s) removed: ${removed.slice(0, 3).join(', ')}`);

    const suggestions: string[] = [];
    if (critCount) suggestions.push('Immediately address all CRITICAL vulnerabilities before merging.');
    if (highCount) suggestions.push('Review HIGH-severity findings and obtain team sign-off.');
    if (added.length) suggestions.push(`Verify the provenance and security posture of newly added packages: ${added.join(', ')}.`);
    if (!suggestions.length) suggestions.push('No immediate action required; continue regular security monitoring.');

    return {
      executiveSummary: `[STUB — FakeAIService] ${summaryParts.join('. ') || 'No dependency changes detected.'}. ${vulnCount} vulnerability/vulnerabilities found with ${severityLabel} severity.`,
      technicalSummary: `[STUB] Changes: ${dependencyChanges.length} total (${added.length} added, ${updated.length} updated, ${removed.length} removed). OSV returned ${vulnCount} vulnerability records. Severity breakdown: CRITICAL=${critCount}, HIGH=${highCount}, MEDIUM=${medCount}.`,
      rationale: `[STUB] Risk is ${critCount ? 'critical — immediate action required' : highCount ? 'high — human review required' : medCount ? 'moderate — monitor closely' : 'low for this change set'}.`,
      confidence: critCount || highCount ? 0.9 : medCount ? 0.75 : 0.6,
      remediation: { suggestions },
      policySuggestions: critCount || highCount
        ? ['Consider blocking merges with CRITICAL or HIGH vulnerabilities until resolved.']
        : undefined,
    };
  }
}

export function createAIService(): AIService {
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'not-configured') {
    console.log('[ai] OpenAI API key found — using OpenAIService');
    return new OpenAIService();
  }
  console.log('[ai] No OPENAI_API_KEY — using FakeAIService (stub/fallback)');
  return new FakeAIService();
}
