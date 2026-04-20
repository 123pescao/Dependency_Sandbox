import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';

interface Finding {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  packageName: string | null;
  version: string | null;
  resolved: boolean;
}

interface PolicyDecision {
  id: string;
  result: string;
  details: Record<string, unknown>;
  createdAt: string;
}

interface EvidenceItem {
  findingId: string;
  packageName: string;
  version: string;
  type: string;
  severity: string;
  raw: unknown;
}

interface EvidenceResponse {
  scanId: string;
  count: number;
  evidence: EvidenceItem[];
}

interface AIExplanation {
  executiveSummary: string;
  technicalSummary: string;
  rationale: string;
  confidence: number;
  remediation: { suggestions: string[]; alternatives?: { package: string; reason: string }[] };
  policySuggestions?: string[];
}

interface Scan {
  id: string;
  repositoryId: string;
  status: string;
  triggeredBy: string;
  prNumber: number | null;
  createdAt: string;
  completedAt: string | null;
  findings: Finding[];
}

function Badge({ v }: { v: string }) {
  return <span className={`badge badge-${v}`}>{v}</span>;
}

function SeverityBadge({ s }: { s: string }) {
  const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  void order;
  return <span className={`badge badge-${s}`}>{s}</span>;
}

export default function ScanDetailPage() {
  const router = useRouter();
  const { id } = router.query as { id: string };

  const [scan, setScan] = useState<Scan | null>(null);
  const [policy, setPolicy] = useState<PolicyDecision[]>([]);
  const [ai, setAI] = useState<AIExplanation | null>(null);
  const [evidence, setEvidence] = useState<EvidenceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);

    Promise.all([
      fetch(`/api/scans/${id}`).then(r => r.json() as Promise<Scan>),
      fetch(`/api/scans/${id}/policy`).then(r => r.json() as Promise<PolicyDecision[]>),
      fetch(`/api/scans/${id}/ai-explanation`).then(r => r.json() as Promise<AIExplanation | null>),
      fetch(`/api/scans/${id}/evidence`).then(r => r.ok ? r.json() as Promise<EvidenceResponse> : null),
    ])
      .then(([scanData, policyData, aiData, evidenceData]) => {
        if ((scanData as any).error) throw new Error((scanData as any).error);
        setScan(scanData);
        setPolicy(policyData ?? []);
        setAI(aiData);
        setEvidence(evidenceData);
        setLoading(false);
      })
      .catch(err => {
        setError(String(err));
        setLoading(false);
      });
  }, [id]);

  if (loading) return <div className="loading">Loading scan…</div>;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!scan) return null;

  const critCount = scan.findings.filter(f => f.severity === 'CRITICAL').length;
  const highCount = scan.findings.filter(f => f.severity === 'HIGH').length;
  const medCount  = scan.findings.filter(f => f.severity === 'MEDIUM').length;
  const lowCount  = scan.findings.filter(f => f.severity === 'LOW').length;

  // Best policy result from decisions
  const policyResult = policy[0]?.result ?? (scan.status === 'COMPLETED' ? 'PASS' : '—');

  return (
    <>
      <Link href="/" className="back">← All Scans</Link>

      <div className="page-header">
        <h1 style={{ fontFamily: 'monospace', fontSize: '1.2rem' }}>{scan.id}</h1>
        <p>
          <Badge v={scan.status} />
          {scan.prNumber && <span style={{ marginLeft: '0.5rem', color: '#64748b' }}>PR #{scan.prNumber}</span>}
          <span style={{ marginLeft: '0.5rem', color: '#64748b' }}>{new Date(scan.createdAt).toLocaleString()}</span>
        </p>
      </div>

      {/* Stats row */}
      <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
        <div className="stat">
          <div className="label">Policy Result</div>
          <div className="value"><Badge v={policyResult} /></div>
        </div>
        <div className="stat">
          <div className="label">Findings</div>
          <div className="value">{scan.findings.length}</div>
        </div>
        <div className="stat">
          <div className="label">Critical / High</div>
          <div className="value">{critCount} / {highCount}</div>
        </div>
        <div className="stat">
          <div className="label">Medium / Low</div>
          <div className="value">{medCount} / {lowCount}</div>
        </div>
      </div>

      {/* AI Explanation */}
      {ai && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2>AI Analysis <span style={{ color: '#1e3a5f', background: '#93c5fd22', padding: '1px 6px', borderRadius: 4, fontSize: '.65rem' }}>{ai.executiveSummary.startsWith('[STUB') ? 'STUB/FALLBACK' : 'AI'}</span></h2>
          <p style={{ marginBottom: '.75rem' }}>{ai.executiveSummary}</p>
          <details>
            <summary style={{ cursor: 'pointer', color: '#64748b', fontSize: '.85rem' }}>Technical details</summary>
            <div style={{ marginTop: '.75rem' }}>
              <p style={{ color: '#94a3b8', marginBottom: '.5rem' }}>{ai.technicalSummary}</p>
              <p style={{ color: '#94a3b8', marginBottom: '.5rem' }}><strong>Rationale:</strong> {ai.rationale}</p>
              <p style={{ color: '#94a3b8', marginBottom: '.5rem' }}><strong>Confidence:</strong> {Math.round(ai.confidence * 100)}%</p>
              {ai.remediation.suggestions.length > 0 && (
                <ul style={{ paddingLeft: '1.25rem', color: '#94a3b8' }}>
                  {ai.remediation.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              )}
            </div>
          </details>
        </div>
      )}

      {/* Policy decisions */}
      {policy.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2>Policy Decisions</h2>
          <table>
            <thead>
              <tr><th>Result</th><th>Details</th><th>Evaluated At</th></tr>
            </thead>
            <tbody>
              {policy.slice(0, 5).map(pd => (
                <tr key={pd.id}>
                  <td><Badge v={pd.result} /></td>
                  <td><pre style={{ fontSize: '.75rem', maxHeight: 120 }}>{JSON.stringify(pd.details, null, 2)}</pre></td>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '.8rem' }}>{new Date(pd.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {policy.length > 5 && <p style={{ color: '#64748b', fontSize: '.8rem', marginTop: '.5rem' }}>…and {policy.length - 5} more</p>}
        </div>
      )}

      {/* Evidence */}
      {evidence && evidence.count > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2>Evidence Summary ({evidence.count} item{evidence.count !== 1 ? 's' : ''})</h2>
          <table>
            <thead>
              <tr><th>Package</th><th>Version</th><th>Type</th><th>Severity</th></tr>
            </thead>
            <tbody>
              {evidence.evidence.slice(0, 10).map(e => (
                <tr key={e.findingId}>
                  <td style={{ fontFamily: 'monospace', fontSize: '.8rem' }}>{e.packageName}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '.8rem' }}>{e.version}</td>
                  <td style={{ fontSize: '.75rem', color: '#64748b' }}>{e.type}</td>
                  <td><SeverityBadge s={e.severity} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {evidence.count > 10 && <p style={{ color: '#64748b', fontSize: '.8rem', marginTop: '.5rem' }}>…and {evidence.count - 10} more</p>}
        </div>
      )}

      {/* Findings */}
      <div className="card">
        <h2>Findings ({scan.findings.length})</h2>
        {scan.findings.length === 0 ? (
          <p style={{ color: '#64748b' }}>No findings — clean scan.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Severity</th><th>Type</th><th>Package</th><th>Title</th></tr>
            </thead>
            <tbody>
              {scan.findings.map(f => (
                <tr key={f.id}>
                  <td><SeverityBadge s={f.severity} /></td>
                  <td style={{ fontSize: '.75rem', color: '#64748b' }}>{f.type}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '.8rem' }}>
                    {f.packageName ? `${f.packageName}@${f.version ?? '?'}` : '—'}
                  </td>
                  <td style={{ fontSize: '.85rem' }}>
                    <details>
                      <summary style={{ cursor: 'pointer' }}>{f.title}</summary>
                      <p style={{ marginTop: '.5rem', color: '#94a3b8', fontSize: '.8rem' }}>{f.description?.slice(0, 400)}{f.description?.length > 400 ? '…' : ''}</p>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
