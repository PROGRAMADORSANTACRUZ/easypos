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

// Construye el objeto de datos a partir del body (para create/update).
function datosDesdeBody(body, { parcial } = { parcial: false }) {
  const campos = {
    formaPago: () => limpiar(body.formaPago),
    manejaDocumento: () => aBool(body.manejaDocumento),
    cuenta: () => limpiar(body.cuenta),
    exportado: () => aBool(body.exportado),
    consignarEn: () => limpiar(body.consignarEn),
    tipoDatafono: () => limpiar(body.tipoDatafono),
    idBodega: () => aInt(body.idBodega) ?? 0,
    formaPagoDian: () => limpiar(body.formaPagoDian),
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
  res.json(await prisma.formaPago.findMany({ orderBy: [{ formaPago: 'asc' }] }));
}));

router.get('/:id', wrap(async (req, res) => {
  const t = await prisma.formaPago.findUnique({ where: { id: String(req.params.id) } });
  if (!t) return res.status(404).json({ error: 'Forma de pago no encontrada' });
  res.json(t);
}));

router.post('/', wrap(async (req, res) => {
  const data = datosDesdeBody(req.body);
  if (!data.formaPago) return res.status(400).json({ error: 'El nombre de la forma de pago es obligatorio' });
  const t = await prisma.formaPago.create({ data });
  await auditar({ req, accion: 'CREAR', entidad: 'formaPago', entidadId: t.id, detalle: t.formaPago });
  res.status(201).json(t);
}));

router.put('/:id', wrap(async (req, res) => {
  try {
    const t = await prisma.formaPago.update({
      where: { id: String(req.params.id) },
      data: datosDesdeBody(req.body, { parcial: true }),
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'formaPago', entidadId: t.id, detalle: t.formaPago });
    res.json(t);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Forma de pago no encontrada' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  try {
    await prisma.formaPago.delete({ where: { id: String(req.params.id) } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'formaPago', entidadId: String(req.params.id) });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Forma de pago no encontrada' });
    throw e;
  }
}));

export default router;
