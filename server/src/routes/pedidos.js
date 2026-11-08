import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';
import { calcularInsumosRequeridos, validarStockSuficiente, descontarInsumos, revertirInsumos } from '../inventarioKits.js';
import { imprimirComandaPorEstacion } from '../impresionCocina.js';
import { conEventoPedido, registrarEventoPedido, estadoAntesDeReenvio, validarAccesoMesaMesero, validarMotivoCancelacion } from '../historialPedidos.js';
import { consultarEntregaPedido, registrarResultadoCocinaTransaccion } from '../historialCocina.js';
import { descontarStockMesa00, devolverStockMesa00, itemsDeInventarioNormal } from '../stockMesa00.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const exigirPermiso = (codigo) => (req, res, next) => {
  const permisos = req.usuario?.permisos || [];
  if (permisos.includes(codigo)) return next();
  return res.status(403).json({ error: `No tienes permiso para ${codigo}` });
};

// Estados posibles del seguimiento de entrega a domicilio (en orden)
const ESTADOS_ENTREGA = ['RECIBIDO', 'EN_PREPARACION', 'EN_CAMINO', 'ENTREGADO', 'CANCELADO'];

const aNumero = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const pedidoInclude = {
  mesa: true,
  mesera: true,
  usuario: { select: { id: true, nombre: true, usuario: true } },
  clienteRel: true,
  items: { include: { producto: { include: { categoria: true, unidad: true, componentes: { include: { item: true } } } } } },
  facturas: true,
  facturasVenta: true,
};

const limpiar = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

// Calcula cuantas unidades del producto se pueden armar segun el stock de sus insumos.
// Devuelve null si el producto no es un kit (sin limite de inventario).
function disponibilidadKit(producto) {
  if (!producto.componentes || producto.componentes.length === 0) return null;
  let max = Infinity;
  for (const c of producto.componentes) {
    if (c.cantidad <= 0) continue;
    max = Math.min(max, c.item.stock / c.cantidad);
  }
  const factor = Number(producto.unidad?.factorConversion) > 0 ? Number(producto.unidad.factorConversion) : 1;
  return Number.isFinite(max) ? Math.floor(max * factor + 1e-9) / factor : 0;
}

function normalizarCantidades(items, productos) {
  const normalizados = [];
  for (const item of items) {
    const producto = productos.find((actual) => actual.id === String(item.productoId));
    if (!producto) return { error: `Producto ${item.productoId} no encontrado` };
    const cantidad = Number(item.cantidad);
    const factor = Number(producto.unidad?.factorConversion) > 0 ? Number(producto.unidad.factorConversion) : 1;
    if (!Number.isFinite(cantidad) || cantidad <= 0 || Math.abs(cantidad * factor - Math.round(cantidad * factor)) > 0.000001) {
      return { error: `Cantidad inválida para ${producto.nombre}; usa pasos de ${1 / factor} ${producto.unidad?.abreviatura || 'UND'}.` };
    }
    normalizados.push({ ...item, productoId: String(item.productoId), cantidad });
  }
  return { items: normalizados };
}

