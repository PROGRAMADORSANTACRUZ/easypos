import assert from 'node:assert/strict';
import express from 'express';
import test from 'node:test';
import { costoReceta, indicadoresPlato, leerCosto, recalcularCostosPlatos } from '../src/costeoPlatos.js';

process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:1/test';
const { default: costeoRouter } = await import('../src/routes/costeo.js');
const { tenantStorage } = await import('../src/prisma.js');

test('calcula el costo de la receta, el margen y el % de costo sobre el precio sin impuesto', () => {
  const costo = costoReceta([
    { cantidad: 0.25, item: { costo: 18000 } },
    { cantidad: 2, item: { costo: 1250 } },
    { cantidad: 1, item: { costo: 0 } },
  ]);
  assert.equal(costo, 7000);
  assert.deepEqual(indicadoresPlato({ precio: 21600, iva: 8, costo }), { precioNeto: 20000, margen: 13000, porcentajeCosto: 35 });
  assert.equal(indicadoresPlato({ precio: 0, iva: 8, costo: 10 }).porcentajeCosto, null);
});

test('interpreta costos escritos con separadores colombianos', () => {
  assert.equal(leerCosto('12.500'), 12500);
  assert.equal(leerCosto('$ 12.500,75'), 12500.75);
  assert.equal(leerCosto('1250.5'), 1250.5);
  assert.equal(leerCosto(800), 800);
  assert.equal(leerCosto('-5'), null);
  assert.equal(leerCosto('abc'), null);
  assert.equal(leerCosto(''), null);
});

test('recalcula solo los platos que usan el insumo y guarda su costo', async () => {
  const actualizados = [];
  let filtro;
  const tx = {
    producto: {
      findMany: async ({ where }) => {
        filtro = where;
        return [
          { id: 'a', costo: 0, componentes: [{ cantidad: 2, item: { costo: 1000 } }] },
          { id: 'b', costo: 500, componentes: [{ cantidad: 1, item: { costo: 500 } }] },
        ];
      },
      update: async ({ where, data }) => actualizados.push([where.id, data.costo]),
    },
  };
  assert.equal(await recalcularCostosPlatos(tx, { itemIds: [7] }), 1);
  assert.deepEqual(filtro, { esKit: true, componentes: { some: { itemId: { in: [7] } } } });
  assert.deepEqual(actualizados, [['a', 2000]]);
});

test('importa costos por referencia o nombre, recalcula platos e informa lo no encontrado', async (t) => {
  const insumos = [
    { id: 1, codigo: 'C001', nombre: 'CHICHARRON', unidad: 'KG', costo: 0 },
    { id: 2, codigo: null, nombre: 'AREPA', unidad: 'UNIDAD', costo: 500 },
  ];
  const platos = [{ id: 'p1', costo: 0, componentes: [{ cantidad: 0.5, item: insumos[0] }, { cantidad: 2, item: insumos[1] }] }];
  const db = {
    inventarioItem: {
      findMany: async ({ select }) => insumos.map((insumo) => (select._count ? { ...insumo, _count: { componentes: 1 } } : insumo)),
      update: async ({ where, data }) => Object.assign(insumos.find((insumo) => insumo.id === where.id), data),
    },
    producto: {
      findMany: async () => platos.map((plato) => ({
        ...plato, codigo: 'P1', nombre: 'CHICHARRON + AREPA', precio: 21600, iva: 8, activo: true, categoria: null,
        componentes: plato.componentes.map((c) => ({ cantidad: c.cantidad, item: { ...c.item } })),
      })),
      update: async ({ where, data }) => Object.assign(platos.find((plato) => plato.id === where.id), data),
    },
    auditoria: { create: async () => ({}) },
    $transaction: async (fn) => fn(db),
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => tenantStorage.run(db, next));
  app.use('/costeo', costeoRouter);
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const respuesta = await fetch(`http://127.0.0.1:${server.address().port}/costeo/insumos/importar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filas: [
      { referencia: 'c001', costo: '18.000' }, { referencia: 'arepa', costo: 500 },
      { referencia: 'NO EXISTE', costo: 10 }, { referencia: 'C001', costo: 'xx' },
    ] }),
  });
  const cuerpo = await respuesta.json();
  assert.equal(respuesta.status, 200);
  assert.deepEqual([cuerpo.insumosActualizados, cuerpo.sinCambios, cuerpo.platosActualizados], [1, 1, 1]);
  assert.deepEqual(cuerpo.noEncontrados, ['NO EXISTE']);
  assert.equal(cuerpo.invalidos.length, 1);
  assert.equal(platos[0].costo, 10000);
  assert.equal(cuerpo.platos[0].costo, 10000);
  assert.equal(cuerpo.platos[0].porcentajeCosto, 50);
});
