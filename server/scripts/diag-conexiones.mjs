import 'dotenv/config';
import pg from 'pg';
const { Client } = pg;

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const r = await c.query("SELECT count(*) AS total, state FROM pg_stat_activity WHERE datname IS NOT NULL GROUP BY state ORDER BY total DESC");
console.log(r.rows);
const max = await c.query('SHOW max_connections');
console.log('max_connections', max.rows);
const detalle = await c.query("SELECT pid, application_name, state, now() - query_start AS duracion, now() - backend_start AS antiguedad FROM pg_stat_activity WHERE datname IS NOT NULL ORDER BY backend_start ASC LIMIT 50");
console.log(detalle.rows);
await c.end();