// Registra la bitacora PedidosMesa (una fila por producto) y actualiza/crea la
// confirmacion de cocina (PreparacionCocina), reabriendola (listo=false) porque el
// pedido acaba de crearse o cambiar. Debe llamarse dentro de una transaccion.
async function sincronizarCocina(tx, pedidoId, { soloNuevosItems } = {}) {
  const pedido = await tx.pedido.findUnique({
    where: { id: pedidoId },
    include: { items: { include: { producto: true } } },
  });
  if (!pedido) return;

  const preparacionAnterior = await tx.preparacionCocina.findUnique({ where: { pedidoId } });
  const itemsActuales = new Map(pedido.items.map((item) => [item.id, item]));
  const itemsListos = soloNuevosItems && Array.isArray(preparacionAnterior?.itemsListos)
    ? preparacionAnterior.itemsListos.filter((estado) => {
      const item = itemsActuales.get(Number(estado.pedidoItemId));
      return item && Number(estado.cantidad ?? item.cantidad) === item.cantidad;
    })
    : [];
  for (const item of pedido.items) {
    if (item.cantidadMesa00 < item.cantidad || itemsListos.some((estado) => Number(estado.pedidoItemId) === item.id)) continue;
    itemsListos.push({
      pedidoItemId: item.id,
      cantidad: item.cantidad,
      fechaListo: new Date().toISOString(),
      cocineroId: null,
      cocinero: 'Mesa 00',
      usuario: 'mesa00',
      usuarioNombre: 'Mesa 00',
    });
  }

  if (soloNuevosItems) {
    // Agregar solo las filas que aun no existen en PedidoMesa para este pedido
    const existentes = await tx.pedidoMesa.findMany({ where: { pedidoId }, select: { productoId: true } });
    const yaRegistrados = new Set(existentes.map((e) => e.productoId));
    for (const it of pedido.items) {
      if (yaRegistrados.has(it.productoId)) continue;
      await tx.pedidoMesa.create({
        data: {
          pedidoId,
          mesaId: pedido.mesaId,
          meseraId: pedido.meseraId,
          productoId: it.productoId,
          cantidad: it.cantidad,
          editado: pedido.editado,
          cambios: pedido.cambios,
        },
      });
    }
  } else {
    // Registro inicial completo
    for (const it of pedido.items) {
      await tx.pedidoMesa.create({
        data: {
          pedidoId,
          mesaId: pedido.mesaId,
          meseraId: pedido.meseraId,
          productoId: it.productoId,
          cantidad: it.cantidad,
          editado: pedido.editado,
          cambios: pedido.cambios,
        },
      });
    }
  }

  const resumen = pedido.items.map((it) => `${it.cantidad}x ${it.producto?.nombre || ''}`).join(', ');
  const listo = pedido.items.length > 0 && itemsListos.length === pedido.items.length;
  await tx.preparacionCocina.upsert({
    where: { pedidoId },
    create: { pedidoId, mesaId: pedido.mesaId, productos: resumen, itemsListos, listo, fechaListo: listo ? new Date() : null },
    update: { productos: resumen, itemsListos, listo, fechaListo: listo ? new Date() : null },
  });
}

// Listar pedidos (filtro opcional ?estado=ABIERTO)
router.get('/', wrap(async (req, res) => {
  const { estado } = req.query;
  const where = estado ? { estado } : {};
  if (req.usuario?.roles?.includes('MESERO') && !req.usuario.roles.includes('ADMIN')) {
    const mesasAsignadas = await prisma.mesa.findMany({ where: { esFantasma: false, usuarioAsignadoId: req.usuario.id }, select: { id: true } });
    where.mesaId = { in: mesasAsignadas.map((mesa) => mesa.id) };
  }
  const pedidos = await prisma.pedido.findMany({
    where: Object.keys(where).length ? where : undefined,
    include: pedidoInclude,
    orderBy: { createdAt: 'desc' },
  });

  // Consecutivo de entrada por día para domicilios (trazabilidad, estable por fecha en hora Colombia)
  if (pedidos.some((p) => p.tipo === 'DOMICILIO')) {
    const todos = await prisma.pedido.findMany({
      where: { tipo: 'DOMICILIO' },
      select: { id: true, createdAt: true },
      orderBy: { id: 'asc' },
    });
    const diaCol = (d) => new Date(d.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);
    const contador = {};
    const mapa = {};
    for (const t of todos) {
      const dia = diaCol(t.createdAt);
      contador[dia] = (contador[dia] || 0) + 1;
      mapa[t.id] = contador[dia];
    }
    for (const p of pedidos) if (p.tipo === 'DOMICILIO') p.consecutivoDia = mapa[p.id] || null;
  }

  res.json(pedidos);
}));

router.get('/ultimo-domicilio', wrap(async (req, res) => {
  const pedido = await prisma.pedido.findFirst({
    where: { usuarioId: req.usuario.id, tipo: 'DOMICILIO' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, seguimientoToken: true },
  });
  if (!pedido?.seguimientoToken) return res.json(null);
  res.json({ id: pedido.id, token: pedido.seguimientoToken });
}));

router.get('/:id', wrap(async (req, res) => {
  const pedido = await prisma.pedido.findUnique({
    where: { id: Number(req.params.id) },
    include: pedidoInclude,
  });
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
  await validarAccesoMesaMesero(prisma, req.usuario, pedido.mesaId);
  res.json(pedido);
}));

router.get('/:id/entrega', exigirPermiso('pedidos.ver'), wrap(async (req, res) => {
  const pedidoId = Number(req.params.id);
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId }, select: { mesaId: true } });
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
  await validarAccesoMesaMesero(prisma, req.usuario, pedido.mesaId);
  res.json(await consultarEntregaPedido(prisma, pedidoId));
}));

