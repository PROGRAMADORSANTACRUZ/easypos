// Uso: node scripts/quitar-precios-productos.mjs (desde server, con DATABASE_URL configurada).
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaClient as PlatformPrismaClient } from '../node_modules/.prisma/platform-client/index.js';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL es requerida');

const platform = new PlatformPrismaClient({
  datasources: { db: { url: process.env.PLATFORM_DATABASE_URL || process.env.DATABASE_URL } },
});

async function main() {
  let restaurantes = [];
  try {
    restaurantes = await platform.restaurante.findMany({ select: { nombre: true, dbUrl: true } });
  } catch (error) {
    if (error.code !== 'P2021' || process.env.PLATFORM_DATABASE_URL) throw error;
    console.log('Sin tabla de restaurantes: limpiando solamente la base principal');
  }
  const bases = new Map([[process.env.DATABASE_URL, 'Base principal']]);
  for (const restaurante of restaurantes) bases.set(restaurante.dbUrl, restaurante.nombre);

  for (const [dbUrl, nombre] of bases) {
    const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
    try {
      const [productos, preciosLista] = await prisma.$transaction([
        prisma.producto.updateMany({ where: { precio: { not: 0 } }, data: { precio: 0 } }),
        prisma.productoListaPrecio.updateMany({ where: { precio: { not: 0 } }, data: { precio: 0 } }),
      ]);
      const [pendientes, pendientesLista] = await prisma.$transaction([
        prisma.producto.count({ where: { precio: { not: 0 } } }),
        prisma.productoListaPrecio.count({ where: { precio: { not: 0 } } }),
      ]);
      if (pendientes || pendientesLista) throw new Error(`Quedan ${pendientes} productos y ${pendientesLista} precios de lista sin limpiar`);
      console.log(`${nombre}: ${productos.count} productos y ${preciosLista.count} precios de lista puestos a 0`);
    } finally {
      await prisma.$disconnect();
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => platform.$disconnect());