import { inicioDiaColombia, finDiaColombia } from './fechaColombia.js';

export function estadoActualPedido(pedido) {
  if (pedido?.estado === 'CANCELADO') return 'CANCELADO';
  if (pedido?.estado === 'FACTURADO') return 'FACTURADO';
  if (pedido?.preparacion?.listo) return 'DESPACHADO';
  return pedido?.preparacion ? 'EN_COCINA' : 'PENDIENTE';
}

export function filtroHistorialPedidos({ desde, hasta, motivo } = {}) {
  for (const dia of [desde, hasta].filter((valor) => valor !== undefined && valor !== '')) {
    const fecha = new Date(`${dia}T00:00:00Z`);
    if (typeof dia !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dia)
      || !Number.isFinite(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== dia) {
      throw Object.assign(new Error('Fecha inválida'), { status: 400 });
    }
  }
  if (desde && hasta && desde > hasta) {
    throw Object.assign(new Error('La fecha inicial debe ser menor o igual a la final'), { status: 400 });
  }
  if (motivo !== undefined && (typeof motivo !== 'string' || motivo.length > 1000)) {
    throw Object.assign(new Error('Motivo inválido (máximo 1000 caracteres)'), { status: 400 });
  }
  const razon = motivo?.trim();
  return {
    ...((desde || hasta) && { fecha: { ...(desde && { gte: inicioDiaColombia(desde) }), ...(hasta && { lt: finDiaColombia(hasta) }) } }),
    ...(razon && { motivo: { contains: razon, mode: 'insensitive' } }),
  };
}

const seleccionEstado = {
  id: true,
  usuarioId: true,
  mesaId: true,
  mesa: { select: { numero: true } },
  tipo: true,
  estado: true,
  observaciones: true,
  editado: true,
  cambios: true,
  preparacion: { select: { listo: true, fechaListo: true } },
  items: {
    orderBy: { id: 'asc' },
    select: {
      id: true, productoId: true, cantidad: true, precioUnit: true, notas: true,
      producto: { select: { nombre: true } },
    },
  },
};

export function validarMotivoCancelacion(valor) {
  const motivo = typeof valor === 'string' ? valor.trim() : '';
  if (!motivo || motivo.length > 1000) {
    throw Object.assign(new Error('Indica el motivo de cancelación (máximo 1000 caracteres).'), { status: 400 });
  }
  return motivo;
}

async function estadoPedido(tx, pedidoId) {
  const pedido = await tx.pedido.findUnique({ where: { id: pedidoId }, select: seleccionEstado });
  if (!pedido) throw Object.assign(new Error('Pedido no encontrado'), { status: 404 });
  return {
    id: pedido.id,
    usuarioId: pedido.usuarioId ?? null,
    mesaId: pedido.mesaId ?? null,
    mesaNumero: pedido.mesa?.numero ?? null,
    tipo: pedido.tipo,
    estado: pedido.estado,
    observaciones: pedido.observaciones ?? null,
    editado: pedido.editado ?? false,
    cambios: pedido.cambios ?? null,
    platoListo: pedido.preparacion?.listo ?? false,
    fechaPlatoListo: pedido.preparacion?.fechaListo ? new Date(pedido.preparacion.fechaListo).toISOString() : null,
    items: pedido.items.map((item) => ({
      id: item.id,
      productoId: item.productoId,
      nombre: item.producto?.nombre ?? null,
      cantidad: item.cantidad,
      precioUnit: item.precioUnit,
      notas: item.notas ?? null,
    })),
  };
}

export async function registrarEventoPedido(tx, req, pedidoId, accion, antes = null, { motivo, detalle } = {}) {
  const actor = req.usuario;
  if (!actor?.id || !actor.usuario || !actor.nombre) {
    throw Object.assign(new Error('Se requiere una sesión válida para registrar el movimiento.'), { status: 401 });
  }
  const despues = await estadoPedido(tx, pedidoId);
  await tx.pedidoEvento.create({
    data: {
      pedidoId,
      usuarioId: actor.id,
      usuarioCuenta: actor.usuario,
      usuarioNombre: actor.nombre,
      accion,
      motivo: accion === 'CANCELAR' ? validarMotivoCancelacion(motivo) : null,
      detalle: detalle || null,
      ...(antes && { antes }),
      despues,
    },
  });
}

export async function conEventoPedido(tx, req, pedidoId, accion, cambiar, opciones) {
  await tx.$queryRaw`SELECT "id" FROM "Pedido" WHERE "id" = ${pedidoId} FOR UPDATE`;
  const antes = await estadoPedido(tx, pedidoId);
  if (antes.estado !== 'ABIERTO') {
    throw Object.assign(new Error('Solo se pueden modificar pedidos abiertos'), { status: 409 });
  }
  const resultado = await cambiar(antes);
  await registrarEventoPedido(tx, req, pedidoId, accion, antes, opciones);
  return resultado;
}