router.post('/:id/entregar', exigirPermiso('pedidos.editar'), wrap(async (req, res) => {
  const pedidoId = Number(req.params.id);
  try {
    const resultado = await prisma.$transaction(async (tx) => conEventoPedido(tx, req, pedidoId, 'ENTREGAR', async (pedido) => {
      if (pedido.tipo !== 'MESA') throw Object.assign(new Error('La entrega en mesa requiere un pedido de mesa'), { status: 400 });
      await registrarResultadoCocinaTransaccion(tx, { pedidoId, estado: 'ENTREGADO', usuario: req.usuario });
      return consultarEntregaPedido(tx, pedidoId);
    }, { detalle: 'Entrega de platos en mesa' }), { isolationLevel: 'Serializable' });
    res.json(resultado);
  } catch (error) {
    if (error.code === 'P2034') return res.status(409).json({ error: 'El pedido cambió; actualiza e intenta de nuevo' });
    throw error;
  }
}));

// Crear pedido y ocupar la mesa
// body: { mesaId, items: [{ productoId, cantidad, notas? }] }
router.post('/', exigirPermiso('pedidos.crear'), wrap(async (req, res) => {
  const { mesaId, items = [], observaciones } = req.body;
  const puedeGuardarObservaciones = req.usuario?.permisos?.includes('pedidos.observaciones');
  if (!mesaId) return res.status(400).json({ error: 'mesaId es requerido' });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Agrega al menos un producto' });

  const productos = await prisma.producto.findMany({
    where: { id: { in: items.map((i) => String(i.productoId)) } },
    include: { componentes: true, unidad: true },
  });
  const validacion = normalizarCantidades(items, productos);
  if (validacion.error) return res.status(400).json({ error: validacion.error });
  const itemsNorm = validacion.items;
  for (const item of itemsNorm) {
    const cantidadMesa00 = Number(item.cantidadMesa00 ?? 0);
    if (!Number.isSafeInteger(cantidadMesa00) || cantidadMesa00 < 0 || cantidadMesa00 > item.cantidad) {
      return res.status(400).json({ error: 'La cantidad tomada de Mesa 00 debe ser un entero dentro de la cantidad del producto' });
    }
    item.cantidadMesa00 = cantidadMesa00;
  }
  const precioDe = (id) => productos.find((p) => p.id === String(id))?.precio ?? 0;
  const itemsInventario = itemsDeInventarioNormal(itemsNorm);
  const requeridos = itemsInventario.length ? calcularInsumosRequeridos(itemsInventario, productos) : new Map();

  let pedido;
  try {
    pedido = await prisma.$transaction(async (tx) => {
      const mesa = await tx.mesa.findUnique({
        where: { id: Number(mesaId) },
        select: {
          id: true,
          numero: true,
          esFantasma: true,
          estado: true,
          reservaClienteId: true,
          reservaCliente: { select: { nombre: true, razonSocial: true } },
        },
      });
      if (!mesa) throw Object.assign(new Error('Mesa no encontrada'), { status: 404 });
      if (mesa.esFantasma) throw Object.assign(new Error('La mesa 00 almacena existencias y no recibe pedidos facturables'), { status: 400 });
      await validarAccesoMesaMesero(tx, req.usuario, mesa.id);
      if (mesa.estado === 'OCUPADA') throw Object.assign(new Error(`La mesa ${mesa.numero} ya está ocupada`), { status: 409 });
      const pedidoAbierto = await tx.pedido.findFirst({ where: { mesaId: Number(mesaId), estado: 'ABIERTO' }, select: { id: true } });
      if (pedidoAbierto) throw Object.assign(new Error(`La mesa ${mesa.numero} ya tiene un pedido abierto`), { status: 409 });
      for (const item of itemsNorm.filter((linea) => linea.cantidadMesa00 > 0)) {
        await descontarStockMesa00(tx, item.productoId, item.cantidadMesa00);
      }
      await validarStockSuficiente(tx, requeridos);
      const responsable = await tx.mesera.upsert({
        where: { codigo: `usuario:${req.usuario.id}` },
        create: { codigo: `usuario:${req.usuario.id}`, nombre: req.usuario.nombre, activa: true },
        update: { nombre: req.usuario.nombre, activa: true },
      });
      const nuevo = await tx.pedido.create({
        data: {
          mesaId: Number(mesaId),
          usuarioId: req.usuario.id,
          meseraId: responsable.id,
          clienteId: mesa.reservaClienteId,
          cliente: mesa.reservaCliente?.razonSocial || mesa.reservaCliente?.nombre || null,
          observaciones: puedeGuardarObservaciones && observaciones ? String(observaciones).trim() || null : null,
          items: {
            create: itemsNorm.map((item) => ({
              productoId: item.productoId,
              cantidad: item.cantidad,
              cantidadMesa00: item.cantidadMesa00,
              precioUnit: precioDe(item.productoId),
              notas: item.notas || null,
            })),
          },
        },
        include: pedidoInclude,
      });
      await tx.mesa.update({
        where: { id: Number(mesaId) },
        data: {
          estado: 'OCUPADA',
          reservaNombre: null,
          reservaTelefono: null,
          reservaFechaHora: null,
          reservaPersonas: null,
          reservaNotas: null,
          reservaItems: null,
          reservaClienteId: null,
        },
      });
      await sincronizarCocina(tx, nuevo.id);
      await registrarEventoPedido(tx, req, nuevo.id, 'CREAR');
      return nuevo;
    }, { timeout: 15000 });
  } catch (e) {
    return res.status(e.status || 409).json({ error: e.message });
  }

  imprimirComandaPorEstacion(pedido, pedido.items).catch(() => {});
  res.status(201).json(pedido);
}));

