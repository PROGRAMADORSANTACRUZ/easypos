import assert from 'node:assert/strict';
import test from 'node:test';
import { crearAdaptadorFacturas } from '../src/facturasPersistencia.js';

const modelos = [
  { name: 'Factura', fields: [{ name: 'pedido', kind: 'object', type: 'Pedido' }] },
  { name: 'FacturaVenta', fields: [] },
  { name: 'Pedido', fields: [{ name: 'facturas', kind: 'object', type: 'Factura' }] },
];
const adaptar = crearAdaptadorFacturas(modelos);
const clave = { companiaCodigo: '006', centroOperacionCodigo: '606', tipoDocumentoCodigo: 'FEV', prefijo: 'DVP', numeroFactura: 184 };

test('proyecta campos de cabecera y mantiene el identificador de la API', async () => {
  let consulta;
  const cliente = adaptar({ factura: { async findUnique(argumentos) {
    consulta = argumentos;
    return { id: 'uuid-original', ...clave, cabecera: { total: 25000, usuarioNombre: 'cajero' } };
  } } });
  const resultado = await cliente.factura.findUnique({ where: { id: 'uuid-original' }, select: { id: true, total: true } });
  assert.deepEqual(consulta, {
    where: { id: 'uuid-original' }, select: { id: true, cabecera: { select: { total: true } } },
  });
  assert.deepEqual(resultado, { id: 'uuid-original', total: 25000 });
});

test('filtra por credito, DIAN y fecha sin perder el filtro de centros', async () => {
  let consulta;
  const cliente = adaptar({ factura: { async findMany(argumentos) { consulta = argumentos; return []; } } });
  await cliente.factura.findMany({
    where: { credito: true, AND: [{ companiaCodigo: '006' }, { OR: [{ estadoDIAN: null }, { estadoDIAN: 'ERROR' }] }] },
    orderBy: { createdAt: 'desc' },
  });
  assert.deepEqual(consulta.where.AND[0], { companiaCodigo: '006' });
  assert.deepEqual(consulta.where.AND[1].OR[1], { AND: [{ cabecera: { is: { estadoDIAN: 'ERROR' } } }] });
  assert.deepEqual(consulta.where.AND[2], { cabecera: { is: { credito: true } } });
  assert.deepEqual(consulta.orderBy, { cabecera: { createdAt: 'desc' } });
});

test('incluye y presenta facturas anidadas en pedidos', async () => {
  let consulta;
  const cliente = adaptar({ pedido: { async findUnique(argumentos) {
    consulta = argumentos;
    return { id: 8, facturas: [{ id: 'original', ...clave, cabecera: { total: 25000 } }] };
  } } });
  const pedido = await cliente.pedido.findUnique({ where: { id: 8 }, include: { facturas: true } });
  assert.deepEqual(consulta.include.facturas, { include: { cabecera: true } });
  assert.equal(pedido.facturas[0].total, 25000);
  assert.equal(pedido.facturas[0].numeroFactura, '184');
  assert.equal(pedido.facturas[0].cabecera, undefined);
});

test('crea cabecera y operacion en la misma transaccion con usuario de acceso', async () => {
  const llamadas = [];
  const transaccion = {
    usuario: { async findUnique() { return { usuario: 'cajero606' }; } },
    tipoDocumento: { async findUnique() { return { ...clave, codigo: clave.tipoDocumentoCodigo }; } },
    facturaVentaCabecera: { async create({ data }) { llamadas.push(['cabecera', data]); return { ...data, createdAt: new Date('2026-11-06T15:00:00Z') }; } },
    facturaVenta: { async create({ data }) {
      llamadas.push(['operacion', data]);
      return { id: 'uuid', ...data, cabecera: { total: 25000, usuarioNombre: 'cajero606' } };
    } },
  };
  const cliente = adaptar({ async $transaction(trabajo) { llamadas.push(['transaccion']); return trabajo(transaccion); } });
  const factura = await cliente.$transaction((tx) => tx.facturaVenta.create({ data: {
    ...clave, numeroFactura: '184', tipoDocumentoId: 'tipo', pedidoId: 8, usuarioId: 'usuario', total: 25000,
    detalle: { create: [{ productoId: 'producto', total: 25000 }] },
  } }));
  assert.equal(llamadas.filter(([nombre]) => nombre === 'transaccion').length, 1);
  assert.equal(llamadas[1][1].usuarioNombre, 'cajero606');
  assert.equal(llamadas[1][1].numeroFactura, 184);
  assert.equal(llamadas[1][1].tipoDocumentoCodigo, 'FEV');
  assert.equal(llamadas[1][1].prefijo, 'DVP');
  assert.equal(llamadas[1][1].metodoPago1, 'EFECTIVO');
  assert.equal(llamadas[1][1].valor1, 25000);
  assert.equal(llamadas[1][1].metodoPago4, '0');
  assert.equal(llamadas[1][1].valor4, 0);
  assert.equal(llamadas[1][1].pedidoId, undefined);
  assert.equal(llamadas[2][1].total, undefined);
  assert.equal(llamadas[2][1].metodoPago, 'EFECTIVO');
  assert.equal(llamadas[2][1].detalle.create.length, 1);
  assert.equal(llamadas[2][1].detalle.create[0].companiaCodigo, clave.companiaCodigo);
  assert.equal(llamadas[2][1].detalle.create[0].centroOperacionCodigo, clave.centroOperacionCodigo);
  assert.equal(llamadas[2][1].detalle.create[0].tipoDocumentoCodigo, 'FEV');
  assert.equal(llamadas[2][1].detalle.create[0].numeroFactura, 184);
  assert.equal(llamadas[2][1].detalle.create[0].fecha.toISOString(), '2026-11-06T15:00:00.000Z');
  assert.equal(llamadas[2][1].detalle.create[0].usuario, 'cajero606');
  assert.equal(factura.consecutivo, 184);
  assert.equal(factura.numeroFactura, '184');
});

