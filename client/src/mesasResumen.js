// Convierte numeros de mesa en rangos legibles: [1,2,3,5,7,8] -> "1–3, 5, 7–8".
export function rangosMesas(numeros) {
  const ordenados = [...new Set(numeros)].sort((a, b) => a - b);
  const rangos = [];
  for (const numero of ordenados) {
    const ultimo = rangos[rangos.length - 1];
    if (ultimo && numero === ultimo[1] + 1) ultimo[1] = numero;
    else rangos.push([numero, numero]);
  }
  return rangos.map(([inicio, fin]) => (inicio === fin ? String(inicio) : `${inicio}–${fin}`)).join(', ');
}

// Resumen para la lista de usuarios: "Todas", "Ninguna" o los rangos de mesas marcadas.
export function resumenMesas(asignadas, totalMesas) {
  const cantidad = asignadas.length;
  if (!cantidad) return { tipo: 'ninguna', texto: 'Ninguna', detalle: '' };
  const detalle = rangosMesas(asignadas.map((mesa) => mesa.numero));
  if (totalMesas > 0 && cantidad >= totalMesas) return { tipo: 'todas', texto: `Todas (${cantidad})`, detalle };
  return { tipo: 'algunas', texto: `${cantidad} mesa${cantidad === 1 ? '' : 's'}`, detalle };
}
