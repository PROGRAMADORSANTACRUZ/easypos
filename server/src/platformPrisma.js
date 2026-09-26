// Cliente Prisma de la base de PLATAFORMA (directorio central de restaurantes).
import { PrismaClient } from '../node_modules/.prisma/platform-client/index.js';

// PLATFORM_DATABASE_URL es opcional: si no está definida, usa la misma base
// que DATABASE_URL (no hay colisión de nombres de tabla entre los 2 esquemas
// de Prisma) — así solo hace falta configurar UNA variable de conexión.
export const platformPrisma = new PrismaClient({
  datasources: { db: { url: process.env.PLATFORM_DATABASE_URL || process.env.DATABASE_URL } },
});
