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

// Fecha y hora de Colombia para tickets (ej. 26/11/2026 2:36 p. m.). Se arma por partes para no depender
// del idioma instalado en el servidor, que sin datos de es-CO imprime formato y hora de EE. UU.
const formatoFechaHora = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function fechaHoraColombia(fecha = new Date()) {
  const partes = formatoFechaHora.formatToParts(fecha);
  const valor = (tipo) => partes.find((p) => p.type === tipo)?.value;
  const hora = Number(valor('hour')) % 24;
  return `${valor('day')}/${valor('month')}/${valor('year')} ${hora % 12 || 12}:${valor('minute')} ${hora < 12 ? 'a. m.' : 'p. m.'}`;
}