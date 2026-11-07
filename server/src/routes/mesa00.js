import { Router } from 'express';
import { prisma } from '../prisma.js';
import { conEventoPedido, registrarEventoPedido } from '../historialPedidos.js';
import { calcularInsumosRequeridos, descontarInsumos, validarStockSuficiente } from '../inventarioKits.js';
import { devolverStockMesa00 } from '../stockMesa00.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const exigirPermiso = (codigo) => (req, res, next) => {
  if ((req.usuario?.permisos || []).includes(codigo)) return next();
  return res.status(403).json({ error: `No tienes permiso para ${codigo}` });
};

const soloAdmin = wrap(async (req, res, next) => {
  const admin = await prisma.usuarioRol.findFirst({
    where: { usuarioId: req.usuario.id, rol: { nombre: 'ADMIN' } },
    select: { usuarioId: true },
  });
  if (!admin) return res.status(403).json({ error: 'Solo el administrador puede gestionar movimientos de Mesa 00' });
  next();
});

const cantidadPositiva = (valor) => Number.isSafeInteger(Number(valor)) && Number(valor) > 0;
const actor = (usuario) => ({
  solicitadoPorId: usuario.id,
  solicitadoPor: usuario.usuario,
  solicitanteNombre: usuario.nombre,
});

router.get('/stock', exigirPermiso('pedidos.ver'), wrap(async (_req, res) => {
  const existencias = await prisma.stockMesa00.findMany({
    where: { cantidad: { gt: 0 }, producto: { activo: true } },
    include: { producto: { select: { id: true, nombre: true, precio: true, categoria: true, unidad: true } } },
    orderBy: { producto: { nombre: 'asc' } },
  });
  res.json(existencias.map(({ producto, cantidad, actualizado }) => ({ ...producto, cantidadMesa00: cantidad, actualizado })));
}));

router.get('/solicitudes/pendientes/count', soloAdmin, wrap(async (_req, res) => {
  res.json({ count: await prisma.solicitudMovimientoMesa00.count({ where: { estado: 'PENDIENTE' } }) });
}));

