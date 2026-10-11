export async function obtenerTasasImpuesto(db, productos, companiaCodigo, centroOperacionCodigo) {
  const impuestoIds = [...new Set(productos.map((producto) => producto.impuestoId).filter(Boolean))];
  if (impuestoIds.length === 0) return new Map();
  const configuraciones = await db.impuestoCuentaCentro.findMany({
    where: {
      impuestoId: { in: impuestoIds },
      companiaCodigo,
      centroOperacionCodigo,
      porcentaje: { not: null },
    },
    select: { impuestoId: true, porcentaje: true },
  });
  return new Map(configuraciones.map(({ impuestoId, porcentaje }) => [impuestoId, porcentaje]));
}

export function porcentajeProducto(producto, tasasImpuesto = new Map()) {
  return Number(tasasImpuesto.get(producto.impuestoId) ?? producto.iva ?? 0);
}
