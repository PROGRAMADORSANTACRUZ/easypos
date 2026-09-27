const MS_DIA = 24 * 60 * 60 * 1000;
const formatoColombia = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function diaColombia(fecha) {
  const partes = formatoColombia.formatToParts(fecha);
  const valor = (tipo) => partes.find((p) => p.type === tipo)?.value;
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

export function inicioDiaColombia(dia) {
  return new Date(`${dia}T00:00:00-05:00`);
}

export function finDiaColombia(dia) {
  return new Date(inicioDiaColombia(dia).getTime() + MS_DIA);
}