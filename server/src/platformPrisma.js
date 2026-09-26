// Cliente Prisma de la base de PLATAFORMA (directorio central de restaurantes).
import { PrismaClient } from '../node_modules/.prisma/platform-client/index.js';

// NO QUITAR el override de "datasources": el esquema de esta base
// (prisma/platform/schema.prisma) exige literalmente `env("PLATFORM_DATABASE_URL")`,
// y Prisma valida esa variable ANTES de intentar la conexión — si no está
// definida en el entorno (pasó ya una vez: alguien quitó este override
// pensando que docker-compose.yml ya la "mirrorea" desde DATABASE_URL, pero
// eso no siempre llega igual según cómo Dokploy inyecte las env vars), la
// app entera se cae con "Environment variable not found: PLATFORM_DATABASE_URL"
// en cualquier ruta que use platformPrisma (ej. /api/plataforma/restaurantes).
// Con este override, si PLATFORM_DATABASE_URL no está, cae a DATABASE_URL
// (misma base, sin colisión de nombres de tabla entre los 2 esquemas).
export const platformPrisma = new PrismaClient({
  datasources: { db: { url: process.env.PLATFORM_DATABASE_URL || process.env.DATABASE_URL } },
});
