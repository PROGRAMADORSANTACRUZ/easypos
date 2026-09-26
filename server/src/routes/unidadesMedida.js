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
const toNum = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
const aBool = (v) => v === true || v === 'true' || v === 1 || v === '1';

// Listar unidades de medida (Kilogramo, Unidad, Mililitro...)
router.get('/', wrap(async (_req, res) => {
  res.json(await prisma.unidadMedida.findMany({ orderBy: { nombre: 'asc' } }));
}));

router.get('/:id', wrap(async (req, res) => {
  const u = await prisma.unidadMedida.findUnique({ where: { id: String(req.params.id) } });
  if (!u) return res.status(404).json({ error: 'Unidad de medida no encontrada' });
  res.json(u);
}));

router.post('/', wrap(async (req, res) => {
  const { nombre, abreviatura, factorConversion, activo } = req.body;
  const nombreLimpio = limpiar(nombre);
  if (!nombreLimpio) return res.status(400).json({ error: 'El nombre es obligatorio' });
  try {
    const u = await prisma.unidadMedida.create({
      data: {
        nombre: nombreLimpio,
        abreviatura: limpiar(abreviatura) || nombreLimpio.slice(0, 3).toUpperCase(),
        factorConversion: toNum(factorConversion) ?? 1,
        ...(activo !== undefined && { activo: aBool(activo) }),
      },
    });
    await auditar({ req, accion: 'CREAR', entidad: 'unidad_medida', entidadId: u.id, detalle: u.nombre });
    res.status(201).json(u);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Ya existe una unidad con ese nombre' });
    throw e;
  }
}));

router.put('/:id', wrap(async (req, res) => {
  const { nombre, abreviatura, factorConversion, activo } = req.body;
  try {
    const u = await prisma.unidadMedida.update({
      where: { id: String(req.params.id) },
      data: {
        ...(nombre !== undefined && { nombre: limpiar(nombre) ?? '' }),
        ...(abreviatura !== undefined && { abreviatura: limpiar(abreviatura) ?? '' }),
        ...(factorConversion !== undefined && { factorConversion: toNum(factorConversion) ?? 1 }),
        ...(activo !== undefined && { activo: aBool(activo) }),
      },
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'unidad_medida', entidadId: u.id, detalle: u.nombre });
    res.json(u);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Ya existe una unidad con ese nombre' });
    if (e.code === 'P2025') return res.status(404).json({ error: 'Unidad de medida no encontrada' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  const id = String(req.params.id);
  const enUso = await prisma.producto.count({ where: { unidadId: id } });
  if (enUso > 0) {
    return res.status(409).json({ error: `No se puede eliminar: ${enUso} producto(s) usan esta unidad` });
  }
  try {
    await prisma.unidadMedida.delete({ where: { id } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'unidad_medida', entidadId: id });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Unidad de medida no encontrada' });
    throw e;
  }
}));

export default router;