router.get('/solicitudes', soloAdmin, wrap(async (req, res) => {
  const estado = String(req.query.estado || 'PENDIENTE');
  if (!['PENDIENTE', 'APROBADA', 'RECHAZADA', 'TODAS'].includes(estado)) {
    return res.status(400).json({ error: 'Estado de solicitud inválido' });
  }
  const solicitudes = await prisma.solicitudMovimientoMesa00.findMany({
    where: estado === 'TODAS' ? undefined : { estado },
    include: {
      producto: { select: { id: true, nombre: true } },
      pedido: { select: { id: true, mesa: { select: { numero: true } }, mesera: { select: { nombre: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(solicitudes);
}));

router.get('/pedidos/:pedidoId/solicitudes', exigirPermiso('pedidos.ver'), wrap(async (req, res) => {
  const pedidoId = Number(req.params.pedidoId);
  res.json(await prisma.solicitudMovimientoMesa00.findMany({
    where: { pedidoId },
    select: { id: true, pedidoItemId: true, cantidad: true, estado: true, respuesta: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  }));
}));

router.post('/pedidos/:pedidoId/solicitudes', exigirPermiso('pedidos.editar'), wrap(async (req, res) => {
  const pedidoId = Number(req.params.pedidoId);
  const pedidoItemId = Number(req.body?.pedidoItemId);
  const cantidad = Number(req.body?.cantidad);
  if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0 || !Number.isSafeInteger(pedidoItemId) || pedidoItemId <= 0 || !cantidadPositiva(cantidad)) {
    return res.status(400).json({ error: 'Pedido, producto y cantidad positiva son obligatorios' });
  }
  try {
    const solicitud = await prisma.$transaction(async (tx) => conEventoPedido(
      tx, req, pedidoId, 'SOLICITAR_MESA00', async () => {
        const item = await tx.pedidoItem.findFirst({ where: { id: pedidoItemId, pedidoId }, include: { producto: true } });
        if (!item) throw Object.assign(new Error('El producto no pertenece a esta comanda'), { status: 404 });
        const pendientes = await tx.solicitudMovimientoMesa00.aggregate({
          where: { pedidoId, pedidoItemId, estado: 'PENDIENTE' },
          _sum: { cantidad: true },
        });
        const disponible = item.cantidad - (pendientes._sum.cantidad || 0);
        if (cantidad > disponible) throw Object.assign(new Error(`Solo puedes solicitar ${disponible} unidades de este producto`), { status: 409 });
        return tx.solicitudMovimientoMesa00.create({
          data: {
            pedidoId,
            pedidoItemId,
            productoId: item.productoId,
            productoNombre: item.producto.nombre,
            cantidad,
            ...actor(req.usuario),
          },
          include: { producto: { select: { id: true, nombre: true } } },
        });
      },
      { detalle: JSON.stringify({ pedidoItemId, cantidad, destino: 'MESA_00' }) },
    ), { isolationLevel: 'Serializable' });
    res.status(201).json(solicitud);
  } catch (error) {
    if (error.code === 'P2034') return res.status(409).json({ error: 'La comanda cambió; actualiza e intenta de nuevo' });
    if (error.status) return res.status(error.status).json({ error: error.message });
    throw error;
  }
}));

router.post('/solicitudes/:id/aprobar', soloAdmin, wrap(async (req, res) => {
  const id = String(req.params.id);
  const respuesta = String(req.body?.respuesta || '').trim() || null;
  try {
    const actualizada = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "SolicitudesMovimientoMesa00" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const solicitud = await tx.solicitudMovimientoMesa00.findUnique({ where: { id } });
      if (!solicitud) throw Object.assign(new Error('Solicitud no encontrada'), { status: 404 });
      if (solicitud.estado !== 'PENDIENTE') throw Object.assign(new Error('La solicitud ya fue atendida'), { status: 409 });

      return conEventoPedido(tx, req, solicitud.pedidoId, 'APROBAR_MESA00', async () => {
        const item = await tx.pedidoItem.findFirst({
          where: { id: solicitud.pedidoItemId, pedidoId: solicitud.pedidoId, productoId: solicitud.productoId },
          include: { producto: { include: { componentes: true } }, pedido: { select: { inventarioDescontado: true } } },
        });
        if (!item || item.cantidad < solicitud.cantidad) {
          throw Object.assign(new Error('La cantidad del pedido cambió; revisa la solicitud'), { status: 409 });
        }
        const pendientes = await tx.solicitudMovimientoMesa00.aggregate({
          where: { pedidoId: solicitud.pedidoId, pedidoItemId: solicitud.pedidoItemId, estado: 'PENDIENTE' },
          _sum: { cantidad: true },
        });
        if ((pendientes._sum.cantidad || 0) > item.cantidad) {
          throw Object.assign(new Error('Las solicitudes pendientes superan la cantidad actual del pedido'), { status: 409 });
        }

        const restante = item.cantidad - solicitud.cantidad;
        const cantidadMesa00Devuelta = Math.min(Number(item.cantidadMesa00) || 0, solicitud.cantidad);
        const cantidadMesa00Restante = (Number(item.cantidadMesa00) || 0) - cantidadMesa00Devuelta;
        const cantidadNuevaMesa00 = solicitud.cantidad - cantidadMesa00Devuelta;
        if (cantidadNuevaMesa00 > 0 && !item.pedido.inventarioDescontado) {
          const requeridos = calcularInsumosRequeridos(
            [{ productoId: item.productoId, cantidad: cantidadNuevaMesa00 }],
            [item.producto],
          );
          await validarStockSuficiente(tx, requeridos);
          await descontarInsumos(tx, requeridos, { documentoReferencia: `Traslado a Mesa 00 · Pedido #${solicitud.pedidoId}` });
        }
        if (restante > 0) {
          await tx.pedidoItem.update({ where: { id: item.id }, data: { cantidad: restante, cantidadMesa00: cantidadMesa00Restante } });
        } else {
          await tx.pedidoItem.delete({ where: { id: item.id } });
        }
        await devolverStockMesa00(tx, solicitud.productoId, solicitud.cantidad);
        await tx.solicitudMovimientoMesa00.update({
          where: { id },
          data: {
            estado: 'APROBADA', respuesta,
            decididoPorId: req.usuario.id, decididoPor: req.usuario.usuario,
            decisionNombre: req.usuario.nombre, decididoAt: new Date(),
          },
        });
        const quedan = await tx.pedidoItem.count({ where: { pedidoId: solicitud.pedidoId } });
        if (quedan === 0) {
          const pedido = await tx.pedido.findUnique({ where: { id: solicitud.pedidoId }, select: { mesaId: true } });
          await tx.pedido.update({ where: { id: solicitud.pedidoId }, data: { estado: 'CANCELADO', cambios: 'Pedido trasladado a Mesa 00 por aprobación administrativa' } });
          if (pedido?.mesaId) await tx.mesa.update({ where: { id: pedido.mesaId }, data: { estado: 'LIBRE' } });
        }
        return tx.solicitudMovimientoMesa00.findUnique({ where: { id }, include: { producto: true } });
      }, { detalle: JSON.stringify({ solicitudId: id, productoId: solicitud.productoId, cantidad: solicitud.cantidad }) });
    }, { isolationLevel: 'Serializable' });
    res.json(actualizada);
  } catch (error) {
    if (error.code === 'P2034') return res.status(409).json({ error: 'El pedido cambió; actualiza e intenta de nuevo' });
    if (error.status) return res.status(error.status).json({ error: error.message });
    throw error;
  }
}));

router.post('/solicitudes/:id/rechazar', soloAdmin, wrap(async (req, res) => {
  const id = String(req.params.id);
  const respuesta = String(req.body?.respuesta || '').trim();
  if (!respuesta || respuesta.length > 500) return res.status(400).json({ error: 'Indica el motivo de rechazo (máximo 500 caracteres)' });
  const solicitud = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "SolicitudesMovimientoMesa00" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const anterior = await tx.solicitudMovimientoMesa00.findUnique({ where: { id } });
    if (!anterior) throw Object.assign(new Error('Solicitud no encontrada'), { status: 404 });
    if (anterior.estado !== 'PENDIENTE') throw Object.assign(new Error('La solicitud ya fue atendida'), { status: 409 });
    const actualizada = await tx.solicitudMovimientoMesa00.update({
      where: { id },
      data: {
        estado: 'RECHAZADA', respuesta,
        decididoPorId: req.usuario.id, decididoPor: req.usuario.usuario,
        decisionNombre: req.usuario.nombre, decididoAt: new Date(),
      },
      include: { producto: true },
    });
    await registrarEventoPedido(tx, req, anterior.pedidoId, 'RECHAZAR_MESA00', null, {
      detalle: JSON.stringify({ solicitudId: id, productoId: anterior.productoId, cantidad: anterior.cantidad, respuesta }),
    });
    return actualizada;
  }, { isolationLevel: 'Serializable' });
  res.json(solicitud);
}));

export default router;