import assert from 'node:assert/strict';
import test from 'node:test';
import { agregarPago, resumirPagos, etiquetaPagos } from '../src/pagosMultiples.js';

test('acumula importes por medio sin modificar los pagos anteriores', () => {
  const iniciales = agregarPago([], 'EFECTIVO', '15453');
  const pagos = agregarPago(agregarPago(iniciales, 'TARJETA', '20000'), 'EFECTIVO', '1000');
  assert.deepEqual(iniciales, [{ formaPago: 'EFECTIVO', monto: 15453 }]);
  assert.deepEqual(pagos, [{ formaPago: 'EFECTIVO', monto: 16453 }, { formaPago: 'TARJETA', monto: 20000 }]);
});

test('permite tres medios y descuenta el vuelto solo del efectivo aplicado', () => {
  const pagos = [{ formaPago: 'EFECTIVO', monto: 20000 }, { formaPago: 'TARJETA', monto: 10000 }, { formaPago: 'TRANSFERENCIA', monto: 5000 }];
  const resumen = resumirPagos(pagos, 32000);
  assert.equal(resumen.valido, true);
  assert.equal(resumen.recibido, 35000);
  assert.equal(resumen.vuelto, 3000);
  assert.equal(resumen.aplicados[0].monto, 17000);
  assert.equal(etiquetaPagos(pagos, 32000, String), 'EFECTIVO 17000 + TARJETA 10000 + TRANSFERENCIA 5000');
});

test('exige cubrir el total con propina y no permite vuelto de pagos electronicos', () => {
  assert.equal(resumirPagos([{ formaPago: 'TARJETA', monto: 10000 }], 11000).pendiente, 1000);
  assert.equal(resumirPagos([{ formaPago: 'TARJETA', monto: 10000 }], 11000).valido, false);
  assert.equal(resumirPagos([{ formaPago: 'TARJETA', monto: 12000 }], 11000).valido, false);
  assert.equal(resumirPagos([{ formaPago: 'TARJETA', monto: 6000 }, { formaPago: 'TRANSFERENCIA', monto: 5000 }], 11000).valido, true);
  assert.equal(etiquetaPagos([{ formaPago: 'EFECTIVO', monto: 20000 }], 11000, String), 'EFECTIVO');
});

test('rechaza importes invalidos y conserva precision de centavos', () => {
  for (const valor of ['', '0', '-1', 'NaN', 'Infinity']) assert.deepEqual(agregarPago([], 'EFECTIVO', valor), []);
  assert.deepEqual(agregarPago([], 'OTRO', 10), []);
  assert.equal(resumirPagos([], 100).valido, false);
  assert.equal(resumirPagos([{ formaPago: 'EFECTIVO', monto: -1 }], 100).valido, false);
  const pagos = agregarPago(agregarPago([], 'EFECTIVO', 0.1), 'EFECTIVO', 0.2);
  assert.equal(pagos[0].monto, 0.3);
  assert.equal(resumirPagos(pagos, 0.3).valido, true);
});