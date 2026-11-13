import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:1/test';
const { default: router } = await import('../src/routes/reportes.js');
const { tenantStorage } = await import('../src/prisma.js');

async function entorno(t, datos) {
  const consultas = [];
  const buscar = (nombre) => async (consulta) => {
    consultas.push(consulta);
    const rango = consulta.where.AND[0].cabecera.is.createdAt;
    return datos[nombre].filter((f) => (!rango.gte || f.cabecera.createdAt >= rango.gte)
      && (!rango.lt || f.cabecera.createdAt < rango.lt));
  };
  const db = {
    factura: { findMany: buscar('facturas') },
    facturaVenta: { findMany: buscar('ventas') },
    formaPago: { findMany: async () => datos.formas },
  };
  const app = express();
  app.use((req, res, next) => tenantStorage.run(db, next));
  app.use('/reportes', router);
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const solicitar = async (params = 'desde=2026-11-11&hasta=2026-11-11') => {
    const respuesta = await fetch(`http://127.0.0.1:${server.address().port}/reportes/revision-diaria-pdv?${params}`);
    return { status: respuesta.status, body: await respuesta.json() };
  };
  return { solicitar, consultas };
}

function factura(id, { total = 100, propina = 0, credito = false, metodoPago = 'EFE', pagos = [], campos = {}, dia = '2026-11-11T12:00:00Z' } = {}) {
  return {
    id, numeroFactura: 15, prefijo: 'POS', companiaCodigo: '001', centroOperacionCodigo: '405',
    metodoPago, pagos, usuarioId: 'cajero-1', usuario: { nombre: 'Cajera Uno' },
    apertura: { caja: { id: 'caja-1', nombre: 'Caja principal' } },
    cabecera: { createdAt: new Date(dia), total, propina, credito, usuarioNombre: 'cajera', ...campos },
  };
}

test('desglosa pagos por cajero, medio y factura con ingreso recibido, vuelto y neto cobrado', async (t) => {
  const datos = {
    formas: [{ id: 'EFE', formaPago: 'Efectivo' }, { id: 'QR', formaPago: 'QR' }],
    facturas: [factura('electronica', {
      total: 130, propina: 10,
      pagos: [{ formaPago: 'EFE', monto: 75, recibido: 100, vuelto: 25 }, { formaPago: 'QR', monto: 60, recibido: 60, vuelto: 0 }, { formaPago: 'EFE', monto: 5 }],
    }), factura('otra-fecha', { dia: '2026-11-12T05:00:00Z' })],
    ventas: [factura('pos', { total: 30, metodoPago: 'QR', pagos: [{ formaPago: 'QR', monto: 30 }] })],
  };
  const { solicitar, consultas } = await entorno(t, datos);
  const resultado = await solicitar();
  assert.equal(resultado.status, 200);
  assert.equal(resultado.body.length, 3);
  const efectivo = resultado.body.find((fila) => fila.id === 'electronica:EFE');
  assert.deepEqual(efectivo, {
    id: 'electronica:EFE', cajeroId: 'cajero-1', cajero: 'Cajera Uno', fecha: '2026-11-11',
    compania: '001', centro: '405', cajaId: 'caja-1', caja: 'Caja principal',
    documento: 'POS15', medioId: 'EFE', medio: 'Efectivo', moneda: 'COP', ingreso: 105, egreso: 25, neto: 80,
  });
  const qr = resultado.body.find((fila) => fila.id === 'electronica:QR');
  assert.deepEqual([qr.ingreso, qr.egreso, qr.neto], [60, 0, 60]);
  assert.deepEqual(['ingreso', 'egreso', 'neto'].map((campo) => resultado.body.find((fila) => fila.id === 'pos:QR')[campo]), [30, 0, 30]);
  for (const consulta of consultas) {
    assert.deepEqual(consulta.select.pagos, {
      where: { formaPago: { not: null } }, select: { formaPago: true, monto: true, recibido: true, vuelto: true },
    });
  }
});

test('mantiene pagos históricos agrupados, identifica importes sin desglose y excluye deuda a crédito', async (t) => {
  const datos = {
    formas: [{ id: 'EFE', formaPago: 'Efectivo' }],
    facturas: [
      factura('agrupada', { total: 50, metodoPago: 'DAT/DTF', campos: { metodoPago2: 'DAT/DTF', valor2: 50 } }),
      factura('sin-desglose', { total: 90, metodoPago: 'EFE + QR' }),
      factura('credito', { total: 100, credito: true, propina: 10, campos: { metodoPago1: 'EFE', valor1: 10 } }),
      factura('credito-sin-propina', { total: 100, credito: true }),
    ],
    ventas: [],
  };
  const { solicitar } = await entorno(t, datos);
  const resultado = await solicitar();
  assert.equal(resultado.status, 200);
  assert.equal(resultado.body.find((fila) => fila.id === 'agrupada:DAT/DTF').neto, 50);
  assert.equal(resultado.body.find((fila) => fila.id === 'sin-desglose:SIN DESGLOSE').neto, 90);
  assert.equal(resultado.body.find((fila) => fila.id === 'credito:EFE').neto, 10);
  assert.ok(!resultado.body.some((fila) => fila.id.startsWith('credito-sin-propina:')));
  assert.equal((await solicitar('desde=2026-02-31')).status, 400);
});
