import assert from 'node:assert/strict';
import test from 'node:test';
import { crearPartesPedido } from '../src/routes/facturas.js';

const pedido = {
  items: [{
    id: 17,
    productoId: '00000000-0000-4000-8000-000000000017',
    cantidad: 3,
    precioUnit: 10,
    producto: { nombre: 'Producto de prueba', iva: 19 },
  }],
};

test('reparte subtotal, IVA y propina en partes iguales sin perder centavos ni cantidades', () => {
  const partes = crearPartesPedido(pedido, {
    modo: 'IGUALES', cantidadPartes: 3, electronica: true, propina: 1,
  });

  assert.equal(partes.reduce((suma, parte) => suma + parte.total + parte.propina, 0), 36.7);
  assert.equal(partes.reduce((suma, parte) => suma + parte.lineas[0].cantidad, 0), 3);
  assert.deepEqual(partes.map((parte) => parte.total), [11.9, 11.9, 11.9]);
  assert.deepEqual(partes.map((parte) => parte.propina), [0.33, 0.33, 0.34]);
});

test('reparte productos por cantidades y conserva el importe total', () => {
  const partes = crearPartesPedido(pedido, {
    modo: 'PRODUCTOS',
    cantidadPartes: 2,
    electronica: true,
    propina: 5,
    asignaciones: [{ pedidoItemId: 17, cantidades: [1, 2] }],
  });

  assert.deepEqual(partes.map((parte) => parte.lineas[0].cantidad), [1, 2]);
  assert.deepEqual(partes.map((parte) => parte.total), [11.9, 23.8]);
  assert.equal(partes.reduce((suma, parte) => suma + parte.total + parte.propina, 0), 40.7);
});

test('rechaza una asignación de productos que no suma las unidades del pedido', () => {
  assert.throws(() => crearPartesPedido(pedido, {
    modo: 'PRODUCTOS',
    cantidadPartes: 2,
    electronica: true,
    propina: 0,
    asignaciones: [{ pedidoItemId: 17, cantidades: [1, 1] }],
  }), (error) => error.status === 400);
});