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
  res.json(await prisma.metodoPago.findMany({ orderBy: { nombre: 'asc' } }));
}));

router.get('/:id', wrap(async (req, res) => {
  const m = await prisma.metodoPago.findUnique({ where: { id: String(req.params.id) } });
  if (!m) return res.status(404).json({ error: 'Método de pago no encontrado' });
  res.json(m);
}));

router.post('/', wrap(async (req, res) => {
  const { nombre, codigoDIAN, activo } = req.body;
  const nombreLimpio = limpiar(nombre);
  if (!nombreLimpio) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const m = await prisma.metodoPago.create({
    data: { nombre: nombreLimpio, codigoDIAN: limpiar(codigoDIAN), ...(activo !== undefined && { activo: aBool(activo) }) },
  });
  await auditar({ req, accion: 'CREAR', entidad: 'metodo_pago', entidadId: m.id, detalle: m.nombre });
  res.status(201).json(m);
}));

router.put('/:id', wrap(async (req, res) => {
  const { nombre, codigoDIAN, activo } = req.body;
  try {
    const m = await prisma.metodoPago.update({
      where: { id: String(req.params.id) },
      data: {
        ...(nombre !== undefined && { nombre: limpiar(nombre) ?? '' }),
        ...(codigoDIAN !== undefined && { codigoDIAN: limpiar(codigoDIAN) }),
        ...(activo !== undefined && { activo: aBool(activo) }),
      },
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'metodo_pago', entidadId: m.id, detalle: m.nombre });
    res.json(m);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Método de pago no encontrado' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  try {
    await prisma.metodoPago.delete({ where: { id: String(req.params.id) } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'metodo_pago', entidadId: String(req.params.id) });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Método de pago no encontrado' });
    throw e;
  }
}));

export default router;
