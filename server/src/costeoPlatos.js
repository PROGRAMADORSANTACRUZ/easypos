const redondear = (valor) => Math.round((Number(valor) || 0) * 100) / 100;

// Costo de un plato = suma de (cantidad de la receta x costo unitario del insumo).
export function costoReceta(componentes = []) {
  return redondear(componentes.reduce((suma, c) => suma + (Number(c.cantidad) || 0) * (Number(c.item?.costo) || 0), 0));
}

// Indicadores del plato. El precio de venta incluye el impuesto, por eso el % de costo se mide sobre el precio neto.
export function indicadoresPlato({ precio, iva, costo }) {
  const neto = redondear((Number(precio) || 0) / (1 + (Number(iva) || 0) / 100));
  const margen = redondear(neto - costo);
  return { precioNeto: neto, margen, porcentajeCosto: neto > 0 ? redondear(costo / neto * 100) : null };
}

/**
 * Recalcula y guarda el costo de los platos con receta.
 * Sin filtros recalcula todos; con itemIds solo los que usan esos insumos; con productoIds solo esos platos.
 */
export async function recalcularCostosPlatos(tx, { itemIds, productoIds } = {}) {
  const where = { esKit: true };
  if (productoIds?.length) where.id = { in: productoIds };
  else if (itemIds?.length) where.componentes = { some: { itemId: { in: itemIds } } };
  const platos = await tx.producto.findMany({
    where,
    select: { id: true, costo: true, componentes: { select: { cantidad: true, item: { select: { costo: true } } } } },
  });
  let actualizados = 0;
  for (const plato of platos) {
    const costo = costoReceta(plato.componentes);
    if (Math.abs(costo - (plato.costo || 0)) < 0.005) continue;
    await tx.producto.update({ where: { id: plato.id }, data: { costo } });
    actualizados += 1;
  }
  return actualizados;
}

// Interpreta un costo escrito como "12.500", "12500,50" o 12500.
export function leerCosto(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) && valor >= 0 ? redondear(valor) : null;
  let texto = String(valor ?? '').replace(/[$\s]/g, '');
  if (!texto) return null;
  if (/,\d{1,2}$/.test(texto)) texto = texto.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(texto)) texto = texto.replace(/\./g, '');
  else texto = texto.replace(/,/g, '');
  const numero = Number(texto);
  return Number.isFinite(numero) && numero >= 0 ? redondear(numero) : null;
}
