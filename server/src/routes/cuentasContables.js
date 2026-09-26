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

router.get('/', wrap(async (req, res) => {
  res.json(await prisma.cuentaContable.findMany({ orderBy: { codigo: 'asc' } }));
}));

router.get('/:id', wrap(async (req, res) => {
  const c = await prisma.cuentaContable.findUnique({ where: { id: String(req.params.id) } });
  if (!c) return res.status(404).json({ error: 'Cuenta contable no encontrada' });
  res.json(c);
}));

router.post('/', wrap(async (req, res) => {
  const { codigo, nombre, tipo, activo } = req.body;
  const codigoLimpio = limpiar(codigo);
  const nombreLimpio = limpiar(nombre);
  if (!codigoLimpio) return res.status(400).json({ error: 'El código es obligatorio' });
  if (!nombreLimpio) return res.status(400).json({ error: 'El nombre es obligatorio' });
  try {
    const c = await prisma.cuentaContable.create({
      data: {
        codigo: codigoLimpio,
        nombre: nombreLimpio,
        tipo: limpiar(tipo),
        ...(activo !== undefined && { activo: aBool(activo) }),
      },
    });
    await auditar({ req, accion: 'CREAR', entidad: 'cuenta_contable', entidadId: c.id, detalle: `${c.codigo} · ${c.nombre}` });
    res.status(201).json(c);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Ya existe una cuenta con ese código' });
    throw e;
  }
}));

router.put('/:id', wrap(async (req, res) => {
  const { codigo, nombre, tipo, activo } = req.body;
  try {
    const c = await prisma.cuentaContable.update({
      where: { id: String(req.params.id) },
      data: {
        ...(codigo !== undefined && { codigo: limpiar(codigo) ?? '' }),
        ...(nombre !== undefined && { nombre: limpiar(nombre) ?? '' }),
        ...(tipo !== undefined && { tipo: limpiar(tipo) }),
        ...(activo !== undefined && { activo: aBool(activo) }),
      },
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'cuenta_contable', entidadId: c.id, detalle: `${c.codigo} · ${c.nombre}` });
    res.json(c);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Cuenta contable no encontrada' });
    if (e.code === 'P2002') return res.status(409).json({ error: 'Ya existe una cuenta con ese código' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  try {
    await prisma.cuentaContable.delete({ where: { id: String(req.params.id) } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'cuenta_contable', entidadId: String(req.params.id) });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Cuenta contable no encontrada' });
    if (e.code === 'P2003') return res.status(409).json({ error: 'No se puede eliminar: hay insumos amarrados a esta cuenta' });
    throw e;
  }
}));

export default router;
