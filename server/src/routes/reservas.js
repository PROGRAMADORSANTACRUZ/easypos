// Reservas en linea. Rutas publicas (sin sesion) para la pagina /reservar/<restaurante> y rutas internas
// para que el personal vea y gestione las reservas. El restaurante se resuelve por el header x-tenant-id.
import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';
import {
  CONFIG_RESERVAS, fechaHoraColombia, fechaReservable, horaReservable, mesaDisponible, turnosDelDia, validarSolicitudReserva,
} from '../reservasNucleo.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const ESTADOS = ['CONFIRMADA', 'CANCELADA', 'CUMPLIDA', 'NO_ASISTIO'];

const rangoDia = (fecha) => {
  const inicio = fechaHoraColombia(fecha, '00:00');
  return { inicio, fin: new Date(inicio.getTime() + 86400000) };
};

// Reservas confirmadas que pueden cruzarse con cualquier turno del dia (incluye las que empiezan la noche anterior).
async function reservasDelDia(fecha, cliente = prisma) {
  const { inicio, fin } = rangoDia(fecha);
  return cliente.reservaMesa.findMany({
    where: { estado: 'CONFIRMADA', fechaHora: { gte: new Date(inicio.getTime() - 86400000), lt: fin } },
    select: { mesaId: true, fechaHora: true, duracionMin: true, estado: true },
  });
}

const mesasReservables = (cliente = prisma) => cliente.mesa.findMany({
  where: { esFantasma: false },
  select: { id: true, numero: true, capacidad: true, estado: true, esFantasma: true },
  orderBy: { numero: 'asc' },
});

// Limite basico contra abuso del formulario publico: 10 reservas cada 10 minutos por IP (detras de nginx se usa la IP real).
const intentosPorIp = new Map();
function limitarIntentos(req, res, next) {
  const ip = String(req.header('x-forwarded-for') || '').split(',')[0].trim() || req.header('x-real-ip') || req.ip || 'desconocida';
  const ahora = Date.now();
  const recientes = (intentosPorIp.get(ip) || []).filter((t) => ahora - t < 600000);
  if (recientes.length >= 10) return res.status(429).json({ error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' });
  recientes.push(ahora);
  intentosPorIp.set(ip, recientes);
  next();
}

export const reservasPublicasRouter = Router();

reservasPublicasRouter.get('/info', wrap(async (req, res) => {
  res.json({
    restaurante: req.tenant?.nombre || 'Restaurante',
    turnos: turnosDelDia(),
    duracionMin: CONFIG_RESERVAS.duracionMin,
    diasAnticipacion: CONFIG_RESERVAS.diasAnticipacion,
    zonas: CONFIG_RESERVAS.zonas,
  });
}));

reservasPublicasRouter.get('/disponibilidad', wrap(async (req, res) => {
  const fecha = String(req.query.fecha || '');
  if (!fechaReservable(fecha)) return res.status(400).json({ error: 'Fecha no disponible para reservas' });
  const ahora = new Date();
  const [mesas, reservas] = await Promise.all([mesasReservables(), reservasDelDia(fecha)]);
  res.json(turnosDelDia().map((hora) => {
    const inicio = fechaHoraColombia(fecha, hora);
    const disponible = horaReservable(fecha, hora, ahora)
      && mesas.some((mesa) => mesaDisponible(mesa, reservas, inicio, ahora));
    return { hora, disponible };
  }));
}));

reservasPublicasRouter.get('/mesas', wrap(async (req, res) => {
  const fecha = String(req.query.fecha || '');
  const hora = String(req.query.hora || '');
  if (!horaReservable(fecha, hora)) return res.status(400).json({ error: 'La fecha u hora elegida ya no está disponible' });
  const ahora = new Date();
  const inicio = fechaHoraColombia(fecha, hora);
  const [mesas, reservas] = await Promise.all([mesasReservables(), reservasDelDia(fecha)]);
  res.json(mesas.map((mesa) => ({
    id: mesa.id, numero: mesa.numero, capacidad: mesa.capacidad,
    disponible: mesaDisponible(mesa, reservas, inicio, ahora),
  })));
}));

reservasPublicasRouter.post('/', limitarIntentos, wrap(async (req, res) => {
  const { datos, error } = validarSolicitudReserva(req.body);
  if (error) return res.status(400).json({ error });
  const fecha = String(req.body.fecha);
  const reserva = await prisma.$transaction(async (tx) => {
    // Bloquea la fila de la mesa: si dos clientes confirman a la vez, la primera reserva gana el turno.
    await tx.$queryRaw`SELECT "id" FROM "Mesa" WHERE "id" = ${datos.mesaId} FOR UPDATE`;
    const mesa = await tx.mesa.findUnique({ where: { id: datos.mesaId }, select: { id: true, numero: true, capacidad: true, estado: true, esFantasma: true } });
    if (!mesa) throw Object.assign(new Error('La mesa elegida no existe'), { status: 400 });
    const reservas = await reservasDelDia(fecha, tx);
    if (!mesaDisponible(mesa, reservas, datos.fechaHora, new Date())) {
      throw Object.assign(new Error(`La mesa ${mesa.numero} acaba de ser reservada por otra persona. Elige otra mesa u hora.`), { status: 409 });
    }
    const creada = await tx.reservaMesa.create({ data: datos });
    return { ...creada, mesa: { numero: mesa.numero } };
  });
  res.status(201).json({
    id: reserva.id, nombre: reserva.nombre, personas: reserva.personas, fechaHora: reserva.fechaHora,
    zona: reserva.zona, mesa: reserva.mesa.numero, duracionMin: reserva.duracionMin,
  });
}));

export const reservasRouter = Router();

reservasRouter.get('/', wrap(async (req, res) => {
  const fecha = String(req.query.fecha || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return res.status(400).json({ error: 'Indica la fecha (AAAA-MM-DD)' });
  const { inicio, fin } = rangoDia(fecha);
  res.json(await prisma.reservaMesa.findMany({
    where: { fechaHora: { gte: inicio, lt: fin } },
    include: { mesa: { select: { numero: true, capacidad: true } } },
    orderBy: [{ fechaHora: 'asc' }, { createdAt: 'asc' }],
  }));
}));

reservasRouter.put('/:id/estado', wrap(async (req, res) => {
  const estado = String(req.body?.estado || '');
  if (!ESTADOS.includes(estado)) return res.status(400).json({ error: 'Estado de reserva no válido' });
  try {
    const reserva = await prisma.reservaMesa.update({ where: { id: String(req.params.id) }, data: { estado } });
    await auditar({ req, accion: 'EDITAR', entidad: 'reserva_mesa', entidadId: reserva.id, detalle: `${reserva.nombre} → ${estado}` });
    res.json(reserva);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Reserva no encontrada' });
    throw e;
  }
}));
