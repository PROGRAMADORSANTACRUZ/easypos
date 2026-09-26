// Cliente Prisma de la base de PLATAFORMA (directorio central de restaurantes).
import { PrismaClient } from '../node_modules/.prisma/platform-client/index.js';

export const platformPrisma = new PrismaClient();
