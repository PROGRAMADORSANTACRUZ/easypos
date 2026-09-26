import { Router } from 'express';
import { prisma } from '../prisma.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Bitacora de auditoria con filtros opcionales (?accion=&entidad=&usuarioId=&limit=)
router.get('/', wrap(async (req, res) => {
  const { accion, entidad, usuarioId } = req.query;
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const registros = await prisma.auditoria.findMany({
    where: {
      ...(accion && { accion: String(accion) }),
      ...(entidad && { entidad: String(entidad) }),
      ...(usuarioId && { usuarioId: String(usuarioId) }),
    },
    include: { usuario: { select: { nombre: true, usuario: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  res.json(
    registros.map((r) => ({
      id: r.id,
      accion: r.accion,
      entidad: r.entidad,
      entidadId: r.entidadId,
      detalle: r.detalle,
      ip: r.ip,
      usuario: r.usuario ? r.usuario.nombre : null,
      usuarioLogin: r.usuario ? r.usuario.usuario : null,
      createdAt: r.createdAt,
    }))
  );
}));

export default router;
