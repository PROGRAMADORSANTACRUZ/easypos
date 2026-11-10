import test from 'node:test';
import assert from 'node:assert/strict';
import { planificarPruebas, prepararPruebas } from '../scripts/preparar-productos-prueba.mjs';

const estado = {
  productos: [{ id: 'uno', codigo: '001' }, { id: 'dos', codigo: '002' }, { id: 'tres', codigo: '003' }],
  insumos: [{ id: 1 }, { id: 2 }], componentes: [{ productoId: 'uno', itemId: 1, cantidad: 250 }],
  existencias: [{ id: 'existente', productoId: 'uno', bodegaId: 'compras', cantidad: 150 }],
  existenciasInsumos: [{ itemId: 1, bodegaId: 'compras', stock: 50 }], bodegaId: 'compras',
};

test('precios variados entre 10000 y 150000, estables sin depender del orden de lectura', () => {
  const plan = planificarPruebas(estado);
  assert.deepEqual(plan.precios.map((producto) => producto.precio), [10000, 80000, 150000]);
  assert.deepEqual(planificarPruebas({ ...estado, productos: [...estado.productos].reverse() }).precios, plan.precios);
});

test('garantiza 100 productos sin reducir existencias y abastece las recetas en Compras', () => {
  const plan = planificarPruebas(estado);
  assert.equal(plan.entradasProductos.length, 2);
  assert.ok(plan.entradasProductos.every((entrada) => entrada.cantidad === 100));
  assert.deepEqual(plan.entradasInsumos, [{ itemId: 1, cantidad: 25050 }, { itemId: 2, cantidad: 100 }]);
});

test('no usa el stock de otra bodega y suma filas de existencias del mismo producto', () => {
  const plan = planificarPruebas({ ...estado, existencias: [
    { productoId: 'uno', bodegaId: 'otra', cantidad: 1000 },
    { id: 'primera', productoId: 'dos', bodegaId: 'compras', cantidad: 20 },
    { id: 'segunda', productoId: 'dos', bodegaId: 'compras', cantidad: 30 },
  ] });
  assert.equal(plan.entradasProductos.find((entrada) => entrada.productoId === 'uno').cantidad, 100);
  assert.deepEqual(plan.entradasProductos.find((entrada) => entrada.productoId === 'dos'), {
    productoId: 'dos', existenciaId: 'primera', cantidad: 50,
  });
});

test('catalogos vacios o de un producto no producen precios invalidos', () => {
  assert.deepEqual(planificarPruebas({ ...estado, productos: [] }).precios, []);
  assert.equal(planificarPruebas({ ...estado, productos: [estado.productos[0]] }).precios[0].precio, 10000);
});

test('ignora residuos de precision Float pero conserva faltantes reales', () => {
  const plan = planificarPruebas({ ...estado, componentes: [], existenciasInsumos: [
    { itemId: 1, bodegaId: 'compras', stock: 99.99999999999999 },
    { itemId: 2, bodegaId: 'compras', stock: 99.5 },
  ] });
  assert.deepEqual(plan.entradasInsumos, [{ itemId: 2, cantidad: 0.5 }]);
});

test('no permite aplicar sin respaldo ni recetas negativas', async () => {
  await assert.rejects(prepararPruebas({}, { aplicar: true }), /respaldo/);
  assert.throws(() => planificarPruebas({ ...estado, componentes: [{ itemId: 1, cantidad: -1 }] }), /no valida/);
});