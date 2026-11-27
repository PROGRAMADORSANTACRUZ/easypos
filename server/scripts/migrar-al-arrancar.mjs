// Aplica las migraciones pendientes de la base principal al arrancar el contenedor (lo llama start.sh en cada
// despliegue de Dokploy). Nunca detiene el arranque: si algo falla, el POS sigue y el error queda en el log.
// Solo migra si la base ya lleva el historial de Prisma (_prisma_migrations): una base creada con `db push`
// intentaria aplicar todo desde la primera migracion, asi que en ese caso solo avisa.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const carpetaServidor = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function migracionesAplicadas(consultar) {
  try {
    const [fila] = await consultar('SELECT COUNT(*)::int AS total FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL');
    return Number(fila?.total) || 0;
  } catch {
    return 0; // sin la tabla de historial
  }
}

export async function migrarAlArrancar({ consultar, desplegar, log = console }) {
  const aplicadas = await migracionesAplicadas(consultar);
  if (!aplicadas) {
    log.warn('[migraciones] La base no tiene historial de Prisma: no se aplica nada automaticamente.');
    return 'SIN_HISTORIAL';
  }
  try {
    desplegar();
    log.log('[migraciones] Base de datos al dia.');
    return 'OK';
  } catch (error) {
    log.error(`[migraciones] No se pudieron aplicar: ${error.message}. El POS arranca igual; revisa el log.`);
    return 'ERROR';
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const prisma = new PrismaClient();
  try {
    await migrarAlArrancar({
      consultar: (sql) => prisma.$queryRawUnsafe(sql),
      desplegar: () => execFileSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: carpetaServidor, stdio: 'inherit', timeout: 5 * 60 * 1000 }),
    });
  } catch (error) {
    console.error('[migraciones] Fallo inesperado:', error.message);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}
