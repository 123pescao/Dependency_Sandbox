export interface DependencyChange {
  packageName: string;
  previousVersion?: string;
  newVersion?: string;
  changeType: 'ADDED' | 'REMOVED' | 'UPDATED';
  ecosystem: 'NPM' | 'PYPI' | 'CARGO' | 'MAVEN';
  /** true = declared in package.json; false = transitive (from lockfile) */
  isDirect?: boolean;
}

export interface Vulnerability {
  id: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  summary: string;
  details?: string;
  affectedVersions?: string;
  fixedVersions?: string;
  references?: string[];
}

export interface Attestation {
  type: 'GITHUB_ARTIFACT' | 'SIGSTORE' | 'NPM_PROVENANCE' | 'PYPI_ATTESTATION';
  verified: boolean;
  evidence: any;
}

export interface SandboxEvent {
  eventType: 'PROCESS_SPAWN' | 'FILE_WRITE' | 'NETWORK_ACCESS' | 'SCRIPT_EXECUTION' | 'ENVIRONMENT_ACCESS';
  timestamp: Date;
  details: any;
}

export interface Finding {
  type: 'VULNERABILITY' | 'PROVENANCE_MISSING' | 'SANDBOX_SUSPICIOUS' | 'POLICY_VIOLATION' | 'LICENSE_ISSUE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  evidence: any;
  packageName?: string;
  version?: string;
}

export interface EvidencePacket {
  dependencyChanges: DependencyChange[];
  vulnerabilities: Vulnerability[];
  attestations: Attestation[];
  sandboxEvents: SandboxEvent[];
  findings: Finding[];
}

export interface AIResponse {
  executiveSummary: string;
  technicalSummary: string;
  rationale: string;
  confidence: number;
  remediation: {
    suggestions: string[];
    alternatives?: { package: string; reason: string }[];
  };
  policySuggestions?: string[];
}