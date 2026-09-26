import { Router } from 'express';
import os from 'os';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const limpiar = (v) => {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};
const aBool = (v) => v === true || v === 'true' || v === 1 || v === '1';
// Normaliza la MAC para comparaciones (mayúsculas, separada por ':').
const normMac = (v) => String(v || '').trim().toUpperCase().replace(/-/g, ':');

// MAC principal del equipo (primera interfaz activa no interna).
function macDeEsteEquipo() {
  const ifaces = os.networkInterfaces();
  for (const nombre of Object.keys(ifaces)) {
    for (const info of ifaces[nombre] || []) {
      if (!info.internal && info.mac && info.mac !== '00:00:00:00:00:00') {
        return normMac(info.mac);
      }
    }
  }
  return null;
}

// MAC del equipo donde corre el servidor.
router.get('/mac-actual', wrap(async (_req, res) => {
  res.json({ mac: macDeEsteEquipo() });
}));

// Asignación que corresponde a la MAC de este equipo (o null si no está registrada).
router.get('/actual', wrap(async (_req, res) => {
  const mac = macDeEsteEquipo();
  if (!mac) return res.json(null);
  const asignacion = await prisma.asignacionCaja.findUnique({ where: { mac } });
  res.json(asignacion || null);
}));

router.get('/', wrap(async (_req, res) => {
  res.json(await prisma.asignacionCaja.findMany({ orderBy: { numeroCaja: 'asc' } }));
}));

router.get('/:id', wrap(async (req, res) => {
  const a = await prisma.asignacionCaja.findUnique({ where: { id: String(req.params.id) } });
  if (!a) return res.status(404).json({ error: 'Asignación no encontrada' });
  res.json(a);
}));

router.post('/', wrap(async (req, res) => {
  const { mac, equipo, numeroCaja, activo } = req.body;
  const macLimpia = normMac(limpiar(mac));
  const cajaLimpia = limpiar(numeroCaja);
  if (!macLimpia) return res.status(400).json({ error: 'La MAC es obligatoria' });
  if (!cajaLimpia) return res.status(400).json({ error: 'El número de caja es obligatorio' });
  try {
    const a = await prisma.asignacionCaja.create({
      data: {
        mac: macLimpia,
        equipo: limpiar(equipo),
        numeroCaja: cajaLimpia,
        ...(activo !== undefined && { activo: aBool(activo) }),
      },
    });
    await auditar({ req, accion: 'CREAR', entidad: 'asignacionCaja', entidadId: a.id, detalle: `${a.mac} → Caja ${a.numeroCaja}` });
    res.status(201).json(a);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Esa MAC ya está registrada' });
    throw e;
  }
}));

router.put('/:id', wrap(async (req, res) => {
  const { mac, equipo, numeroCaja, activo } = req.body;
  try {
    const a = await prisma.asignacionCaja.update({
      where: { id: String(req.params.id) },
      data: {
        ...(mac !== undefined && { mac: normMac(limpiar(mac)) ?? '' }),
        ...(equipo !== undefined && { equipo: limpiar(equipo) }),
        ...(numeroCaja !== undefined && { numeroCaja: limpiar(numeroCaja) ?? '' }),
        ...(activo !== undefined && { activo: aBool(activo) }),
      },
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'asignacionCaja', entidadId: a.id, detalle: `${a.mac} → Caja ${a.numeroCaja}` });
    res.json(a);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Asignación no encontrada' });
    if (e.code === 'P2002') return res.status(409).json({ error: 'Esa MAC ya está registrada' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  try {
    await prisma.asignacionCaja.delete({ where: { id: String(req.params.id) } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'asignacionCaja', entidadId: String(req.params.id) });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Asignación no encontrada' });
    throw e;
  }
}));

export default router;
