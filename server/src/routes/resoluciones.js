import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// BIGINT no es serializable por JSON: convertir a Number en las respuestas.
const serializar = (r) => (r && {
  ...r,
  rangoInicial: r.rangoInicial == null ? null : Number(r.rangoInicial),
  rangoFinal: r.rangoFinal == null ? null : Number(r.rangoFinal),
  siguienteNumero: r.siguienteNumero == null ? null : Number(r.siguienteNumero),
});

const toBig = (v) => (v === undefined || v === null || v === '' ? null : BigInt(Math.trunc(Number(v))));
const toDate = (v) => (v === undefined || v === null || v === '' ? null : new Date(v));

router.get('/', wrap(async (_req, res) => {
  const resoluciones = await prisma.resolucionFacturacion.findMany({ orderBy: { fechaInicio: 'desc' } });
  res.json(resoluciones.map(serializar));
}));

router.get('/:id', wrap(async (req, res) => {
  const r = await prisma.resolucionFacturacion.findUnique({ where: { id: String(req.params.id) } });
  if (!r) return res.status(404).json({ error: 'Resolución no encontrada' });
  res.json(serializar(r));
}));

router.post('/', wrap(async (req, res) => {
  const { prefijo, numeroResolucion, rangoInicial, rangoFinal, siguienteNumero, fechaInicio, fechaFin } = req.body;
  const r = await prisma.resolucionFacturacion.create({
    data: {
      prefijo: prefijo ? String(prefijo) : null,
      numeroResolucion: numeroResolucion ? String(numeroResolucion) : null,
      rangoInicial: toBig(rangoInicial),
      rangoFinal: toBig(rangoFinal),
      // Si no se envía, arranca en el rango inicial
      siguienteNumero: siguienteNumero !== undefined ? toBig(siguienteNumero) : toBig(rangoInicial),
      fechaInicio: toDate(fechaInicio),
      fechaFin: toDate(fechaFin),
    },
  });
  await auditar({ req, accion: 'CREAR', entidad: 'resolucion_facturacion', entidadId: r.id, detalle: `${r.prefijo || ''} ${r.numeroResolucion || ''}`.trim() });
  res.status(201).json(serializar(r));
}));

router.put('/:id', wrap(async (req, res) => {
  const { prefijo, numeroResolucion, rangoInicial, rangoFinal, siguienteNumero, fechaInicio, fechaFin } = req.body;
  try {
    const r = await prisma.resolucionFacturacion.update({
      where: { id: String(req.params.id) },
      data: {
        ...(prefijo !== undefined && { prefijo: prefijo ? String(prefijo) : null }),
        ...(numeroResolucion !== undefined && { numeroResolucion: numeroResolucion ? String(numeroResolucion) : null }),
        ...(rangoInicial !== undefined && { rangoInicial: toBig(rangoInicial) }),
        ...(rangoFinal !== undefined && { rangoFinal: toBig(rangoFinal) }),
        ...(siguienteNumero !== undefined && { siguienteNumero: toBig(siguienteNumero) }),
        ...(fechaInicio !== undefined && { fechaInicio: toDate(fechaInicio) }),
        ...(fechaFin !== undefined && { fechaFin: toDate(fechaFin) }),
      },
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'resolucion_facturacion', entidadId: r.id, detalle: `${r.prefijo || ''} ${r.numeroResolucion || ''}`.trim() });
    res.json(serializar(r));
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Resolución no encontrada' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  const id = String(req.params.id);
  try {
    await prisma.resolucionFacturacion.delete({ where: { id } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'resolucion_facturacion', entidadId: id });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Resolución no encontrada' });
    throw e;
  }
}));

export default router;
