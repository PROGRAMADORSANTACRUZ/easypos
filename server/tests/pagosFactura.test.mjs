import assert from 'node:assert/strict';
import test from 'node:test';
import { desglosarFactura } from '../src/routes/aperturas.js';
import { etiquetaPagos } from '../../client/src/pagosMultiples.js';

test('el cierre conserva tres medios sin duplicar la propina ya incluida', () => {
  const partes = desglosarFactura({ total: 30000, propina: 3000, metodoPago: 'EFECTIVO $18.000 + TARJETA $10.000 + TRANSFERENCIA $5.000' });
  assert.deepEqual(partes, [{ metodo: 'EFECTIVO', monto: 18000 }, { metodo: 'TARJETA', monto: 10000 }, { metodo: 'TRANSFERENCIA', monto: 5000 }]);
  assert.equal(partes.reduce((suma, parte) => suma + parte.monto, 0), 33000);
});

test('la propina puede pagarse sin efectivo y no crea una entrada ficticia al cajon', () => {
  assert.deepEqual(desglosarFactura({ total: 30000, propina: 3000, metodoPago: 'TARJETA $20.000 + TRANSFERENCIA $13.000' }), [
    { metodo: 'TARJETA', monto: 20000 }, { metodo: 'TRANSFERENCIA', monto: 13000 },
  ]);
});

test('conserva el tratamiento de propinas de facturas mixtas anteriores y pagos simples', () => {
  assert.deepEqual(desglosarFactura({ total: 30000, propina: 3000, metodoPago: 'EFECTIVO $20.000 + TARJETA $10.000' }), [
    { metodo: 'EFECTIVO', monto: 23000 }, { metodo: 'TARJETA', monto: 10000 },
  ]);
  assert.deepEqual(desglosarFactura({ total: 30000, propina: 3000, metodoPago: 'TARJETA' }), [{ metodo: 'TARJETA', monto: 33000 }]);
});

test('el formato del cliente conserva centavos al calcular el cierre de caja', () => {
  const pagos = [{ formaPago: 'EFECTIVO', monto: 15000.25 }, { formaPago: 'TARJETA', monto: 10000.5 }];
  const metodoPago = etiquetaPagos(pagos, 25000.75);
  assert.deepEqual(desglosarFactura({ total: 25000.75, propina: 0, metodoPago }), [
    { metodo: 'EFECTIVO', monto: 15000.25 }, { metodo: 'TARJETA', monto: 10000.5 },
  ]);
});