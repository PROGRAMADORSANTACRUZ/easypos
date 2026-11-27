import assert from 'node:assert/strict';
import test from 'node:test';

process.env.JWT_SECRET ||= 'prueba-devoluciones';
process.env.DATABASE_URL ||= 'postgresql://test:test@127.0.0.1:1/test';
const { armarLineasDevolucion, disponiblesPorLinea, mediosDeFactura, totalDevolucion } = await import('../src/devolucionesNucleo.js');
const { construirPlanoDevolucion, construirPlanoVenta } = await import('../src/siesaVentas.js');
const { default: router } = await import('../src/routes/devoluciones.js');
const { tenantStorage } = await import('../src/prisma.js');

const detalles = [
  { id: 'l1', productoId: 'p1', productoCodigo: 'SAN01', productoNombre: 'SANCOCHO', unidad: 'UND', cantidad: 2, total: 52000 },
  { id: 'l2', productoId: 'p2', productoCodigo: 'COS01', productoNombre: 'COSTILLA', unidad: 'KG', cantidad: 1.5, total: 36000 },
];

test('devolucion parcial: valor proporcional al facturado y no deja pasar de lo vendido', () => {
  const lineas = armarLineasDevolucion(detalles, new Map(), [{ detalleId: 'l1', cantidad: 1 }, { detalleId: 'l2', cantidad: '0.5' }, { detalleId: 'l2x', cantidad: 0 }]);
  assert.deepEqual(lineas.map((l) => [l.facturaDetalleId, l.cantidad, l.total]), [['l1', 1, 26000], ['l2', 0.5, 12000]]);
  assert.equal(totalDevolucion(lineas), 38000);

  const yaDevuelto = new Map([['l1', 1]]);
  assert.deepEqual(disponiblesPorLinea(detalles, yaDevuelto).map((l) => l.disponible), [1, 1.5]);
  assert.throws(() => armarLineasDevolucion(detalles, yaDevuelto, [{ detalleId: 'l1', cantidad: 2 }]), /solo quedan 1 por devolver/);
  assert.throws(() => armarLineasDevolucion(detalles, new Map([['l1', 2]]), [{ detalleId: 'l1', cantidad: 1 }]), /ya se devolvió completo/);
  assert.throws(() => armarLineasDevolucion(detalles, new Map(), [{ detalleId: 'otra', cantidad: 1 }]), /no pertenece a la factura/);
  assert.throws(() => armarLineasDevolucion(detalles, new Map(), [{ detalleId: 'l1', cantidad: -1 }]), /Cantidad inválida/);
  assert.throws(() => armarLineasDevolucion(detalles, new Map(), [{ detalleId: 'l1', cantidad: 1 }, { detalleId: 'l1', cantidad: 1 }]), /repetido/);
  assert.throws(() => armarLineasDevolucion(detalles, new Map(), [{ detalleId: 'l1', cantidad: 0 }]), /al menos un producto/);
});

test('reconoce los medios con que se pago la factura', () => {
  assert.deepEqual(mediosDeFactura({ metodoPago1: 'efe', valor1: 50000, metodoPago2: 'DAT', valor2: 38000, metodoPago3: '0', valor3: 0, metodoPago4: 'TRA', valor4: 0 }), ['EFE', 'DAT']);
});

const devolucion = {
  companiaCodigo: '004', centroOperacionCodigo: '420', tipoDocumentoCodigo: '1NE', prefijo: 'DV', numero: 15,
  facturaPrefijo: 'FEV', facturaNumero: 1234, numeroDocumentoCliente: null, nombreCliente: 'CONSUMIDOR FINAL',
  formaPago: 'EFE', total: 26000, createdAt: new Date('2026-11-27T15:00:00Z'),
  detalle: [{ productoId: 'p1', productoCodigo: 'SAN01', unidad: 'UND', cantidad: 1, total: 26000 }],
};

