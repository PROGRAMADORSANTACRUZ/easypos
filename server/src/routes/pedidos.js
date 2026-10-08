import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { prisma } from '../prisma.js';
import { calcularInsumosRequeridos, validarStockSuficiente, descontarInsumos, revertirInsumos } from '../inventarioKits.js';
import { imprimirComandaPorEstacion } from '../impresionCocina.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

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
  clienteRel: true,
  items: { include: { producto: { include: { categoria: true, componentes: { include: { item: true } } } } } },
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
    max = Math.min(max, Math.floor(c.item.stock / c.cantidad));
  }
  return Number.isFinite(max) ? max : 0;
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
  await tx.preparacionCocina.upsert({
    where: { pedidoId },
    create: { pedidoId, mesaId: pedido.mesaId, productos: resumen, listo: false },
    update: { productos: resumen, listo: false, fechaListo: null },
  });
}

// Listar pedidos (filtro opcional ?estado=ABIERTO)
router.get('/', wrap(async (req, res) => {
  const { estado } = req.query;
  const pedidos = await prisma.pedido.findMany({
    where: estado ? { estado } : undefined,
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
  res.json(pedido);
}));

// Crear pedido y ocupar la mesa
// body: { mesaId, meseraId, items: [{ productoId, cantidad, notas? }] }
router.post('/', wrap(async (req, res) => {
  const { mesaId, meseraId, items = [], observaciones } = req.body;
  if (!mesaId || !meseraId) return res.status(400).json({ error: 'mesaId y meseraId son requeridos' });

  const productos = await prisma.producto.findMany({
    where: { id: { in: items.map((i) => String(i.productoId)) } },
    include: { componentes: true },
  });
  const precioDe = (id) => productos.find((p) => p.id === String(id))?.precio ?? 0;
  const itemsNorm = items.map((i) => ({ productoId: String(i.productoId), cantidad: Number(i.cantidad) || 1 }));
  const requeridos = calcularInsumosRequeridos(itemsNorm, productos);

  let pedido;
  try {
    pedido = await prisma.$transaction(async (tx) => {
      const mesa = await tx.mesa.findUnique({
        where: { id: Number(mesaId) },
        select: {
          id: true,
          numero: true,
          estado: true,
          reservaClienteId: true,
          reservaCliente: { select: { nombre: true, razonSocial: true } },
        },
      });
      if (!mesa) throw Object.assign(new Error('Mesa no encontrada'), { status: 404 });
      if (mesa.estado === 'OCUPADA') throw Object.assign(new Error(`La mesa ${mesa.numero} ya está ocupada`), { status: 409 });
      const pedidoAbierto = await tx.pedido.findFirst({ where: { mesaId: Number(mesaId), estado: 'ABIERTO' }, select: { id: true } });
      if (pedidoAbierto) throw Object.assign(new Error(`La mesa ${mesa.numero} ya tiene un pedido abierto`), { status: 409 });
      await validarStockSuficiente(tx, requeridos);
      const nuevo = await tx.pedido.create({
        data: {
          mesaId: Number(mesaId),
          meseraId: Number(meseraId),
          clienteId: mesa.reservaClienteId,
          cliente: mesa.reservaCliente?.razonSocial || mesa.reservaCliente?.nombre || null,
          observaciones: observaciones ? String(observaciones).trim() || null : null,
          items: {
            create: items.map((i) => ({
              productoId: String(i.productoId),
              cantidad: Number(i.cantidad) || 1,
              precioUnit: precioDe(i.productoId),
              notas: i.notas || null,
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
      await descontarInsumos(tx, requeridos, { documentoReferencia: `Pedido #${nuevo.id}` });
      await sincronizarCocina(tx, nuevo.id);
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
router.post('/online', wrap(async (req, res) => {
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
    include: { componentes: { include: { item: true } } },
  });
  for (const it of items) {
    const p = productos.find((x) => x.id === String(it.productoId));
    if (!p) return res.status(404).json({ error: 'Producto no encontrado' });
    const disp = disponibilidadKit(p);
    const cant = Number(it.cantidad) || 1;
    if (disp != null && cant > disp) {
      return res.status(409).json({ error: `Sin inventario suficiente de "${p.nombre}" (disponible ${disp})` });
    }
  }
  const precioDe = (id) => productos.find((p) => p.id === String(id))?.precio ?? 0;
  const itemsNorm = items.map((i) => ({ productoId: String(i.productoId), cantidad: Number(i.cantidad) || 1 }));
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
          create: items.map((i) => ({
            productoId: String(i.productoId),
            cantidad: Number(i.cantidad) || 1,
            precioUnit: precioDe(i.productoId),
          })),
        },
      },
      include: pedidoInclude,
    });
    await descontarInsumos(tx, requeridos, { documentoReferencia: `Pedido #${nuevo.id}` });
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
router.put('/:id/estado-entrega', wrap(async (req, res) => {
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
router.post('/:id/ubicacion', wrap(async (req, res) => {
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
router.post('/:id/items', wrap(async (req, res) => {
  const { productoId, cantidad, notas } = req.body;
  const pedidoId = Number(req.params.id);
  const producto = await prisma.producto.findUnique({ where: { id: String(productoId) }, include: { componentes: true, categoria: true } });
  if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });

  const cant = Number(cantidad) || 1;
  const requeridos = calcularInsumosRequeridos([{ productoId: String(productoId), cantidad: cant }], [producto]);

  try {
    await prisma.$transaction(async (tx) => {
      await validarStockSuficiente(tx, requeridos);
      const existente = await tx.pedidoItem.findFirst({
        where: { pedidoId, productoId: String(productoId) },
      });
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
            precioUnit: producto.precio,
            notas: notas || null,
          },
        });
      }
      await descontarInsumos(tx, requeridos, { documentoReferencia: `Pedido #${pedidoId}` });
      await sincronizarCocina(tx, pedidoId, { soloNuevosItems: true });
    });
  } catch (e) {
    return res.status(409).json({ error: e.message });
  }
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId }, include: pedidoInclude });
  imprimirComandaPorEstacion(pedido, [{ cantidad: cant, notas: notas || null, producto }]).catch(() => {});
  res.status(201).json(pedido);
}));


// Cambiar la cantidad de un item (si llega a 0 o menos, se elimina). Ajusta el inventario por la diferencia.
router.put('/:id/items/:itemId', wrap(async (req, res) => {
  const cant = Number(req.body.cantidad);
  const itemId = Number(req.params.itemId);
  const actual = await prisma.pedidoItem.findUnique({ where: { id: itemId }, include: { producto: { include: { componentes: true } } } });
  if (!actual) return res.status(404).json({ error: 'Item no encontrado' });

  const diferencia = (cant && cant > 0 ? cant : 0) - actual.cantidad; // positivo: consume mas, negativo: devuelve
  try {
    await prisma.$transaction(async (tx) => {
      if (diferencia > 0) {
        const requeridos = calcularInsumosRequeridos([{ productoId: actual.productoId, cantidad: diferencia }], [actual.producto]);
        await validarStockSuficiente(tx, requeridos);
        await descontarInsumos(tx, requeridos, { documentoReferencia: `Pedido #${actual.pedidoId}` });
      } else if (diferencia < 0) {
        const requeridos = calcularInsumosRequeridos([{ productoId: actual.productoId, cantidad: -diferencia }], [actual.producto]);
        await revertirInsumos(tx, requeridos, { documentoReferencia: `Pedido #${actual.pedidoId}` });
      }
      if (!cant || cant <= 0) {
        await tx.pedidoItem.delete({ where: { id: itemId } });
      } else {
        await tx.pedidoItem.update({ where: { id: itemId }, data: { cantidad: cant } });
      }
    });
  } catch (e) {
    return res.status(409).json({ error: e.message });
  }
  const pedido = await prisma.pedido.findUnique({ where: { id: Number(req.params.id) }, include: pedidoInclude });
  res.json(pedido);
}));

// Quitar item (devuelve sus insumos al inventario)
router.delete('/:id/items/:itemId', wrap(async (req, res) => {
  const itemId = Number(req.params.itemId);
  const actual = await prisma.pedidoItem.findUnique({ where: { id: itemId }, include: { producto: { include: { componentes: true } } } });
  if (!actual) return res.status(404).json({ error: 'Item no encontrado' });
  const requeridos = calcularInsumosRequeridos([{ productoId: actual.productoId, cantidad: actual.cantidad }], [actual.producto]);
  await prisma.$transaction(async (tx) => {
    await revertirInsumos(tx, requeridos, { documentoReferencia: `Pedido #${actual.pedidoId}` });
    await tx.pedidoItem.delete({ where: { id: itemId } });
  });
  const pedido = await prisma.pedido.findUnique({ where: { id: Number(req.params.id) }, include: pedidoInclude });
  res.json(pedido);
}));

// Reenviar pedido editado: registra en el log qué cambió
// body: { cambios: "texto" }
router.post('/:id/reenviar', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const texto = (req.body?.cambios || '').trim();
  const { observaciones } = req.body;
  const actual = await prisma.pedido.findUnique({ where: { id } });
  if (!actual) return res.status(404).json({ error: 'Pedido no encontrado' });

  const linea = texto ? `[${new Date().toLocaleString('es-CO')}] ${texto}` : null;
  const cambios = [actual.cambios, linea].filter(Boolean).join('\n');

  const pedido = await prisma.$transaction(async (tx) => {
    const actualizado = await tx.pedido.update({
      where: { id },
      data: {
        editado: true,
        cambios: cambios || null,
        ...(observaciones !== undefined && { observaciones: observaciones ? String(observaciones).trim() || null : null }),
      },
      include: pedidoInclude,
    });
    // Refleja el cambio en la bitacora PedidosMesa y vuelve a marcar la comanda como pendiente en cocina
    await tx.pedidoMesa.updateMany({ where: { pedidoId: id }, data: { editado: true, cambios: cambios || null } });
    await tx.preparacionCocina.updateMany({ where: { pedidoId: id }, data: { listo: false, fechaListo: null } });
    return actualizado;
  });
  res.json(pedido);
}));

// Mover un pedido abierto a otra mesa: libera la mesa anterior, ocupa la nueva
// y deja registro del movimiento en el log (visible en facturación).
// body: { mesaId }
router.post('/:id/cambiar-mesa', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const nuevaMesaId = Number(req.body?.mesaId);
  if (!nuevaMesaId) return res.status(400).json({ error: 'mesaId es requerido' });

  const pedido = await prisma.pedido.findUnique({ where: { id }, include: { mesa: true } });
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (pedido.estado !== 'ABIERTO') return res.status(400).json({ error: 'Solo se pueden mover pedidos abiertos' });
  if (pedido.mesaId === nuevaMesaId) return res.status(400).json({ error: 'El pedido ya está en esa mesa' });

  const destino = await prisma.mesa.findUnique({ where: { id: nuevaMesaId } });
  if (!destino) return res.status(404).json({ error: 'Mesa destino no encontrada' });
  if (destino.estado === 'RESERVADA') return res.status(409).json({ error: `La mesa ${destino.numero} está reservada` });

  const ocupada = await prisma.pedido.findFirst({ where: { mesaId: nuevaMesaId, estado: 'ABIERTO' } });
  if (ocupada) return res.status(409).json({ error: `La mesa ${destino.numero} ya tiene un pedido abierto` });

  const linea = `[${new Date().toLocaleString('es-CO')}] Movimiento de mesa: Mesa ${pedido.mesa?.numero ?? '?'} → Mesa ${destino.numero}`;
  const cambios = [pedido.cambios, linea].filter(Boolean).join('\n');

  const actualizado = await prisma.$transaction(async (tx) => {
    if (pedido.mesaId) await tx.mesa.update({ where: { id: pedido.mesaId }, data: { estado: 'LIBRE' } });
    await tx.mesa.update({ where: { id: nuevaMesaId }, data: { estado: 'OCUPADA' } });
    return tx.pedido.update({
      where: { id },
      data: { mesaId: nuevaMesaId, editado: true, cambios },
      include: pedidoInclude,
    });
  });

  res.json(actualizado);
}));

// Cancelar pedido, devolver los insumos consumidos al inventario y liberar la mesa
router.post('/:id/cancelar', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const actual = await prisma.pedido.findUnique({
    where: { id },
    include: { items: { include: { producto: { include: { componentes: true } } } } },
  });
  if (!actual) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (actual.estado !== 'ABIERTO') return res.status(400).json({ error: 'Solo se pueden cancelar pedidos abiertos' });

  const itemsNorm = actual.items.map((it) => ({ productoId: it.productoId, cantidad: it.cantidad }));
  const requeridos = calcularInsumosRequeridos(itemsNorm, actual.items.map((it) => it.producto));

  const pedido = await prisma.$transaction(async (tx) => {
    await revertirInsumos(tx, requeridos, { documentoReferencia: `Pedido #${id} (cancelado)` });
    const p = await tx.pedido.update({ where: { id }, data: { estado: 'CANCELADO' } });
    if (p.mesaId) await tx.mesa.update({ where: { id: p.mesaId }, data: { estado: 'LIBRE' } });
    return p;
  });
  res.json(pedido);
}));

export default router;
