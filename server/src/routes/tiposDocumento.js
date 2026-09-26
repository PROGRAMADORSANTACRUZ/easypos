import { Router } from 'express';
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
const aInt = (v) => (v === '' || v === null || v === undefined ? null : Number.parseInt(v, 10));
const aFecha = (v) => {
  const s = limpiar(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

// Construye el objeto de datos a partir del body (para create/update).
function datosDesdeBody(body, { parcial } = { parcial: false }) {
  const campos = {
    clase: () => limpiar(body.clase),
    esElectronico: () => (body.esElectronico === undefined ? true : aBool(body.esElectronico)),
    codigo: () => limpiar(body.codigo),
    automatico: () => aBool(body.automatico),
    consInicial: () => aInt(body.consInicial),
    consFinal: () => aInt(body.consFinal),
    consProximo: () => aInt(body.consProximo),
    nroResolucion: () => limpiar(body.nroResolucion),
    fechaResolucion: () => aFecha(body.fechaResolucion),
    nroMaxItems: () => aInt(body.nroMaxItems),
    prefijo: () => limpiar(body.prefijo),
    consFormato: () => limpiar(body.consFormato),
    fechaResolucionVcto: () => aFecha(body.fechaResolucionVcto),
    diasAvisoVcto: () => aInt(body.diasAvisoVcto),
    tipoIdentificacion: () => limpiar(body.tipoIdentificacion),
    activo: () => aBool(body.activo),
  };
  const data = {};
  for (const [k, fn] of Object.entries(campos)) {
    if (parcial && body[k] === undefined) continue;
    data[k] = fn();
  }
  return data;
}

router.get('/', wrap(async (_req, res) => {
  res.json(await prisma.tipoDocumento.findMany({ orderBy: [{ clase: 'asc' }, { codigo: 'asc' }] }));
}));

router.get('/:id', wrap(async (req, res) => {
  const t = await prisma.tipoDocumento.findUnique({ where: { id: String(req.params.id) } });
  if (!t) return res.status(404).json({ error: 'Tipo de documento no encontrado' });
  res.json(t);
}));

router.post('/', wrap(async (req, res) => {
  const data = datosDesdeBody(req.body);
  if (!data.clase) return res.status(400).json({ error: 'La clase es obligatoria' });
  if (!data.codigo) return res.status(400).json({ error: 'El código (C.O) es obligatorio' });
  const t = await prisma.tipoDocumento.create({ data });
  await auditar({ req, accion: 'CREAR', entidad: 'tipoDocumento', entidadId: t.id, detalle: `${t.codigo} ${t.prefijo || ''}`.trim() });
  res.status(201).json(t);
}));

router.put('/:id', wrap(async (req, res) => {
  try {
    const t = await prisma.tipoDocumento.update({
      where: { id: String(req.params.id) },
      data: datosDesdeBody(req.body, { parcial: true }),
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'tipoDocumento', entidadId: t.id, detalle: `${t.codigo} ${t.prefijo || ''}`.trim() });
    res.json(t);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Tipo de documento no encontrado' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  try {
    await prisma.tipoDocumento.delete({ where: { id: String(req.params.id) } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'tipoDocumento', entidadId: String(req.params.id) });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Tipo de documento no encontrado' });
    throw e;
  }
}));

export default router;
