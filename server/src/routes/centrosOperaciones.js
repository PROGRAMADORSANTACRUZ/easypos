import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const serializar = ({ codigo, ...centro }) => ({ id: codigo, codigo, ...centro });

router.get('/', wrap(async (_req, res) => {
  const centros = await prisma.centroOperacion.findMany({ orderBy: { codigo: 'asc' } });
  res.json(centros.map(serializar));
}));

router.put('/:codigo', wrap(async (req, res) => {
  const codigo = String(req.params.codigo ?? '').trim();
  const descripcion = String(req.body.descripcion ?? '').trim();
  const estado = String(req.body.estado ?? '').trim();
  if (!codigo) return res.status(400).json({ error: 'El código es obligatorio' });
  if (!descripcion) return res.status(400).json({ error: 'La descripción es obligatoria' });
  if (!['Activo', 'Inactivo'].includes(estado)) {
    return res.status(400).json({ error: 'El estado debe ser Activo o Inactivo' });
  }
  try {
    const centro = await prisma.centroOperacion.update({
      where: { codigo },
      data: { descripcion, estado },
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'centro_operacion', entidadId: codigo, detalle: descripcion });
    res.json(serializar(centro));
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Centro de operaciones no encontrado' });
    throw error;
  }
}));

export default router;