// Garantiza al arrancar las tablas y permisos de las funciones recientes, sin depender de que alguien corra
// `prisma migrate deploy`. Ejecuta el mismo SQL de esas migraciones, que es seguro de repetir (IF NOT EXISTS /
// ON CONFLICT). Nunca lanza: deja el resultado en `estadoEsquema` para /api/health.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIGRACIONES_GARANTIZADAS = [
  '20261126130000_impresoras_local',
  '20261127090000_devoluciones',
  '20261127110000_impresora_tirillas',
];

const carpetaMigraciones = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'prisma', 'migrations');

export const estadoEsquema = { listo: false, errores: [] };

// Separa un archivo de migracion en sentencias (sin comentarios de linea).
export function sentenciasSql(sql) {
  return String(sql)
    .split('\n')
    .filter((linea) => !linea.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*(?:\n|$)/)
    .map((sentencia) => sentencia.trim())
    .filter(Boolean);
}

export async function asegurarEsquema(cliente, { leer = (nombre) => readFile(path.join(carpetaMigraciones, nombre, 'migration.sql'), 'utf8'), log = console } = {}) {
  const errores = [];
  for (const nombre of MIGRACIONES_GARANTIZADAS) {
    let sql;
    try {
      sql = await leer(nombre);
    } catch (error) {
      errores.push(`${nombre}: ${error.message}`);
      continue;
    }
    for (const sentencia of sentenciasSql(sql)) {
      try {
        await cliente.$executeRawUnsafe(sentencia);
      } catch (error) {
        errores.push(`${nombre}: ${error.message.split('\n').at(-1)}`);
      }
    }
  }
  estadoEsquema.listo = errores.length === 0;
  estadoEsquema.errores = errores;
  if (errores.length) log.error('[esquema] No se pudo garantizar todo:', errores.join(' | '));
  else log.log('[esquema] Impresoras y devoluciones listas.');
  return estadoEsquema;
}
