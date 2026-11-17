const SIN_CATEGORIA = 'Sin categoría';

// Nombres de categoría del menú en el orden de su código (01, 02…).
// Las que no tienen código y "Sin categoría" van al final.
export function categoriasOrdenadas(productos) {
  const codigos = new Map();
  for (const producto of productos) {
    const nombre = producto.categoria?.nombre || SIN_CATEGORIA;
    if (!codigos.has(nombre)) codigos.set(nombre, producto.categoria?.codigo ?? null);
  }
  const comparar = (a, b) => a.localeCompare(b, 'es', { numeric: true });
  return [...codigos.entries()]
    .sort(([nombreA, codigoA], [nombreB, codigoB]) => {
      if ((nombreA === SIN_CATEGORIA) !== (nombreB === SIN_CATEGORIA)) return nombreA === SIN_CATEGORIA ? 1 : -1;
      if ((codigoA == null) !== (codigoB == null)) return codigoA == null ? 1 : -1;
      if (codigoA != null) return comparar(String(codigoA), String(codigoB)) || comparar(nombreA, nombreB);
      return comparar(nombreA, nombreB);
    })
    .map(([nombre]) => nombre);
}
