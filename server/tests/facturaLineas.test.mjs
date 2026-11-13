import assert from 'node:assert/strict';
import test from 'node:test';
import { crearLineaPropina, CODIGO_PRODUCTO_PROPINA } from '../src/facturaLineas.js';
import { mapearItemsFactus, mapearPagosFactus } from '../src/factus.js';

test('la propina genera una linea snapshot exenta con codigo configurable', () => {
  assert.equal(CODIGO_PRODUCTO_PROPINA, String(process.env.CODIGO_PRODUCTO_PROPINA || '10600').trim() || '10600');
  assert.deepEqual(crearLineaPropina(800), {
    productoId: null,
    productoCodigo: CODIGO_PRODUCTO_PROPINA,
    productoNombre: 'Propina',
    cantidad: 1,
    unidad: 'UND',
    precioUnitario: 800,
    iva: 0,
    total: 800,
  });
  assert.equal(crearLineaPropina(0), null);
});

test('Factus usa snapshots, respeta el impuesto del producto y envía propina exenta', () => {
  const items = mapearItemsFactus([
    {
      productoCodigo: '0000', productoNombre: 'Propina', cantidad: 1,
      precioUnitario: 800, iva: 0, total: 800,
    },
    {
      productoCodigo: '0004', productoNombre: 'Chuzo', cantidad: 1,
      precioUnitario: 7407.41, iva: 592.59, total: 8000,
      producto: { iva: 8, impuesto: { tipo: 'INC', codigoDIAN: '04', porcentaje: 8 } },
    },
    {
      productoCodigo: '0005', productoNombre: 'Detalle antiguo', cantidad: 1,
      precioUnitario: 21600, iva: 1728, total: 23328,
      producto: { iva: 8, impuesto: { tipo: 'INC', codigoDIAN: '04', porcentaje: 8 } },
    },
  ]);

  assert.equal(items[0].code_reference, '0000');
  assert.equal(items[0].name, 'Propina');
  assert.deepEqual(items[0].taxes, [{ code: '01', rate: '0.00', is_excluded: true }]);
  assert.equal(items[1].price, '7407.41');
  assert.deepEqual(items[1].taxes, [{ code: '04', rate: '8.00', is_excluded: false }]);
  assert.equal(items[2].price, '21600.00');
});

test('Factus distribuye pagos sobre total mas propina, incluido credito', () => {
  const contado = mapearPagosFactus(
    { total: 21600, propina: 800, metodoPago: 'EFE' },
    [{ formaPago: 'EFE', monto: 20000 }, { formaPago: 'DAT', monto: 2400 }],
    [],
  );
  assert.deepEqual(contado.map((pago) => pago.amount), ['20000.00', '2400.00']);
  assert.equal(contado.reduce((suma, pago) => suma + Number(pago.amount), 0), 22400);

  const credito = mapearPagosFactus(
    { total: 21600, propina: 800, credito: true, metodoPago: 'EFE' },
    [],
    [],
  );
  assert.deepEqual(credito.map((pago) => pago.amount), ['21600.00', '800.00']);
});