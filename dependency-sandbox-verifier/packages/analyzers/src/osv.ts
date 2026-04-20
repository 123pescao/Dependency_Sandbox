import axios from 'axios';
import { Vulnerability } from '@dsv/shared';

export interface VulnerabilityAnalyzer {
  // ecosystem: OSV ecosystem string, e.g. 'npm', 'PyPI', 'crates.io', 'Maven'
  query(packageName: string, version?: string, ecosystem?: string): Promise<Vulnerability[]>;
}

export class OSVAnalyzer implements VulnerabilityAnalyzer {
  private readonly baseUrl = 'https://api.osv.dev/v1';

  // Throws on network/API errors so callers can decide how to handle them.
  // Returns an empty array only when the API reports no vulnerabilities.
  async query(packageName: string, version?: string, ecosystem = 'npm'): Promise<Vulnerability[]> {
    const response = await axios.post(
      `${this.baseUrl}/query`,
      { package: { name: packageName, ecosystem }, version },
      { timeout: 10_000 },
    );

    if (!response.data?.vulns) return [];

    return response.data.vulns.map((vuln: any) => ({
      id: vuln.id,
      severity: this.mapSeverity(vuln),
      summary: vuln.summary ?? vuln.id,
      details: vuln.details,
      affectedVersions: this.extractAffectedVersions(vuln),
      fixedVersions: vuln.affected?.[0]?.ranges?.[0]?.events
        ?.find((e: any) => e.fixed)?.fixed,
      references: vuln.references?.map((r: any) => r.url),
    }));
  }

  private extractAffectedVersions(vuln: any): string | undefined {
    const events: Array<{ introduced?: string; fixed?: string }> =
      vuln.affected?.[0]?.ranges?.[0]?.events ?? [];
    const introduced = events.find(e => e.introduced)?.introduced;
    const fixed = events.find(e => e.fixed)?.fixed;
    if (!introduced && !fixed) return undefined;
    return [introduced && `introduced: ${introduced}`, fixed && `fixed: ${fixed}`]
      .filter(Boolean)
      .join(', ');
  }

  private mapSeverity(vuln: any): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    // 1. database_specific.severity (GitHub Advisory, etc.)
    const dbSev = vuln.database_specific?.severity?.toUpperCase() as string | undefined;
    if (dbSev) {
      if (dbSev === 'CRITICAL') return 'CRITICAL';
      if (dbSev === 'HIGH') return 'HIGH';
      if (dbSev === 'MODERATE' || dbSev === 'MEDIUM') return 'MEDIUM';
      if (dbSev === 'LOW') return 'LOW';
    }

    // 2. CVSS base score from the severity array
    const cvssEntry = vuln.severity?.find(
      (s: any) => s.type === 'CVSS_V3' || s.type === 'CVSS_V2',
    );
    if (cvssEntry?.score) {
      const match = cvssEntry.score.match(/\/(\d+\.\d+)$/);
      if (!match) {
        // score might be a plain number
        const score = parseFloat(cvssEntry.score);
        if (!isNaN(score)) return this.cvssToSeverity(score);
      } else {
        return this.cvssToSeverity(parseFloat(match[1]));
      }
    }

    return 'MEDIUM';
  }

  private cvssToSeverity(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (score >= 9.0) return 'CRITICAL';
    if (score >= 7.0) return 'HIGH';
    if (score >= 4.0) return 'MEDIUM';
    return 'LOW';
  }
}
