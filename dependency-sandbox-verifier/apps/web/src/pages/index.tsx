import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface Scan {
  id: string;
  repositoryId: string;
  status: string;
  triggeredBy: string;
  prNumber: number | null;
  createdAt: string;
  completedAt: string | null;
}

interface ScansResponse {
  data: Scan[];
  total: number;
  page: number;
  limit: number;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}

export default function ScansPage() {
  const [scans, setScans] = useState<Scan[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const limit = 20;

  useEffect(() => {
    setLoading(true);
    fetch(`/api/scans?page=${page}&limit=${limit}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ScansResponse>;
      })
      .then(data => {
        setScans(data.data);
        setTotal(data.total);
        setLoading(false);
      })
      .catch(err => {
        setError(String(err));
        setLoading(false);
      });
  }, [page]);

  const totalPages = Math.ceil(total / limit);

  return (
    <>
      <div className="page-header">
        <h1>Dependency Scans</h1>
        <p>{total} scan{total !== 1 ? 's' : ''} in database</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading">Loading scans…</div>
      ) : scans.length === 0 ? (
        <div className="alert alert-info">No scans yet. POST to /scans to create one.</div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Status</th>
                <th>Triggered By</th>
                <th>PR</th>
                <th>Created</th>
                <th>Completed</th>
              </tr>
            </thead>
            <tbody>
              {scans.map(scan => (
                <tr key={scan.id}>
                  <td>
                    <Link href={`/scans/${scan.id}`} style={{ fontFamily: 'monospace', fontSize: '.8rem' }}>
                      {scan.id.slice(0, 16)}…
                    </Link>
                  </td>
                  <td><StatusBadge status={scan.status} /></td>
                  <td>{scan.triggeredBy}</td>
                  <td>{scan.prNumber ?? '—'}</td>
                  <td>{new Date(scan.createdAt).toLocaleString()}</td>
                  <td>{scan.completedAt ? new Date(scan.completedAt).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ padding: '0.4rem 0.8rem', background: '#2d3142', border: 'none', borderRadius: 4, color: '#e2e8f0', cursor: 'pointer' }}
          >
            ← Prev
          </button>
          <span style={{ padding: '0.4rem 0.8rem', color: '#64748b' }}>
            Page {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{ padding: '0.4rem 0.8rem', background: '#2d3142', border: 'none', borderRadius: 4, color: '#e2e8f0', cursor: 'pointer' }}
          >
            Next →
          </button>
        </div>
      )}
    </>
  );
}
