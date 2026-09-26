// Administra un PrismaClient por restaurante (tenant), cada uno apuntando a su
// propia base de datos. Los clientes se cachean para no reconectar en cada request.
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
const { Client } = pg;

const cache = new Map(); // dbUrl -> PrismaClient

export function getTenantPrisma(dbUrl) {
  if (!dbUrl) throw new Error('dbUrl del restaurante es requerido');
  let cliente = cache.get(dbUrl);
  if (!cliente) {
    cliente = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    cache.set(dbUrl, cliente);
  }
  return cliente;
}

// Construye la URL de conexion de un nuevo restaurante a partir de la URL base
// (mismo servidor/credenciales), cambiando solo el nombre de la base de datos.
export function construirDbUrl(urlBase, dbNombre) {
  const url = new URL(urlBase);
  url.pathname = `/${dbNombre}`;
  return url.toString();
}

// Crea la base de datos fisica del restaurante en el servidor Postgres (idempotente).
export async function crearBaseDeDatos(urlBase, dbNombre) {
  const admin = new URL(urlBase);
  admin.pathname = '/postgres'; // base de mantenimiento, siempre existe
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${dbNombre}"`);
  } catch (e) {
    if (e.code !== '42P04') throw e; // 42P04 = la base ya existe
  } finally {
    await client.end();
  }
}
