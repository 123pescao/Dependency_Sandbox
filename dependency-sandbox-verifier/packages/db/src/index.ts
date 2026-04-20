import { PrismaClient } from '@prisma/client';

const isDev = process.env.NODE_ENV === 'development';

// Use globalThis guard to prevent multiple PrismaClient instances in test/dev
// hot-reload environments (connection pool exhaustion).
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

const prisma: PrismaClient =
  globalThis.__prisma ??
  new PrismaClient({
    log: isDev ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
  });

if (isDev) globalThis.__prisma = prisma;

export { prisma };
export * from '@prisma/client';
