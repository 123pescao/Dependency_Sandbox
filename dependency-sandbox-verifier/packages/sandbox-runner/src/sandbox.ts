import Docker from 'dockerode';
import { PassThrough } from 'stream';
import { SandboxEvent } from '@dsv/shared';

// Defence-in-depth allowlists — applied even though Cmd uses array form (no shell).
const SAFE_PACKAGE_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i;
const SAFE_VERSION_RE = /^[a-zA-Z0-9._~^<>=*-]+$/;

export interface SandboxRunResult {
  events: SandboxEvent[];
  status: 'COMPLETED' | 'FAILED';
  exitCode: number | null;
  durationMs: number;
  stdoutTail: string;
  stderrTail: string;
}

export interface SandboxRunner {
  run(packageName: string, version: string): Promise<SandboxRunResult>;
}

const TAIL_BYTES = 4096;

export class DockerSandboxRunner implements SandboxRunner {
  private docker: Docker | null = null;

  private getDocker(): Docker {
    if (!this.docker) this.docker = new Docker();
    return this.docker;
  }

  async run(packageName: string, version: string): Promise<SandboxRunResult> {
    if (!SAFE_PACKAGE_RE.test(packageName)) throw new Error(`Unsafe package name rejected: "${packageName}"`);
    if (!SAFE_VERSION_RE.test(version))     throw new Error(`Unsafe version string rejected: "${version}"`);

    const startedAt = Date.now();
    const events: SandboxEvent[] = [];
    let container: Docker.Container | null = null;
    let exitCode: number | null = null;
    let stdoutBuf = '';
    let stderrBuf = '';

    try {
      const docker = this.getDocker();

      container = await docker.createContainer({
        Image: 'node:18-alpine',
        Cmd: ['npm', 'install', '--no-save', `${packageName}@${version}`],
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
        NetworkDisabled: true,
        HostConfig: {
          Memory: 256 * 1024 * 1024,
          MemorySwap: 256 * 1024 * 1024,
          CpuPeriod: 100_000,
          CpuQuota: 50_000,
          AutoRemove: false,
        },
      });

      await container.start();

      const waitResult = await Promise.race([
        container.wait(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Sandbox timed out after 60 s')), 60_000),
        ),
      ]) as { StatusCode: number };
      exitCode = waitResult.StatusCode;

      const durationMs = Date.now() - startedAt;

      const logStream = await container.logs({ stdout: true, stderr: true, follow: false });
      const stdoutPt = new PassThrough();
      const stderrPt = new PassThrough();
      stdoutPt.on('data', (chunk: Buffer) => {
        stdoutBuf += chunk.toString('utf8');
        if (stdoutBuf.length > TAIL_BYTES * 2) stdoutBuf = stdoutBuf.slice(-TAIL_BYTES);
      });
      stderrPt.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString('utf8');
        if (stderrBuf.length > TAIL_BYTES * 2) stderrBuf = stderrBuf.slice(-TAIL_BYTES);
      });

      await new Promise<void>((resolve, reject) => {
        let ended = 0;
        const onEnd = () => { if (++ended === 2) resolve(); };
        stdoutPt.on('end', onEnd);
        stderrPt.on('end', onEnd);
        stdoutPt.on('error', reject);
        stderrPt.on('error', reject);
        (docker as any).modem.demuxStream(logStream, stdoutPt, stderrPt);
      });

      const stdoutTail = stdoutBuf.slice(-TAIL_BYTES);
      const stderrTail = stderrBuf.slice(-TAIL_BYTES);

      events.push({
        eventType: 'SCRIPT_EXECUTION',
        timestamp: new Date(),
        details: { script: `npm install --no-save ${packageName}@${version}`, exitCode, durationMs, stdoutTail, stderrTail, network: 'disabled' },
      });

      return { events, status: exitCode === 0 ? 'COMPLETED' : 'FAILED', exitCode, durationMs, stdoutTail, stderrTail };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      console.error('Sandbox run failed:', error);
      events.push({
        eventType: 'SCRIPT_EXECUTION',
        timestamp: new Date(),
        details: { script: `npm install --no-save ${packageName}@${version}`, error: String(error), durationMs, exitCode: null, network: 'disabled' },
      });
      return { events, status: 'FAILED', exitCode: null, durationMs, stdoutTail: stdoutBuf.slice(-TAIL_BYTES), stderrTail: stderrBuf.slice(-TAIL_BYTES) };
    } finally {
      if (container) {
        try { await container.remove({ force: true }); } catch { /* best-effort */ }
      }
    }
  }
}
