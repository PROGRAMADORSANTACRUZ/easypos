import assert from 'node:assert/strict';
import test from 'node:test';
import { tenantStorage } from '../src/prisma.js';
import { crearFacturaFactus } from '../src/factus.js';

test('cada envio a Factus deja el payload y la respuesta en los logs de integraciones', async () => {
  const logs = [];
  const base = {
    formaPago: { findMany: async () => [{ id: 'EFE', formaPagoDian: '10-Efectivo' }] },
    logIntegracion: { create: async ({ data }) => { logs.push(data); return data; } },
  };
  const factura = {
    id: 'f1', prefijo: 'RM1C', numeroFactura: '20', total: 30000, propina: 3000, metodoPago: 'EFE', credito: false,
    pagos: [{ formaPago: 'EFE', monto: 33000 }], cliente: null,
    detalle: [{ productoCodigo: '10624', productoNombre: 'Ceviche', cantidad: 1, total: 30000, iva: 2222, precioUnitario: 30000, producto: null }],
  };
  const respuestas = [
    { status: 200, cuerpo: { access_token: 't', expires_in: 3600 } },
    { status: 422, cuerpo: { message: 'Error de validación', data: { errors: { payment_details: ['La suma no es igual'] } } } },
  ];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const r = String(url).includes('/oauth/token') ? respuestas[0] : respuestas[1];
    return new Response(JSON.stringify(r.cuerpo), { status: r.status });
  };
  try {
    await assert.rejects(tenantStorage.run(base, () => crearFacturaFactus(factura)), /Error de validación/);
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(logs.length, 1);
  assert.deepEqual([logs[0].sistema, logs[0].tipo, logs[0].estado], ['FACTUS', 'FACTURA:RM1C20', 'ERROR']);
  const payload = JSON.parse(logs[0].request);
  assert.equal(payload.reference_code, 'RM1C20');
  assert.equal(payload.payment_details[0].amount, '33000.00');
  assert.equal(payload.items.length, 1);
  assert.match(logs[0].response, /La suma no es igual/);
  assert.match(logs[0].mensaje, /payment_details: La suma no es igual/);
});