test('la devolucion va a Siesa como 1NE con clase 525, concepto 502 y el medio con que se devolvio', () => {
  const plano = construirPlanoDevolucion(devolucion, new Map([['p1', { id: 'p1', codigo: 'SAN01', siesaId: '123' }]]));
  const [inicio, r461, r358, r470, fin] = plano;
  assert.equal(inicio, '000000100000001004');
  assert.equal(r461.slice(7, 11), '0461');
  assert.equal(r461.slice(21, 24), '420');
  assert.equal(r461.slice(24, 27), '1NE');
  assert.equal(r461.slice(27, 35), '00000015');
  assert.equal(r461.slice(35, 43), '20261127');
  assert.equal(r461.slice(58, 61), '525');
  assert.match(r461, /POS DEVOLUCION DV15 DE FEV1234/);
  assert.equal(r358.slice(32, 35), 'EFE');
  assert.equal(Number(r358.slice(35, 55)), 26000);
  assert.equal(r470.slice(7, 11), '0470');
  assert.equal(r470.slice(127, 130), '502');
  assert.equal(fin.slice(7, 15), '99990001');
  // La venta sigue saliendo con clase 522 y concepto 501
  const venta = construirPlanoVenta({ ...devolucion, tipoDocumentoCodigo: 'FEV', numeroFactura: 1234, metodoPago1: 'EFE', valor1: 26000 });
  assert.equal(venta[1].slice(58, 61), '522');
  assert.equal(venta[3].slice(127, 130), '501');
});

test('el agente recibe la devolucion despues de su factura y dependiendo de ella si van en el mismo lote', async () => {
  const { listarPendientesSiesa } = await import('../src/siesaProgramador.js');
  const db = {
    abono: { findMany: async () => [] },
    factura: { findMany: async () => [{ id: 'f1' }] },
    facturaVenta: { findMany: async () => [] },
    devolucion: { findMany: async () => [{ id: 'd1' }, { id: 'd2' }] },
    logIntegracion: { findMany: async ({ where }) => (where.tipo?.in?.includes('DEVOLUCION:d2') ? [{ tipo: 'DEVOLUCION:d2', estado: 'OK' }] : []) },
  };
  const items = await tenantStorage.run(db, () => listarPendientesSiesa({
    desde: new Date('2026-11-01'),
    preparar: {
      venta: async () => ({ lineas: ['venta'], clienteId: null }),
      devolucion: async (id) => ({ lineas: [`devolucion ${id}`], facturaId: 'f1', verificar: { tipo: '1NE', numero: 15 } }),
    },
  }));
  assert.deepEqual(items.map((item) => [item.clave, item.depende || null]), [['VENTA:f1', null], ['DEVOLUCION:d1', 'VENTA:f1']]);
  assert.equal(items[1].verificar.tipo, '1NE');
});

