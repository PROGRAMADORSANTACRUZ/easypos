import { platformPrisma } from '../src/platformPrisma.js';
import pg from 'pg';
const { Client } = pg;

const slug = 'pizzeria-don-luigi';
const r = await platformPrisma.restaurante.findUnique({ where: { slug } });
if (r) {
  const admin = new Client({ connectionString: 'postgresql://postgres:vds3xbxy0gommnfz@20.121.178.90:5441/postgres' });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${r.dbNombre}"`);
  await admin.end();
  await platformPrisma.restaurante.delete({ where: { id: r.id } });
  console.log('Restaurante de prueba eliminado:', slug);
} else {
  console.log('No existia.');
}
await platformPrisma.$disconnect();
