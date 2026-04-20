import { NpmDependencyParser } from './dependencyParser';

describe('NpmDependencyParser', () => {
  const parser = new NpmDependencyParser();

  // ---------------------------------------------------------------------------
  // Direct dependency diff (no lockfile)
  // ---------------------------------------------------------------------------

  it('should detect added dependencies', () => {
    const oldManifest = JSON.stringify({ dependencies: { 'lodash': '4.17.20' } });
    const newManifest = JSON.stringify({ dependencies: { 'lodash': '4.17.20', 'axios': '1.6.0' } });

    const changes = parser.parseDiff(oldManifest, newManifest);

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      packageName: 'axios',
      newVersion: '1.6.0',
      changeType: 'ADDED',
      ecosystem: 'NPM',
      isDirect: true,
    });
  });

  it('should detect updated dependencies', () => {
    const oldManifest = JSON.stringify({ dependencies: { 'lodash': '4.17.20' } });
    const newManifest = JSON.stringify({ dependencies: { 'lodash': '4.17.21' } });

    const changes = parser.parseDiff(oldManifest, newManifest);

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      packageName: 'lodash',
      previousVersion: '4.17.20',
      newVersion: '4.17.21',
      changeType: 'UPDATED',
      ecosystem: 'NPM',
      isDirect: true,
    });
  });

  it('should detect removed dependencies', () => {
    const oldManifest = JSON.stringify({ dependencies: { 'lodash': '4.17.20', 'axios': '1.6.0' } });
    const newManifest = JSON.stringify({ dependencies: { 'lodash': '4.17.20' } });

    const changes = parser.parseDiff(oldManifest, newManifest);

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      packageName: 'axios',
      previousVersion: '1.6.0',
      changeType: 'REMOVED',
      ecosystem: 'NPM',
      isDirect: true,
    });
  });

  it('should return no changes for identical manifests', () => {
    const manifest = JSON.stringify({ dependencies: { 'lodash': '4.17.21' } });
    expect(parser.parseDiff(manifest, manifest)).toHaveLength(0);
  });

  it('should handle devDependencies', () => {
    const oldManifest = JSON.stringify({ devDependencies: { 'jest': '29.0.0' } });
    const newManifest = JSON.stringify({ devDependencies: { 'jest': '29.7.0' } });
    const changes = parser.parseDiff(oldManifest, newManifest);
    expect(changes).toHaveLength(1);
    expect(changes[0].changeType).toBe('UPDATED');
  });

  // ---------------------------------------------------------------------------
  // Lockfile-based transitive dependency detection
  // ---------------------------------------------------------------------------

  const oldManifest = JSON.stringify({ dependencies: { 'lodash': '^4.17.20' } });
  const newManifest = JSON.stringify({ dependencies: { 'lodash': '^4.17.21', 'axios': '^1.6.0' } });

  const makeLock = (pkgs: Record<string, string>) => JSON.stringify({
    lockfileVersion: 3,
    packages: Object.fromEntries(
      Object.entries(pkgs).map(([name, version]) => [`node_modules/${name}`, { version }])
    ),
  });

  it('resolves exact versions from lockfile for direct deps', () => {
    const oldLock = makeLock({ lodash: '4.17.20' });
    const newLock = makeLock({ lodash: '4.17.21', axios: '1.6.0' });

    const changes = parser.parseDiff(oldManifest, newManifest, oldLock, newLock);
    const lodash = changes.find(c => c.packageName === 'lodash');
    const axios = changes.find(c => c.packageName === 'axios');

    expect(lodash?.previousVersion).toBe('4.17.20');
    expect(lodash?.newVersion).toBe('4.17.21');
    expect(axios?.newVersion).toBe('1.6.0');
    expect(axios?.changeType).toBe('ADDED');
    expect(axios?.isDirect).toBe(true);
  });

  it('detects transitive dependency additions from lockfile', () => {
    const oldLock = makeLock({ lodash: '4.17.20' });
    const newLock = makeLock({
      lodash: '4.17.21',
      axios: '1.6.0',
      'follow-redirects': '1.15.4', // transitive dep of axios
    });

    const changes = parser.parseDiff(oldManifest, newManifest, oldLock, newLock);
    const followRedirects = changes.find(c => c.packageName === 'follow-redirects');

    expect(followRedirects).toBeDefined();
    expect(followRedirects?.changeType).toBe('ADDED');
    expect(followRedirects?.isDirect).toBe(false);
  });

  it('detects transitive dependency removals', () => {
    const oldLock = makeLock({ lodash: '4.17.20', 'old-transitive': '1.0.0' });
    const newLock = makeLock({ lodash: '4.17.21', axios: '1.6.0' });

    const changes = parser.parseDiff(oldManifest, newManifest, oldLock, newLock);
    const removed = changes.find(c => c.packageName === 'old-transitive');

    expect(removed).toBeDefined();
    expect(removed?.changeType).toBe('REMOVED');
    expect(removed?.isDirect).toBe(false);
  });

  it('does not emit transitive changes when lockfiles are absent', () => {
    const changes = parser.parseDiff(oldManifest, newManifest);
    // Without lockfiles, only direct deps appear and none are transitive
    expect(changes.every(c => c.isDirect === true)).toBe(true);
  });

  it('handles malformed manifest gracefully', () => {
    expect(() => parser.parseDiff('not json', '{}')).not.toThrow();
  });
});
