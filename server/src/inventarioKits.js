// Logica compartida para descontar/revertir insumos de inventario segun la receta (kit) de cada producto.
// El descuento ocurre al tomar el pedido (mesa o domicilio), no al facturar, para que el
// stock refleje lo que ya se esta preparando en cocina.

// Agrupa cuantas unidades de cada insumo (InventarioItem) se requieren para una lista de items.
// items: [{ productoId, cantidad }], productos: [{ id, componentes: [{ itemId, cantidad }] }]
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

// Valida que haya stock suficiente para los insumos requeridos. Lanza un error con mensaje legible si no.
export async function validarStockSuficiente(tx, requeridos) {
  if (requeridos.size === 0) return;
  const insumos = await tx.inventarioItem.findMany({ where: { id: { in: [...requeridos.keys()] } } });
  for (const insumo of insumos) {
    const necesario = requeridos.get(insumo.id) || 0;
    if (insumo.stock < necesario) {
      throw new Error(`Inventario insuficiente de "${insumo.nombre}" (disponible ${insumo.stock}, requerido ${necesario})`);
    }
  }
}

// Descuenta del stock los insumos requeridos y deja registro en MovimientoInventario.
export async function descontarInsumos(tx, requeridos, { documentoReferencia } = {}) {
  for (const [itemId, cantidad] of requeridos.entries()) {
    if (cantidad <= 0) continue;
    await tx.inventarioItem.update({ where: { id: itemId }, data: { stock: { decrement: cantidad } } });
    await tx.movimientoInventario.create({
      data: { itemId, tipoMovimiento: 'SALIDA', cantidad, documentoReferencia: documentoReferencia || null },
    });
  }
}

// Devuelve al stock los insumos requeridos (ej. al cancelar un pedido o quitar un item).
export async function revertirInsumos(tx, requeridos, { documentoReferencia } = {}) {
  for (const [itemId, cantidad] of requeridos.entries()) {
    if (cantidad <= 0) continue;
    await tx.inventarioItem.update({ where: { id: itemId }, data: { stock: { increment: cantidad } } });
    await tx.movimientoInventario.create({
      data: { itemId, tipoMovimiento: 'ENTRADA', cantidad, documentoReferencia: documentoReferencia || null },
    });
  }
}