// Pedido en linea del cliente (auto-pedido / domicilio): el cliente digita sus datos,
// selecciona productos y su forma de pago. No usa mesa ni mesera.
// body: {
//   cliente: { nombres, apellidos, documento?, telefono?, email?, direccion?, barrio?, ciudad? },
//   items: [{ productoId, cantidad }],
//   metodoPago
// }
router.post('/online', exigirPermiso('pedidos.crear'), wrap(async (req, res) => {
  const { cliente = {}, items = [], metodoPago, latDestino, lngDestino } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Agrega al menos un producto' });
  }
  const nombres = limpiar(cliente.nombres);
  const apellidos = limpiar(cliente.apellidos);
  if (!nombres) return res.status(400).json({ error: 'Los nombres del cliente son obligatorios' });
  if (!limpiar(metodoPago)) return res.status(400).json({ error: 'Selecciona una forma de pago' });

  // Validar disponibilidad segun el inventario de cada kit
  const ids = items.map((i) => Number(i.productoId));
  const productos = await prisma.producto.findMany({
    where: { id: { in: items.map((i) => String(i.productoId)) } },
    include: { componentes: { include: { item: true } }, unidad: true },
  });
  const validacion = normalizarCantidades(items, productos);
  if (validacion.error) return res.status(400).json({ error: validacion.error });
  const itemsNorm = validacion.items;
  for (const it of items) {
    const p = productos.find((x) => x.id === String(it.productoId));
    if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
    const disp = disponibilidadKit(p);
    const cant = Number(it.cantidad);
    if (disp != null && cant > disp) {
      return res.status(409).json({ error: `Sin inventario suficiente de "${p.nombre}" (disponible ${disp})` });
    }
  }
  const precioDe = (id) => productos.find((p) => p.id === String(id))?.precio ?? 0;
  const requeridos = calcularInsumosRequeridos(itemsNorm, productos);

  const nombreCompleto = [nombres, apellidos].filter(Boolean).join(' ');
  const documento = limpiar(cliente.documento);

  let pedido;
  try {
    pedido = await prisma.$transaction(async (tx) => {
      await validarStockSuficiente(tx, requeridos);
      // Reutiliza el cliente si ya existe por documento; si no, lo crea
      let clienteRow = null;
    const datosCliente = {
      nombre: nombreCompleto,
      nombres,
      apellidos,
      documento,
      telefono: limpiar(cliente.telefono),
      email: limpiar(cliente.email),
      direccion: limpiar(cliente.direccion),
      barrio: limpiar(cliente.barrio),
      ciudad: limpiar(cliente.ciudad),
    };
    if (documento) {
      const existente = await tx.cliente.findUnique({ where: { documento } });
      clienteRow = existente
        ? await tx.cliente.update({ where: { id: existente.id }, data: datosCliente })
        : await tx.cliente.create({ data: datosCliente });
    } else {
      clienteRow = await tx.cliente.create({ data: datosCliente });
    }

    const nuevo = await tx.pedido.create({
      data: {
        tipo: 'DOMICILIO',
        usuarioId: req.usuario.id,
        metodoPago: limpiar(metodoPago),
        cliente: nombreCompleto,
        clienteId: clienteRow.id,
        estadoEntrega: 'RECIBIDO',
        latDestino: aNumero(latDestino),
        lngDestino: aNumero(lngDestino),
        seguimientoToken: randomUUID(),
        items: {
          create: itemsNorm.map((item) => ({
            productoId: item.productoId,
            cantidad: item.cantidad,
            precioUnit: precioDe(item.productoId),
          })),
        },
      },
      include: pedidoInclude,
    });
    return nuevo;
    }, { timeout: 15000 });
  } catch (e) {
    return res.status(409).json({ error: e.message });
  }

  imprimirComandaPorEstacion(pedido, pedido.items).catch(() => {});
  res.status(201).json(pedido);
}));

