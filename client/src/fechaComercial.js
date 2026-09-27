const formatoColombia = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function diaColombia(fecha) {
  const partes = formatoColombia.formatToParts(new Date(fecha));
  const valor = (tipo) => partes.find((p) => p.type === tipo)?.value;
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}