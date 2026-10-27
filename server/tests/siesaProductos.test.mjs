import test from 'node:test';
import assert from 'node:assert/strict';
import { sincronizarItemsSiesa } from '../src/siesaProductos.js';

function crearPrisma(productos = []) {
  const porCodigo = new Map(productos.map((producto) => [producto.codigo, producto]));
  const llamadas = { creados: [], actualizados: [] };
  const tx = {
    producto: {
      async findUnique({ where }) {
        const producto = porCodigo.get(where.codigo);
        return producto ? { id: producto.id } : null;
      },
      async create({ data }) {
        llamadas.creados.push(data);
        porCodigo.set(data.codigo, { id: `nuevo-${data.codigo}`, ...data });
      },
      async update({ where, data }) {
        llamadas.actualizados.push({ id: where.id, data });
      },
    },
  };
  return {
    llamadas,
    async $transaction(callback) { return callback(tx); },
  };
}

const itemSiesa = {
  f120_id_cia: 4,
  f120_id: 2595,
  f120_rowid: 21801,
  f120_referencia: '10105',
  f120_descripcion: 'LECHONA X 300 GR',
  f120_descripcion_corta: 'LECHONA X 300 GR',
  f120_id_grupo_impositivo: 802,
  f120_id_tipo_inv_serv: 'IN350505',
  f120_id_unidad_inventario: 'UND',
  f120_id_unidad_orden: 'CAJ',
  f120_id_segmento_costo: 'CAR',
  f120_usuario_actualizacion: 'OPERADOR',
  f120_ind_tipo_item: 3,
  f120_ind_compra: 1,
  f120_ind_venta: 1,
  f120_ind_manufactura: 1,
};

test('omite referencias inexistentes y no crea productos', async () => {
  const prisma = crearPrisma();
  const resultado = await sincronizarItemsSiesa(prisma, [itemSiesa, { ...itemSiesa, f120_referencia: '' }]);
  assert.deepEqual(resultado, { actualizados: 0, omitidos: 2 });
  assert.equal(prisma.llamadas.creados.length, 0);
  assert.equal(prisma.llamadas.actualizados.length, 0);
});

test('actualiza datos Siesa del producto existente sin cambiar su precio', async () => {
  const prisma = crearPrisma([{ id: 'producto-1', codigo: '10105', precio: 12500 }]);
  const resultado = await sincronizarItemsSiesa(prisma, [itemSiesa]);
  assert.deepEqual(resultado, { actualizados: 1, omitidos: 0 });
  assert.equal(prisma.llamadas.actualizados[0].id, 'producto-1');
  assert.equal(prisma.llamadas.actualizados[0].data.nombre, 'LECHONA X 300 GR');
  assert.equal(prisma.llamadas.actualizados[0].data.siesaId, '2595');
  assert.equal(prisma.llamadas.actualizados[0].data.siesaIdUnidadInventario, 'UND');
  assert.equal(prisma.llamadas.actualizados[0].data.siesaIdUnidadOrden, 'CAJ');
  assert.equal(prisma.llamadas.actualizados[0].data.siesaIdSegmentoCosto, 'CAR');
  assert.equal(prisma.llamadas.actualizados[0].data.siesaUsuarioActualizacion, 'OPERADOR');
  assert.equal('precio' in prisma.llamadas.actualizados[0].data, false);
});

test('rechaza referencias duplicadas para evitar asociaciones ambiguas', async () => {
  const prisma = crearPrisma();
  await assert.rejects(
    sincronizarItemsSiesa(prisma, [itemSiesa, { ...itemSiesa, f120_rowid: 21802 }]),
    /referencia duplicada 10105/,
  );
  assert.equal(prisma.llamadas.creados.length, 0);
});

test('rechaza artículos que no pertenecen a la compañía Siesa 4', async () => {
  const prisma = crearPrisma();
  await assert.rejects(
    sincronizarItemsSiesa(prisma, [{ ...itemSiesa, f120_id_cia: 5 }]),
    /compañía Siesa 4/,
  );
  assert.equal(prisma.llamadas.creados.length, 0);
});