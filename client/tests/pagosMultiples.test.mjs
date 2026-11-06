import assert from 'node:assert/strict';
import test from 'node:test';

test('el vuelto se descuenta una sola vez entre conceptos de efectivo y se limita a cuatro medios', () => {
  const formas = formasPagoActivas(['EFE', 'CAJ', 'QR', 'DTF', 'BON'].map((id) => ({
    id, formaPago: id, activo: true, formaPagoDian: ['EFE', 'CAJ'].includes(id) ? '10-Efectivo' : '',
  })));
  const resumen = resumirPagos([{ formaPago: 'EFE', monto: 2000 }, { formaPago: 'CAJ', monto: 10000 }, { formaPago: 'QR', monto: 5000 }], 14000, formas);
  assert.equal(resumen.valido, true);
  assert.equal(resumen.vuelto, 3000);
  assert.deepEqual(resumen.aplicados, [{ formaPago: 'CAJ', monto: 9000 }, { formaPago: 'QR', monto: 5000 }]);
  const cuatro = formas.slice(0, 4).map((forma) => ({ formaPago: forma.codigo, monto: 1000 }));
  assert.equal(agregarPago(cuatro, 'BON', 1000, formas), cuatro);
  assert.equal(resumirPagos([...cuatro, { formaPago: 'BON', monto: 1000 }], 5000, formas).valido, false);
});
import { agregarPago, resumirPagos, etiquetaPagos, formasPagoActivas } from '../src/pagosMultiples.js';

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

test('solo acepta conceptos activos del maestro y conserva Cpto caja en los pagos', () => {
  const formas = formasPagoActivas([
    { id: 'EFE', formaPago: 'REC EFECTIVO', activo: true },
    { id: 'QR', formaPago: 'QR', activo: true },
    { id: 'DAT', formaPago: 'DATAFONOS', activo: false },
  ]);
  assert.deepEqual(formas.map((forma) => forma.codigo), ['EFE', 'QR']);
  assert.deepEqual(agregarPago([], 'DAT', 100, formas), []);
  const pagos = agregarPago(agregarPago([], 'EFE', 15000, formas), 'QR', 5000, formas);
  const resumen = resumirPagos(pagos, 18000, formas);
  assert.equal(resumen.valido, true);
  assert.equal(resumen.vuelto, 2000);
  assert.equal(resumen.aplicados[0].monto, 13000);
  assert.equal(etiquetaPagos(pagos, 18000, String, formas), 'EFE 13000 + QR 5000');
  assert.equal(resumirPagos([{ formaPago: 'QR', monto: 20000 }], 18000, formas).valido, false);
  assert.equal(resumirPagos([{ formaPago: 'DAT', monto: 18000 }], 18000, formas).valido, false);
});