import { PrismaClient } from '@prisma/client';

// Next reloads modules in dev; without the global the connection pool grows on
// every save until Postgres refuses new clients.
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__syncupPrisma ||
  new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'] });

if (process.env.NODE_ENV !== 'production') globalForPrisma.__syncupPrisma = prisma;