// Seguimiento público del pedido para el cliente (requiere el token entregado al crear).
// GET /pedidos/:id/seguimiento?token=...
router.get('/:id/seguimiento', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const token = limpiar(req.query.token);
  const pedido = await prisma.pedido.findUnique({
    where: { id },
    include: { items: { include: { producto: true } }, clienteRel: true },
  });
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (!pedido.seguimientoToken || pedido.seguimientoToken !== token) {
    return res.status(403).json({ error: 'Token de seguimiento inválido' });
  }
  const total = pedido.items.reduce((s, it) => s + it.precioUnit * it.cantidad, 0);
  res.json({
    id: pedido.id,
    estado: pedido.estado,
    estadoEntrega: pedido.estadoEntrega,
    repartidor: pedido.repartidor,
    cliente: pedido.cliente,
    direccion: pedido.clienteRel?.direccion || null,
    metodoPago: pedido.metodoPago,
    latDestino: pedido.latDestino,
    lngDestino: pedido.lngDestino,
    latRepartidor: pedido.latRepartidor,
    lngRepartidor: pedido.lngRepartidor,
    ubicacionActualizada: pedido.ubicacionActualizada,
    createdAt: pedido.createdAt,
    total,
    items: pedido.items.map((it) => ({
      nombre: it.producto?.nombre,
      cantidad: it.cantidad,
      precioUnit: it.precioUnit,
    })),
  });
}));

// El repartidor/administrador cambia el estado de la entrega.
// PUT /pedidos/:id/estado-entrega  body: { estadoEntrega, repartidor? }
router.put('/:id/estado-entrega', exigirPermiso('pedidos.editar'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const estadoEntrega = limpiar(req.body?.estadoEntrega);
  if (!estadoEntrega || !ESTADOS_ENTREGA.includes(estadoEntrega)) {
    return res.status(400).json({ error: 'Estado de entrega inválido' });
  }
  const data = { estadoEntrega };
  const repartidor = limpiar(req.body?.repartidor);
  if (repartidor !== null) data.repartidor = repartidor;
  const pedido = await prisma.pedido.update({ where: { id }, data, include: pedidoInclude });
  res.json(pedido);
}));

// El repartidor reporta su posición GPS mientras entrega.
// POST /pedidos/:id/ubicacion  body: { lat, lng, repartidor?, estadoEntrega? }
router.post('/:id/ubicacion', exigirPermiso('pedidos.editar'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const lat = aNumero(req.body?.lat);
  const lng = aNumero(req.body?.lng);
  if (lat === null || lng === null) {
    return res.status(400).json({ error: 'Coordenadas (lat, lng) requeridas' });
  }
  const data = {
    latRepartidor: lat,
    lngRepartidor: lng,
    ubicacionActualizada: new Date(),
  };
  const repartidor = limpiar(req.body?.repartidor);
  if (repartidor !== null) data.repartidor = repartidor;
  const estadoEntrega = limpiar(req.body?.estadoEntrega);
  if (estadoEntrega && ESTADOS_ENTREGA.includes(estadoEntrega)) data.estadoEntrega = estadoEntrega;
  const pedido = await prisma.pedido.update({ where: { id }, data, include: pedidoInclude });
  res.json(pedido);
}));