test('rechaza consecutivos invalidos y tipos de otro centro antes de insertar', async () => {
  const transaccion = {
    usuario: { async findUnique() { return { usuario: 'cajero' }; } },
    tipoDocumento: { async findUnique() { return { ...clave, centroOperacionCodigo: '607' }; } },
    facturaCabecera: { async create() { assert.fail('No debe insertar'); } },
    factura: { create() {} },
  };
  const cliente = adaptar({ factura: transaccion.factura, async $transaction(trabajo) { return trabajo(transaccion); } });
  const data = { ...clave, tipoDocumentoId: 'tipo', usuarioId: 'usuario' };
  await assert.rejects(cliente.factura.create({ data: { ...data, numeroFactura: 'DVP184' } }), { status: 400 });
  await assert.rejects(cliente.factura.create({ data }), { status: 409 });
});

for (const delegado of ['factura', 'facturaVenta']) {
  test(`${delegado} completa un detalle anidado con su cabecera real y preserva sus importes`, async () => {
    let guardado;
    const fecha = new Date('2026-11-06T17:50:43.075Z');
    const tx = {
      usuario: { findUnique: async () => ({ usuario: 'admin' }) },
      tipoDocumento: { findUnique: async () => ({ ...clave, codigo: clave.tipoDocumentoCodigo }) },
      [`${delegado}Cabecera`]: { create: async ({ data }) => ({ ...data, createdAt: fecha }) },
      [delegado]: { create: async ({ data }) => { guardado = data; return { ...data, id: 'factura-prueba' }; } },
    };
    const cliente = adaptar({ [delegado]: tx[delegado], $transaction: (trabajo) => trabajo(tx) });
    await cliente[delegado].create({ data: {
      ...clave, usuarioId: 'usuario-prueba', tipoDocumentoId: 'tipo-prueba', total: 8640,
      detalle: { create: {
        productoId: 'producto-prueba', productoCodigo: '0004', productoNombre: 'CHUZO DE CHORIZO', unidad: 'UND',
        cantidad: 1, precioUnitario: 8000, iva: 640, total: 8640,
        companiaCodigo: '999', numeroFactura: 999, tipoDocumentoCodigo: 'INCORRECTO', usuario: 'otro',
      } },
    } });
    assert.deepEqual(guardado.detalle.create, {
      productoId: 'producto-prueba', productoCodigo: '0004', productoNombre: 'CHUZO DE CHORIZO', unidad: 'UND',
      cantidad: 1, precioUnitario: 8000, iva: 640, total: 8640,
      companiaCodigo: clave.companiaCodigo, centroOperacionCodigo: clave.centroOperacionCodigo,
      tipoDocumentoCodigo: clave.tipoDocumentoCodigo, numeroFactura: clave.numeroFactura, fecha, usuario: 'admin',
    });
  });
}

test('actualiza estado DIAN en cabecera dentro de la transaccion', async () => {
  let actualizacion;
  const transaccion = {
    factura: { async findUniqueOrThrow({ select }) {
      return select ? clave : { id: 'uuid', ...clave, cabecera: { estadoDIAN: 'ACEPTADA' } };
    }, update() {} },
    facturaCabecera: { async update(consulta) { actualizacion = consulta; } },
  };
  const cliente = adaptar({ factura: transaccion.factura, async $transaction(trabajo) { return trabajo(transaccion); } });
  const factura = await cliente.factura.update({ where: { id: 'uuid' }, data: { estadoDIAN: 'ACEPTADA' } });
  assert.deepEqual(actualizacion, {
    where: { companiaCodigo_centroOperacionCodigo_tipoDocumentoCodigo_numeroFactura: {
      companiaCodigo: clave.companiaCodigo, centroOperacionCodigo: clave.centroOperacionCodigo,
      tipoDocumentoCodigo: clave.tipoDocumentoCodigo, numeroFactura: clave.numeroFactura,
    } }, data: { estadoDIAN: 'ACEPTADA' },
  });
  assert.equal(factura.estadoDIAN, 'ACEPTADA');
});