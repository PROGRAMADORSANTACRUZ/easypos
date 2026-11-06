import assert from 'node:assert/strict';
import test from 'node:test';
import { crearPartesPedido, calcularLineaPedido } from '../src/routes/facturas.js';

const pedido = {
  items: [{
    id: 17,
    productoId: '00000000-0000-4000-8000-000000000017',
    cantidad: 3,
    precioUnit: 10,
    producto: { nombre: 'Producto de prueba', iva: 19 },
  }],
};

test('la factura unica de una division conserva codigo, nombre y unidad de sus productos', () => {
  const item = {
    ...pedido.items[0], cantidad: 1, precioUnit: 8000,
    producto: { codigo: '0004', nombre: 'CHUZO DE CHORIZO', iva: 8, unidad: { abreviatura: 'UND' } },
  };
  const linea = calcularLineaPedido(item, true);
  assert.equal(linea.productoCodigo, '0004');
  assert.equal(linea.productoNombre, 'CHUZO DE CHORIZO');
  assert.equal(linea.unidad, 'UND');
  assert.equal(linea.subtotal, 8000);
  assert.equal(linea.impuesto, 640);
  assert.equal(linea.total, 8640);
});

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

test('divide cantidades en kilos en pasos de un gramo', () => {
  const pedidoKg = {
    items: [{
      id: 18,
      productoId: '00000000-0000-4000-8000-000000000018',
      cantidad: 0.375,
      precioUnit: 12000,
      producto: { nombre: 'Carne', iva: 0, unidad: { factorConversion: 1000, abreviatura: 'KG' } },
    }],
  };
  const partesIguales = crearPartesPedido(pedidoKg, {
    modo: 'IGUALES', cantidadPartes: 2, electronica: true, propina: 0,
  });
  assert.deepEqual(partesIguales.map((parte) => parte.lineas[0].cantidad), [0.188, 0.187]);
  assert.equal(partesIguales.reduce((suma, parte) => suma + parte.lineas[0].cantidad, 0), 0.375);

  const partesPorProducto = crearPartesPedido(pedidoKg, {
    modo: 'PRODUCTOS', cantidadPartes: 2, electronica: true, propina: 0,
    asignaciones: [{ pedidoItemId: 18, cantidades: [0.125, 0.25] }],
  });
  assert.deepEqual(partesPorProducto.map((parte) => parte.total), [1500, 3000]);
});

test('rechaza cantidades en kilos con fracciones menores a un gramo', () => {
  const pedidoKg = {
    items: [{
      id: 19,
      productoId: '00000000-0000-4000-8000-000000000019',
      cantidad: 0.375,
      precioUnit: 12000,
      producto: { nombre: 'Carne', iva: 0, unidad: { factorConversion: 1000, abreviatura: 'KG' } },
    }],
  };
  assert.throws(() => crearPartesPedido(pedidoKg, {
    modo: 'PRODUCTOS', cantidadPartes: 2, electronica: true, propina: 0,
    asignaciones: [{ pedidoItemId: 19, cantidades: [0.1255, 0.2495] }],
  }), (error) => error.status === 400);
});