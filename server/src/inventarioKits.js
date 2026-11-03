// Logica compartida para descontar/revertir insumos de inventario segun la receta (kit) de cada producto.
// El descuento ocurre al tomar el pedido (mesa o domicilio), no al facturar, para que el
// stock refleje lo que ya se esta preparando en cocina.

// Agrupa cuantas unidades de cada insumo (InventarioItem) se requieren para una lista de items.
// items: [{ productoId, cantidad }], productos: [{ id, componentes: [{ itemId, cantidad }] }]
export const BODEGA_COMPRAS = 'Compras';

export function calcularInsumosRequeridos(items, productos) {
  const requeridos = new Map(); // itemId -> cantidad total
  for (const it of items) {
    const producto = productos.find((p) => p.id === String(it.productoId));
    if (!producto) continue;
    for (const c of producto.componentes || []) {
      requeridos.set(c.itemId, (requeridos.get(c.itemId) || 0) + c.cantidad * it.cantidad);
    }
  }
  return requeridos;
}

export async function buscarBodegaCompras(tx) {
  const bodega = await tx.bodega.findFirst({
    where: { nombre: { equals: BODEGA_COMPRAS, mode: 'insensitive' } },
    orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
  });
  if (!bodega) throw new Error(`No existe la bodega "${BODEGA_COMPRAS}"`);
  return bodega;
}

export async function ajustarStockEnBodega(tx, itemId, bodegaId, diferencia) {
  if (!diferencia) return;
  const clave = { itemId_bodegaId: { itemId, bodegaId } };
  if (diferencia < 0) {
    const actualizado = await tx.inventarioItemBodega.updateMany({
      where: { itemId, bodegaId, stock: { gte: -diferencia } },
      data: { stock: { decrement: -diferencia } },
    });
    if (actualizado.count !== 1) {
      const item = await tx.inventarioItem.findUnique({ where: { id: itemId } });
      const existencia = await tx.inventarioItemBodega.findUnique({ where: clave });
      const error = new Error(`Inventario insuficiente de "${item?.nombre || 'insumo'}" en ${BODEGA_COMPRAS} (disponible ${existencia?.stock || 0}, requerido ${-diferencia})`);
      error.status = 409;
      throw error;
    }
  } else {
    await tx.inventarioItemBodega.upsert({
      where: clave,
      create: { itemId, bodegaId, stock: diferencia },
      update: { stock: { increment: diferencia } },
    });
  }
  await tx.inventarioItem.update({ where: { id: itemId }, data: { stock: { increment: diferencia } } });
}

// Valida que haya stock suficiente en Compras para los insumos requeridos.
export async function validarStockSuficiente(tx, requeridos) {
  if (requeridos.size === 0) return;
  const bodega = await buscarBodegaCompras(tx);
  const existencias = await tx.inventarioItemBodega.findMany({
    where: { itemId: { in: [...requeridos.keys()] }, bodegaId: bodega.id },
    include: { item: true },
  });
  const porItem = new Map(existencias.map((existencia) => [existencia.itemId, existencia]));
  for (const [itemId, necesario] of requeridos) {
    const existencia = porItem.get(itemId);
    if (!existencia || existencia.stock < necesario) {
      const error = new Error(`Inventario insuficiente de "${existencia?.item?.nombre || 'insumo'}" en ${BODEGA_COMPRAS} (disponible ${existencia?.stock || 0}, requerido ${necesario})`);
      error.status = 409;
      throw error;
    }
  }
}

// Descuenta insumos de Compras y deja registro en MovimientoInventario.
export async function descontarInsumos(tx, requeridos, { documentoReferencia } = {}) {
  const bodega = requeridos.size ? await buscarBodegaCompras(tx) : null;
  for (const [itemId, cantidad] of requeridos.entries()) {
    if (cantidad <= 0) continue;
    await ajustarStockEnBodega(tx, itemId, bodega.id, -cantidad);
    await tx.movimientoInventario.create({
      data: { itemId, bodegaId: bodega.id, tipoMovimiento: 'SALIDA', cantidad, documentoReferencia: documentoReferencia || null },
    });
  }
}

// Devuelve insumos a Compras (ej. al cancelar un pedido facturado o revertir una cortesía).
export async function revertirInsumos(tx, requeridos, { documentoReferencia } = {}) {
  const bodega = requeridos.size ? await buscarBodegaCompras(tx) : null;
  for (const [itemId, cantidad] of requeridos.entries()) {
    if (cantidad <= 0) continue;
    await ajustarStockEnBodega(tx, itemId, bodega.id, cantidad);
    await tx.movimientoInventario.create({
      data: { itemId, bodegaId: bodega.id, tipoMovimiento: 'ENTRADA', cantidad, documentoReferencia: documentoReferencia || null },
    });
  }
}