// Agregar item a un pedido abierto (si ya existe el producto, suma cantidad)
router.post('/:id/items', exigirPermiso('pedidos.editar'), wrap(async (req, res) => {
  const { productoId, cantidad, notas } = req.body;
  const pedidoId = Number(req.params.id);
  const producto = await prisma.producto.findUnique({ where: { id: String(productoId) }, include: { componentes: true, categoria: true } });
  if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });

  const cant = Number(cantidad) || 1;
  const cantidadMesa00 = Number(req.body?.cantidadMesa00 ?? 0);
  if (!Number.isSafeInteger(cantidadMesa00) || cantidadMesa00 < 0 || cantidadMesa00 > cant) {
    return res.status(400).json({ error: 'La cantidad tomada de Mesa 00 debe ser un entero dentro de la cantidad agregada' });
  }
  const cantidadInventario = cant - cantidadMesa00;
  const requeridos = cantidadInventario > 0
    ? calcularInsumosRequeridos([{ productoId: String(productoId), cantidad: cantidadInventario }], [producto])
    : new Map();

  try {
    await prisma.$transaction(async (tx) => conEventoPedido(tx, req, pedidoId, 'AGREGAR_PRODUCTO', async () => {
      const pedido = await tx.pedido.findUnique({ where: { id: pedidoId }, select: { inventarioDescontado: true } });
      if (!pedido) throw Object.assign(new Error('Pedido no encontrado'), { status: 404 });
      if (cantidadMesa00 > 0) await descontarStockMesa00(tx, String(productoId), cantidadMesa00);
      await validarStockSuficiente(tx, requeridos);
      const existente = cantidadMesa00 === 0 ? await tx.pedidoItem.findFirst({
        where: { pedidoId, productoId: String(productoId), cantidadMesa00: 0 },
      }) : null;
      if (existente) {
        await tx.pedidoItem.update({
          where: { id: existente.id },
          data: { cantidad: { increment: cant } },
        });
      } else {
        await tx.pedidoItem.create({
          data: {
            pedidoId,
            productoId: String(productoId),
            cantidad: cant,
            cantidadMesa00,
            precioUnit: producto.precio,
            notas: notas || null,
          },
        });
      }
      if (pedido.inventarioDescontado && cantidadInventario > 0) {
        await descontarInsumos(tx, requeridos, { documentoReferencia: `Pedido #${pedidoId}` });
      }
      await sincronizarCocina(tx, pedidoId, { soloNuevosItems: true });
    }));
  } catch (e) {
    return res.status(e.status || 409).json({ error: e.message });
  }
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId }, include: pedidoInclude });
  imprimirComandaPorEstacion(pedido, [{ cantidad: cant, notas: notas || null, producto }]).catch(() => {});
  res.status(201).json(pedido);
}));


// Cambiar la cantidad de un item (si llega a 0 o menos, se elimina). Ajusta el inventario por la diferencia.
router.put('/:id/items/:itemId', exigirPermiso('pedidos.editar'), wrap(async (req, res) => {
  const cant = Number(req.body.cantidad);
  const pedidoId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  try {
    await prisma.$transaction(async (tx) => conEventoPedido(tx, req, pedidoId, cant > 0 ? 'CAMBIAR_CANTIDAD' : 'QUITAR_PRODUCTO', async () => {
      const actual = await tx.pedidoItem.findFirst({
        where: { id: itemId, pedidoId },
        include: { producto: { include: { componentes: true } }, pedido: { select: { inventarioDescontado: true } } },
      });
      if (!actual) throw Object.assign(new Error('Item no encontrado en este pedido'), { status: 404 });
      const solicitudesPendientes = await tx.solicitudMovimientoMesa00.aggregate({
        where: { pedidoId, pedidoItemId: itemId, estado: 'PENDIENTE' },
        _sum: { cantidad: true },
      });
      if (Math.max(0, cant || 0) < (solicitudesPendientes._sum.cantidad || 0)) {
        throw Object.assign(new Error('La cantidad debe cubrir las solicitudes pendientes de Mesa 00'), { status: 409 });
      }
      const cantidadMesa00Actual = Number(actual.cantidadMesa00) || 0;
      const cantidadMesa00Restante = Math.min(cantidadMesa00Actual, Math.max(0, cant || 0));
      const cantidadMesa00Devuelta = cantidadMesa00Actual - cantidadMesa00Restante;
      if (cantidadMesa00Devuelta > 0) await devolverStockMesa00(tx, actual.productoId, cantidadMesa00Devuelta);
      const inventarioActual = actual.cantidad - cantidadMesa00Actual;
      const inventarioNuevo = Math.max(0, cant || 0) - cantidadMesa00Restante;
      const diferenciaInventario = inventarioNuevo - inventarioActual;
      if (diferenciaInventario > 0) {
        const requeridos = calcularInsumosRequeridos([{ productoId: actual.productoId, cantidad: diferenciaInventario }], [actual.producto]);
        await validarStockSuficiente(tx, requeridos);
        if (actual.pedido.inventarioDescontado) {
          await descontarInsumos(tx, requeridos, { documentoReferencia: `Pedido #${actual.pedidoId}` });
        }
      } else if (diferenciaInventario < 0 && actual.pedido.inventarioDescontado) {
        const requeridos = calcularInsumosRequeridos([{ productoId: actual.productoId, cantidad: -diferenciaInventario }], [actual.producto]);
        await revertirInsumos(tx, requeridos, { documentoReferencia: `Pedido #${actual.pedidoId}` });
      }
      if (!cant || cant <= 0) {
        await tx.pedidoItem.delete({ where: { id: itemId } });
      } else {
        await tx.pedidoItem.update({ where: { id: itemId }, data: { cantidad: cant, cantidadMesa00: cantidadMesa00Restante } });
      }
    }));
  } catch (e) {
    return res.status(e.status || 409).json({ error: e.message });
  }
  const pedido = await prisma.pedido.findUnique({ where: { id: Number(req.params.id) }, include: pedidoInclude });
  res.json(pedido);
}));

