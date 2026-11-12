import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:1/test';
const { default: router } = await import('../src/routes/reportes.js');
const { tenantStorage } = await import('../src/prisma.js');

async function entorno(t, datos) {
  const consultas = [];
  const buscar = (nombre, campo) => async (consulta) => {
    consultas.push({ nombre, ...consulta });
    const rango = campo === 'createdAt' ? consulta.where.AND[0].cabecera.is.createdAt : consulta.where[campo];
    return datos[nombre].filter((fila) => {
      const fecha = campo === 'createdAt' ? fila.cabecera.createdAt : fila.fecha;
      return (!rango.gte || fecha >= rango.gte) && (!rango.lt || fecha < rango.lt);
    });
  };
  const db = {
    factura: { findMany: buscar('factura', 'createdAt') },
    facturaVenta: { findMany: buscar('facturaVenta', 'createdAt') },
    notaCredito: { findMany: buscar('notaCredito', 'fecha') },
    notaDebito: { findMany: buscar('notaDebito', 'fecha') },
  };
  const app = express();
  app.use((req, res, next) => tenantStorage.run(db, next));
  app.use('/reportes', router);
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
  const servidor = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => servidor.once('listening', resolve));
  t.after(() => new Promise((resolve) => servidor.close(resolve)));
  const solicitar = async (params) => {
    const respuesta = await fetch(`http://127.0.0.1:${servidor.address().port}/reportes/resumen-facturas-notas?${params}`);
    return { status: respuesta.status, body: await respuesta.json() };
  };
  return { solicitar, consultas };
}

const fecha = (valor) => new Date(valor);
const factura = (createdAt, subtotal, impuesto, propina = 0) => ({
  cabecera: { createdAt: fecha(createdAt), subtotal, impuesto, total: subtotal + impuesto, propina, usuarioNombre: 'cajera' },
  usuarioId: 'cajera-1', usuario: { nombre: 'Cajera Uno' },
  apertura: { caja: { id: 'caja-1', nombre: 'Caja principal' } },
  tipoDocumento: { clase: '01F - Factura' },
});

test('acumula facturas y notas por su fecha colombiana, cajero, caja y tipo', async (t) => {
  const antigua = factura('2026-11-10T12:00:00Z', 100, 19);
  const datos = {
    factura: [
      factura('2026-11-11T05:00:00Z', 100, 19, 10),
      factura('2026-11-12T04:59:59Z', 200, 38, 20),
      factura('2026-11-12T05:00:00Z', 500, 95),
    ],
    facturaVenta: [factura('2026-11-11T12:00:00Z', 50, 0, 5)],
    notaCredito: [{ fecha: fecha('2026-11-11T13:00:00Z'), total: 25, factura: antigua }],
    notaDebito: [{ fecha: fecha('2026-11-11T14:00:00Z'), total: 5, factura: null }],
  };
  const { solicitar, consultas } = await entorno(t, datos);
  const resultado = await solicitar('desde=2026-11-11&hasta=2026-11-11');
  assert.equal(resultado.status, 200);
  assert.equal(consultas.length, 4);
  const ventas = resultado.body.find((fila) => fila.tipo === '01F - Factura');
  assert.deepEqual(ventas, {
    cajeroId: 'cajera-1', cajero: 'Cajera Uno', cajaId: 'caja-1', caja: 'Caja principal',
    fecha: '2026-11-11', tipo: '01F - Factura', bruto: 350, descuentos: null,
    impuestos: 57, neto: 407, propina: 35,
  });
  const credito = resultado.body.find((fila) => fila.tipo === 'Nota crédito');
  assert.equal(credito.cajero, 'Cajera Uno');
  assert.equal(credito.neto, -25);
  assert.equal(credito.bruto, null);
  assert.equal(credito.impuestos, null);
  assert.equal(credito.propina, null);
  const debito = resultado.body.find((fila) => fila.tipo === 'Nota débito');
  assert.equal(debito.cajero, 'Sin cajero');
  assert.equal(debito.caja, 'Sin caja');
  assert.equal(debito.neto, 5);
  assert.equal(consultas.find((consulta) => consulta.nombre === 'factura').where.AND[0].cabecera.is.createdAt.gte.toISOString(), '2026-11-11T05:00:00.000Z');
});

test('rechaza fechas inválidas y no inventa un total para notas sin importe', async (t) => {
  const datos = {
    factura: [], facturaVenta: [],
    notaCredito: [{ fecha: fecha('2026-11-11T12:00:00Z'), total: null, factura: null }],
    notaDebito: [],
  };
  const { solicitar } = await entorno(t, datos);
  assert.equal((await solicitar('desde=2026-02-31')).status, 400);
  assert.equal((await solicitar('desde=2026-11-12&hasta=2026-11-11')).status, 400);
  const resultado = await solicitar('desde=2026-11-11&hasta=2026-11-11');
  assert.equal(resultado.status, 200);
  assert.equal(resultado.body[0].neto, null);
  datos.notaCredito[0].total = -20;
  assert.equal((await solicitar('desde=2026-11-11&hasta=2026-11-11')).status, 409);
});