// --- Ruta con base simulada ---
function entorno({ credito = false, apertura = true, devueltoPrevio = 0 } = {}) {
  const registro = { devoluciones: [], movimientosCaja: [], entradas: [], reservas: 0 };
  const factura = {
    id: 'f1', companiaCodigo: '004', centroOperacionCodigo: '420', tipoDocumentoCodigo: 'FEV', prefijo: 'FEV', numeroFactura: 1234,
    credito, metodoPago1: 'DAT', valor1: 88000, nombreCliente: 'ANA', numeroDocumentoCliente: '123', clienteId: 'c1',
    detalle: detalles,
  };
  const db = {
    factura: { findFirst: async ({ where }) => (where.id === 'f1' ? factura : null) },
    facturaVenta: { findFirst: async () => null },
    formaPago: { findMany: async () => [{ id: 'EFE', formaPagoDian: '10' }, { id: 'DAT', formaPagoDian: '48' }] },
    aperturaCaja: { findFirst: async () => (apertura ? { id: 'ap1' } : null) },
    devolucionDetalle: { findMany: async () => (devueltoPrevio ? [{ facturaDetalleId: 'l1', cantidad: devueltoPrevio }] : []) },
    tipoDocumento: {
      findFirst: async ({ where }) => (where.clase === 'DEVOLUCION' ? { id: 't1', codigo: '1NE', prefijo: 'DV', consInicial: 1, consFinal: 999, consProximo: 15, companiaCodigo: '004', centroOperacionCodigo: '420' } : null),
      updateMany: async () => { registro.reservas += 1; return { count: 1 }; },
    },
    devolucion: { create: async ({ data }) => { const d = { id: 'd1', ...data, detalle: data.detalle.create }; registro.devoluciones.push(d); return d; } },
    producto: { findMany: async () => [{ id: 'p1', componentes: [{ itemId: 'i-carne', cantidad: 0.3 }] }, { id: 'p2', componentes: [] }] },
    bodega: { findFirst: async () => ({ id: 'b-compras' }) },
    inventarioItemBodega: { upsert: async () => ({}) },
    inventarioItem: { update: async () => ({}) },
    movimientoInventario: { create: async ({ data }) => { registro.entradas.push(data); return data; } },
    movimientoCaja: { create: async ({ data }) => { registro.movimientosCaja.push(data); return data; } },
    auditoria: { create: async () => ({}) },
    $transaction: async (trabajo) => trabajo(db),
  };
  const post = router.stack.find((capa) => capa.route?.path === '/' && capa.route.methods.post).route.stack[0].handle;
  const enviar = (body) => new Promise((resolve, reject) => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); } };
    const req = { body, headers: {}, usuario: { id: 'u1', nombre: 'Caja 1', centrosOperacion: [{ codigo: '420', companiaCodigo: '004', estado: 'Activo' }] } };
    tenantStorage.run(db, () => post(req, res, reject));
  });
  return { enviar, registro };
}

const pedido = { origen: 'factura', facturaId: 'f1', items: [{ detalleId: 'l1', cantidad: 1 }], motivo: 'Plato frio' };

test('registra la devolucion con numero 1NE, reintegra inventario y saca el efectivo de la caja', async () => {
  const { enviar, registro } = entorno();
  const r = await enviar({ ...pedido, formaPago: 'EFE' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.tipoDocumentoCodigo, '1NE');
  assert.equal(r.body.numero, 15);
  assert.equal(r.body.total, 26000);
  assert.equal(registro.reservas, 1);
  assert.deepEqual(registro.entradas.map((e) => [e.itemId, e.tipoMovimiento, e.cantidad]), [['i-carne', 'ENTRADA', 0.3]]);
  assert.deepEqual(registro.movimientosCaja.map((m) => [m.aperturaId, m.tipo, m.monto]), [['ap1', 'EGRESO', 26000]]);
});

test('un medio que no es efectivo no toca la caja; credito, falta de caja y exceso se rechazan', async () => {
  const conTarjeta = entorno();
  assert.equal((await conTarjeta.enviar({ ...pedido, formaPago: 'DAT' })).status, 201);
  assert.equal(conTarjeta.registro.movimientosCaja.length, 0);

  assert.match((await entorno({ credito: true }).enviar({ ...pedido, formaPago: 'EFE' })).body.error, /crédito/);
  assert.equal((await entorno({ apertura: false }).enviar({ ...pedido, formaPago: 'EFE' })).status, 409);
  const excedida = entorno({ devueltoPrevio: 2 });
  const r = await excedida.enviar({ ...pedido, formaPago: 'DAT' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /ya se devolvió completo/);
  assert.equal(excedida.registro.devoluciones.length, 0);
  assert.equal((await entorno().enviar({ ...pedido, formaPago: 'XXX' })).status, 400);
  assert.equal((await entorno().enviar({ ...pedido, formaPago: 'EFE', motivo: '' })).status, 400);
});