// Quitar item (devuelve sus insumos al inventario)
router.delete('/:id/items/:itemId', exigirPermiso('pedidos.editar'), wrap(async (req, res) => {
  const pedidoId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  await prisma.$transaction(async (tx) => conEventoPedido(tx, req, pedidoId, 'QUITAR_PRODUCTO', async () => {
    const actual = await tx.pedidoItem.findFirst({
      where: { id: itemId, pedidoId },
      include: { producto: { include: { componentes: true } }, pedido: { select: { inventarioDescontado: true } } },
    });
    if (!actual) throw Object.assign(new Error('Item no encontrado en este pedido'), { status: 404 });
    const pendientes = await tx.solicitudMovimientoMesa00.count({ where: { pedidoId, pedidoItemId: itemId, estado: 'PENDIENTE' } });
    if (pendientes) throw Object.assign(new Error('Resuelve primero la solicitud pendiente de Mesa 00'), { status: 409 });
    const cantidadMesa00 = Number(actual.cantidadMesa00) || 0;
    if (cantidadMesa00 > 0) await devolverStockMesa00(tx, actual.productoId, cantidadMesa00);
    const requeridos = calcularInsumosRequeridos(itemsDeInventarioNormal([actual]), [actual.producto]);
    if (actual.pedido.inventarioDescontado) {
      await revertirInsumos(tx, requeridos, { documentoReferencia: `Pedido #${actual.pedidoId}` });
    }
    await tx.pedidoItem.delete({ where: { id: itemId } });
  }));
  const pedido = await prisma.pedido.findUnique({ where: { id: Number(req.params.id) }, include: pedidoInclude });
  res.json(pedido);
}));

router.put('/:id/observaciones', exigirPermiso('pedidos.observaciones'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const observaciones = req.body?.observaciones ? String(req.body.observaciones).trim() || null : null;
  const linea = `[${new Date().toLocaleString('es-CO')}] Observaciones actualizadas`;
  const pedido = await prisma.$transaction(async (tx) => conEventoPedido(tx, req, id, 'OBSERVACIONES', async (antes) => {
    const cambios = [antes.cambios, linea].filter(Boolean).join('\n');
    await tx.pedido.update({ where: { id }, data: { observaciones, editado: true, cambios } });
    await tx.pedidoMesa.updateMany({ where: { pedidoId: id }, data: { editado: true, cambios } });
    await tx.preparacionCocina.updateMany({ where: { pedidoId: id }, data: { listo: false, fechaListo: null } });
    return tx.pedido.findUnique({ where: { id }, include: pedidoInclude });
  }));
  await auditar({ req, accion: 'EDITAR', entidad: 'pedido', entidadId: id, detalle: 'Observaciones actualizadas' });
  res.json(pedido);
}));

// Reenviar pedido editado: registra en el log qué cambió
// body: { cambios: "texto" }
router.post('/:id/reenviar', exigirPermiso('pedidos.editar'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const texto = (req.body?.cambios || '').trim();
  const { observaciones } = req.body;
  const puedeEditarObservaciones = req.usuario?.permisos?.includes('pedidos.observaciones');
  const linea = texto ? `[${new Date().toLocaleString('es-CO')}] ${texto}` : null;
  const pedido = await prisma.$transaction(async (tx) => conEventoPedido(tx, req, id, 'REENVIAR', async (antes) => {
    const cambios = [antes.cambios, linea].filter(Boolean).join('\n');
    const actualizado = await tx.pedido.update({
      where: { id },
      data: {
        editado: true,
        cambios: cambios || null,
        ...(observaciones !== undefined && puedeEditarObservaciones && { observaciones: observaciones ? String(observaciones).trim() || null : null }),
      },
      include: pedidoInclude,
    });
    // Refleja el cambio en la bitacora PedidosMesa y vuelve a marcar la comanda como pendiente en cocina
    await tx.pedidoMesa.updateMany({ where: { pedidoId: id }, data: { editado: true, cambios: cambios || null } });
    await tx.preparacionCocina.updateMany({ where: { pedidoId: id }, data: { listo: false, fechaListo: null } });
    return actualizado;
  }, { detalle: texto, resolverAntes: (tx, antes) => estadoAntesDeReenvio(tx, id, antes) }));
  res.json(pedido);
}));

