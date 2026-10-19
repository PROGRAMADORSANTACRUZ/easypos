import { inicioDiaColombia, finDiaColombia } from './fechaColombia.js';

export const ACCIONES_COCINA = ['COCINA_ENTREGADO', 'COCINA_RECHAZADO', 'COCINA_REABIERTO'];

export function filtroFechaCocina(desde, hasta) {
  for (const dia of [desde, hasta].filter(Boolean)) {
    const fecha = new Date(`${dia}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || !Number.isFinite(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== dia) {
      throw Object.assign(new Error('Fecha invalida'), { status: 400 });
    }
  }
  if (desde && hasta && desde > hasta) throw Object.assign(new Error('La fecha inicial debe ser menor o igual a la final'), { status: 400 });
  return { ...(desde && { gte: inicioDiaColombia(desde) }), ...(hasta && { lt: finDiaColombia(hasta) }) };
}

export function detalleEventoCocina(evento) {
  try { return JSON.parse(evento.detalle || '{}'); } catch { return {}; }
}

export function estadoPreparacion(preparacion, evento) {
  if (!evento || evento.accion === 'COCINA_REABIERTO') return preparacion.listo ? 'LISTO' : 'PENDIENTE';
  const detalle = detalleEventoCocina(evento);
  if (detalle.productos !== preparacion.productos || (detalle.cambios || '') !== (preparacion.pedido?.cambios || '')) {
    return preparacion.listo ? 'LISTO' : 'PENDIENTE';
  }
  if (evento.accion === 'COCINA_ENTREGADO' && !preparacion.listo) return 'PENDIENTE';
  if (preparacion.fechaListo && new Date(preparacion.fechaListo) > new Date(evento.createdAt)) return 'LISTO';
  return evento.accion === 'COCINA_ENTREGADO' ? 'ENTREGADO' : 'RECHAZADO';
}

export function filaPreparacion(preparacion) {
  return {
    id: `listo-${preparacion.consecutivo}`,
    pedidoId: preparacion.pedidoId,
    fecha: preparacion.fechaListo,
    estado: 'LISTO',
    mesa: preparacion.mesa?.numero ?? null,
    tipo: preparacion.pedido?.tipo || 'MESA',
    consecutivoDia: preparacion.pedido?.consecutivoDia ?? null,
    productos: preparacion.productos,
    cocineroId: preparacion.cocineroId,
    cocinero: preparacion.cocinero?.nombre || '',
    mesera: preparacion.pedido?.mesera?.nombre || '',
    pedidoEstado: preparacion.pedido?.estado || '',
    motivo: '',
    cambios: preparacion.pedido?.cambios || '',
  };
}

export function combinarHistorialCocina(preparaciones, eventos) {
  const filas = eventos.filter((evento) => evento.accion !== 'COCINA_REABIERTO').map((evento) => ({
    ...detalleEventoCocina(evento),
    id: `evento-${evento.id}`,
    fecha: evento.createdAt,
    estado: evento.accion === 'COCINA_ENTREGADO' ? 'ENTREGADO' : 'RECHAZADO',
  }));
  for (const preparacion of preparaciones) {
    if (!preparacion.listo || !preparacion.fechaListo) continue;
    const finalizada = filas.some((fila) => fila.pedidoId === preparacion.pedidoId && new Date(fila.fecha) >= new Date(preparacion.fechaListo));
    if (!finalizada) filas.push(filaPreparacion(preparacion));
  }
  return filas.sort((primera, segunda) => new Date(segunda.fecha) - new Date(primera.fecha));
}

export async function registrarResultadoCocina(db, { pedidoId, estado, cocineroId, motivo, usuarioId }) {
  const fallar = (mensaje, status = 400) => { throw Object.assign(new Error(mensaje), { status }); };
  if (!Number.isSafeInteger(pedidoId) || pedidoId <= 0) fallar('Pedido invalido');
  if (!['ENTREGADO', 'RECHAZADO', 'REABIERTO'].includes(estado)) fallar('Estado de cocina invalido');
  const razon = String(motivo || '').trim();
  if (estado === 'RECHAZADO' && (!razon || razon.length > 500)) fallar('Indica un motivo de rechazo de hasta 500 caracteres');
  if (cocineroId && (!Number.isSafeInteger(Number(cocineroId)) || Number(cocineroId) <= 0)) fallar('Cocinero invalido');

  return db.$transaction(async (tx) => {
    const pedido = await tx.pedido.findUnique({
      where: { id: pedidoId }, include: { mesa: true, mesera: true, items: { include: { producto: true } } },
    });
    if (!pedido) fallar('Pedido no encontrado', 404);
    if (pedido.estado !== 'ABIERTO') fallar('Solo se pueden gestionar comandas de pedidos abiertos', 409);
    const preparacion = await tx.preparacionCocina.findUnique({ where: { pedidoId } });
    const productos = pedido.items.map((item) => `${item.cantidad}x ${item.producto?.nombre || ''}`).join(', ');
    const anterior = await tx.auditoria.findFirst({
      where: { entidad: 'PreparacionCocina', entidadId: String(pedidoId), accion: { in: ACCIONES_COCINA } },
      orderBy: { createdAt: 'desc' },
    });
    const actual = estadoPreparacion({ ...preparacion, productos, pedido }, anterior);
    if (estado !== 'REABIERTO' && ['ENTREGADO', 'RECHAZADO'].includes(actual)) fallar('Esta comanda ya tiene un resultado registrado', 409);
    if (estado === 'ENTREGADO' && !preparacion?.listo) fallar('Marca primero la comanda como lista', 409);
    const responsableId = cocineroId ? Number(cocineroId) : preparacion?.cocineroId || null;
    const cocinero = responsableId ? await tx.cocinero.findUnique({ where: { id: responsableId } }) : null;
    if (responsableId && (!cocinero || cocinero.activo === false)) fallar('Cocinero no disponible');
    await tx.preparacionCocina.upsert({
      where: { pedidoId },
      create: { pedidoId, mesaId: pedido.mesaId, productos, cocineroId: responsableId, listo: false },
      update: estado === 'ENTREGADO'
        ? { cocineroId: responsableId }
        : { productos, cocineroId: responsableId, listo: false, fechaListo: null },
    });
    const detalle = {
      pedidoId, productos, mesa: pedido.mesa?.numero ?? null, tipo: pedido.tipo,
      consecutivoDia: pedido.consecutivoDia ?? null, pedidoEstado: pedido.estado,
      cocineroId: responsableId, cocinero: cocinero?.nombre || '', mesera: pedido.mesera?.nombre || '',
      motivo: estado === 'RECHAZADO' ? razon : '', cambios: pedido.cambios || '',
    };
    const evento = await tx.auditoria.create({ data: {
      usuarioId: usuarioId || null, accion: `COCINA_${estado}`, entidad: 'PreparacionCocina',
      entidadId: String(pedidoId), detalle: JSON.stringify(detalle),
    } });
    return { ...detalle, estado, id: `evento-${evento.id}`, fecha: evento.createdAt };
  }, { isolationLevel: 'Serializable' });
}