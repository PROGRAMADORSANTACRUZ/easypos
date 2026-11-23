// Reglas de reservas en linea: turnos del dia, cruce de horarios y validacion de los datos del cliente.
// Todo en hora de Colombia (UTC-5, sin horario de verano).

export const CONFIG_RESERVAS = {
  horaInicio: '12:00',
  horaFin: '21:00',
  intervaloMin: 30,
  duracionMin: 60,
  diasAnticipacion: 60,
  zonas: ['RESTAURANTE'],
};

const OFFSET_COLOMBIA = '-05:00';
const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const REGEX_HORA = /^\d{2}:\d{2}$/;
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const aMinutos = (hora) => {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
};
const aHora = (minutos) => `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;

export const fechaHoraColombia = (fecha, hora) => new Date(`${fecha}T${hora}:00${OFFSET_COLOMBIA}`);

export function hoyColombia(ahora = new Date()) {
  return new Date(ahora.getTime() - 5 * 3600000).toISOString().slice(0, 10);
}

// Horas de inicio posibles para una fecha (la ultima es horaFin).
export function turnosDelDia(config = CONFIG_RESERVAS) {
  const turnos = [];
  for (let m = aMinutos(config.horaInicio); m <= aMinutos(config.horaFin); m += config.intervaloMin) turnos.push(aHora(m));
  return turnos;
}

export function fechaReservable(fecha, ahora = new Date(), config = CONFIG_RESERVAS) {
  if (!REGEX_FECHA.test(String(fecha || ''))) return false;
  const hoy = hoyColombia(ahora);
  const limite = hoyColombia(new Date(ahora.getTime() + config.diasAnticipacion * 86400000));
  return fecha >= hoy && fecha <= limite;
}

export function horaReservable(fecha, hora, ahora = new Date(), config = CONFIG_RESERVAS) {
  if (!REGEX_HORA.test(String(hora || '')) || !turnosDelDia(config).includes(hora)) return false;
  return fechaReservable(fecha, ahora, config) && fechaHoraColombia(fecha, hora) > ahora;
}

// Dos reservas chocan si sus intervalos [inicio, inicio + duracion) se cruzan.
export function seCruzan(inicioA, duracionA, inicioB, duracionB) {
  const a = new Date(inicioA).getTime();
  const b = new Date(inicioB).getTime();
  return a < b + duracionB * 60000 && b < a + duracionA * 60000;
}

// Una mesa esta libre si ninguna reserva activa de esa mesa se cruza con el turno pedido. Si el turno empieza
// antes de que termine la duracion contada desde ahora, la mesa ademas debe estar LIBRE en el salon.
export function mesaDisponible(mesa, reservas, inicio, ahora = new Date(), config = CONFIG_RESERVAS) {
  if (mesa.esFantasma) return false;
  const ocupadaAhora = mesa.estado && mesa.estado !== 'LIBRE';
  if (ocupadaAhora && new Date(inicio).getTime() < ahora.getTime() + config.duracionMin * 60000) return false;
  return !reservas.some((reserva) => reserva.mesaId === mesa.id && reserva.estado === 'CONFIRMADA'
    && seCruzan(reserva.fechaHora, reserva.duracionMin, inicio, config.duracionMin));
}

const texto = (valor, max) => String(valor ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

// Valida y normaliza lo que envia la pagina publica. Devuelve { datos } o { error }.
export function validarSolicitudReserva(body, ahora = new Date(), config = CONFIG_RESERVAS) {
  const personas = Number(body?.personas);
  const mesaId = Number(body?.mesaId);
  const nombre = texto(body?.nombre, 150);
  const celular = String(body?.celular ?? '').replace(/\D/g, '');
  const email = texto(body?.email, 150).toLowerCase();
  const zona = texto(body?.zona || config.zonas[0], 50).toUpperCase();
  if (!Number.isInteger(personas) || personas < 1 || personas > 100) return { error: 'Indica el número de personas' };
  if (!horaReservable(body?.fecha, body?.hora, ahora, config)) return { error: 'La fecha u hora elegida ya no está disponible' };
  if (!config.zonas.includes(zona)) return { error: 'Selecciona una zona válida' };
  if (!Number.isInteger(mesaId) || mesaId < 1) return { error: 'Selecciona una mesa' };
  if (nombre.length < 3) return { error: 'Escribe tu nombre completo' };
  if (celular.length < 7 || celular.length > 15) return { error: 'Escribe un número de celular válido' };
  if (!REGEX_EMAIL.test(email)) return { error: 'Escribe un correo electrónico válido' };
  if (body?.aceptaPoliticas !== true) return { error: 'Debes aceptar las políticas para confirmar la reserva' };
  return {
    datos: {
      personas, mesaId, nombre: nombre.toUpperCase(), celular, email, zona,
      fechaHora: fechaHoraColombia(body.fecha, body.hora),
      duracionMin: config.duracionMin,
      comentarios: texto(body?.comentarios, 500) || null,
      aceptaMarketing: body?.aceptaMarketing === true,
    },
  };
}