// Mover un pedido abierto a otra mesa: libera la mesa anterior, ocupa la nueva
// y deja registro del movimiento en el log (visible en facturación).
// body: { mesaId }
router.post('/:id/cambiar-mesa', exigirPermiso('mesas.editar'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const nuevaMesaId = Number(req.body?.mesaId);
  if (!nuevaMesaId) return res.status(400).json({ error: 'mesaId es requerido' });

  const actualizado = await prisma.$transaction(async (tx) => conEventoPedido(tx, req, id, 'CAMBIAR_MESA', async (pedido) => {
    if (pedido.mesaId === nuevaMesaId) throw Object.assign(new Error('El pedido ya está en esa mesa'), { status: 400 });
    await tx.$queryRaw`SELECT "id" FROM "Mesa" WHERE "id" = ${nuevaMesaId} FOR UPDATE`;
    const destino = await tx.mesa.findUnique({ where: { id: nuevaMesaId } });
    if (!destino) throw Object.assign(new Error('Mesa destino no encontrada'), { status: 404 });
    if (destino.esFantasma) throw Object.assign(new Error('La mesa 00 solo recibe traslados aprobados por un administrador'), { status: 400 });
    await validarAccesoMesaMesero(tx, req.usuario, destino.id);
    if (destino.estado !== 'LIBRE') throw Object.assign(new Error(`La mesa ${destino.numero} no está disponible`), { status: 409 });
    const ocupada = await tx.pedido.findFirst({ where: { mesaId: nuevaMesaId, estado: 'ABIERTO' } });
    if (ocupada) throw Object.assign(new Error(`La mesa ${destino.numero} ya tiene un pedido abierto`), { status: 409 });
    const linea = `[${new Date().toLocaleString('es-CO')}] Movimiento de mesa: Mesa ${pedido.mesaNumero ?? '?'} → Mesa ${destino.numero}`;
    const cambios = [pedido.cambios, linea].filter(Boolean).join('\n');
    if (pedido.mesaId) await tx.mesa.update({ where: { id: pedido.mesaId }, data: { estado: 'LIBRE' } });
    await tx.mesa.update({ where: { id: nuevaMesaId }, data: { estado: 'OCUPADA' } });
    return tx.pedido.update({
      where: { id },
      data: { mesaId: nuevaMesaId, editado: true, cambios },
      include: pedidoInclude,
    });
  }));

  res.json(actualizado);
}));

// Cancelar pedido, devolver los insumos consumidos al inventario y liberar la mesa
router.post('/:id/cancelar', exigirPermiso('pedidos.eliminar'), wrap(async (req, res) => {
  const id = Number(req.params.id);
  const motivo = validarMotivoCancelacion(req.body?.motivo);
  const pedido = await prisma.$transaction(async (tx) => conEventoPedido(tx, req, id, 'CANCELAR', async () => {
    const pendientes = await tx.solicitudMovimientoMesa00.count({ where: { pedidoId: id, estado: 'PENDIENTE' } });
    if (pendientes) throw Object.assign(new Error('Resuelve primero las solicitudes pendientes de Mesa 00'), { status: 409 });
    const actual = await tx.pedido.findUnique({
      where: { id },
      include: { items: { include: { producto: { include: { componentes: true } } } } },
    });
    const itemsNorm = itemsDeInventarioNormal(actual.items);
    const requeridos = calcularInsumosRequeridos(itemsNorm, actual.items.map((it) => it.producto));
    if (actual.inventarioDescontado) {
      await revertirInsumos(tx, requeridos, { documentoReferencia: `Pedido #${id} (cancelado)` });
    }
    for (const item of actual.items) {
      if (Number(item.cantidadMesa00) > 0) await devolverStockMesa00(tx, item.productoId, Number(item.cantidadMesa00));
    }
    const p = await tx.pedido.update({ where: { id }, data: { estado: 'CANCELADO' } });
    if (p.mesaId) await tx.mesa.update({ where: { id: p.mesaId }, data: { estado: 'LIBRE' } });
    return p;
  }, { motivo }));
  res.json(pedido);
}));

export default router;
