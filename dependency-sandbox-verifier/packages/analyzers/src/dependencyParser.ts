import { DependencyChange } from '@dsv/shared';

export interface DependencyParser {
  parseDiff(oldManifest: string, newManifest: string, oldLockfile?: string, newLockfile?: string): DependencyChange[];
}

interface LockfilePackages {
  [path: string]: {
    version?: string;
    resolved?: string;
    dev?: boolean;
    peer?: boolean;
    optional?: boolean;
    dependencies?: Record<string, string>;
  };
}

interface Lockfile {
  lockfileVersion?: number;
  packages?: LockfilePackages;
  dependencies?: Record<string, { version: string; resolved?: string }>;
}

function parseLockfile(content: string): Record<string, string> {
  try {
    const lock: Lockfile = JSON.parse(content);
    const result: Record<string, string> = {};

    // v2/v3: packages field uses "node_modules/foo" keys
    if (lock.packages) {
      for (const [key, pkg] of Object.entries(lock.packages)) {
        if (!key) continue;
        const name = key.replace(/^node_modules\//, '').replace(/\/node_modules\//g, '/');
        if (pkg.version) result[name] = pkg.version;
      }
      return result;
    }

    // v1 fallback
    if (lock.dependencies) {
      for (const [name, dep] of Object.entries(lock.dependencies)) {
        if (dep.version) result[name] = dep.version;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function parsePackageJsonDeps(content: string): Record<string, string> {
  try {
    const json = JSON.parse(content);
    return { ...json.dependencies, ...json.devDependencies };
  } catch (err) {
    console.warn('dependencyParser: failed to parse package.json:', err);
    return {};
  }
}

// Shared change-detection logic used for both direct and transitive deps.
// Returns undefined when no change occurred (versions identical or both absent).
function classifyChange(
  name: string,
  oldVer: string | undefined,
  newVer: string | undefined,
  isDirect: boolean,
): DependencyChange | undefined {
  if (!oldVer && newVer)                     return { packageName: name, newVersion: newVer, changeType: 'ADDED', ecosystem: 'NPM', isDirect };
  if (oldVer && !newVer)                     return { packageName: name, previousVersion: oldVer, changeType: 'REMOVED', ecosystem: 'NPM', isDirect };
  if (oldVer && newVer && oldVer !== newVer) return { packageName: name, previousVersion: oldVer, newVersion: newVer, changeType: 'UPDATED', ecosystem: 'NPM', isDirect };
  return undefined;
}

export class NpmDependencyParser implements DependencyParser {
  parseDiff(
    oldManifest: string,
    newManifest: string,
    oldLockfile?: string,
    newLockfile?: string,
  ): DependencyChange[] {
    const oldDirect = parsePackageJsonDeps(oldManifest);
    const newDirect = parsePackageJsonDeps(newManifest);
    const oldResolved = oldLockfile ? parseLockfile(oldLockfile) : oldDirect;
    const newResolved = newLockfile ? parseLockfile(newLockfile) : newDirect;

    const changes: DependencyChange[] = [];
    const seen = new Set<string>();

    // Direct dependencies (always included)
    const allDirectNames = new Set([...Object.keys(newDirect), ...Object.keys(oldDirect)]);
    for (const name of allDirectNames) {
      seen.add(name);
      const change = classifyChange(
        name,
        oldResolved[name] ?? oldDirect[name],
        newResolved[name] ?? newDirect[name],
        true,
      );
      if (change) changes.push(change);
    }

    // Transitive dependencies (lockfile only)
    if (oldLockfile && newLockfile) {
      const allResolved = new Set([...Object.keys(oldResolved), ...Object.keys(newResolved)]);
      for (const name of allResolved) {
        if (seen.has(name)) continue;
        seen.add(name);
        const change = classifyChange(name, oldResolved[name], newResolved[name], false);
        if (change) changes.push(change);
      }
    }

    return changes;
  }
}
