import { DependencyChange } from '@dsv/shared';

export interface SBOMExporter {
  exportCycloneDX(changes: DependencyChange[], metadata?: Record<string, unknown>): string;
}

const ECOSYSTEM_PURL: Record<string, string> = {
  NPM: 'npm',
  PYPI: 'pypi',
  CARGO: 'cargo',
  MAVEN: 'maven',
};

export class CycloneDXExporter implements SBOMExporter {
  exportCycloneDX(changes: DependencyChange[], metadata?: Record<string, unknown>): string {
    // REMOVED packages are not present in the new state; exclude them.
    const present = changes.filter(c => c.changeType !== 'REMOVED');

    const components = present.map(change => {
      const purlType = ECOSYSTEM_PURL[change.ecosystem] ?? 'generic';
      const version = change.newVersion ?? change.previousVersion;
      const component: Record<string, unknown> = {
        type: 'library',
        name: change.packageName,
        version,
        purl: version
          ? `pkg:${purlType}/${change.packageName}@${version}`
          : `pkg:${purlType}/${change.packageName}`,
      };
      // Track direct vs transitive for consumers of the SBOM
      if (change.isDirect !== undefined) {
        component['properties'] = [
          { name: 'dsv:isDirect', value: String(change.isDirect) },
        ];
      }
      return component;
    });

    const sbom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.4',
      version: 1,
      metadata: {
        timestamp: new Date().toISOString(),
        ...(metadata ?? {}),
      },
      components,
    };

    return JSON.stringify(sbom, null, 2);
  }
}
