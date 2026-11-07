export async function descontarStockMesa00(tx, productoId, cantidad) {
  if (!Number.isSafeInteger(cantidad) || cantidad <= 0) {
    throw Object.assign(new Error('La cantidad debe ser un entero positivo'), { status: 400 });
  }
  await tx.$queryRaw`SELECT "productoId" FROM "StockMesa00" WHERE "productoId" = ${productoId}::uuid FOR UPDATE`;
  const stock = await tx.stockMesa00.findUnique({ where: { productoId } });
  if (!stock || stock.cantidad < cantidad) {
    throw Object.assign(new Error('La existencia sugerida cambió; actualiza e intenta de nuevo'), { status: 409 });
  }
  const restante = stock.cantidad - cantidad;
  if (restante === 0) await tx.stockMesa00.delete({ where: { productoId } });
  else await tx.stockMesa00.update({ where: { productoId }, data: { cantidad: restante } });
  return restante;
}

export async function devolverStockMesa00(tx, productoId, cantidad) {
  if (!Number.isSafeInteger(cantidad) || cantidad <= 0) {
    throw Object.assign(new Error('La cantidad devuelta debe ser un entero positivo'), { status: 400 });
  }
  return tx.stockMesa00.upsert({
    where: { productoId },
    create: { productoId, cantidad },
    update: { cantidad: { increment: cantidad } },
  });
}

export async function validarSinSolicitudesMesa00Pendientes(tx, pedidoId) {
  const pendientes = await tx.solicitudMovimientoMesa00.count({ where: { pedidoId, estado: 'PENDIENTE' } });
  if (pendientes) {
    throw Object.assign(new Error('Hay solicitudes de traslado a Mesa 00 pendientes de aprobación'), { status: 409 });
  }
}

export function itemsDeInventarioNormal(items = []) {
  return items.map((item) => ({
    ...item,
    cantidad: Math.max(0, Number(item.cantidad) - (Number(item.cantidadMesa00) || 0)),
  })).filter((item) => item.cantidad > 0);
}