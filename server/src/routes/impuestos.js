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

router.get('/', wrap(async (req, res) => {
  res.json(await prisma.impuesto.findMany({ orderBy: { nombre: 'asc' } }));
}));

router.get('/:id', wrap(async (req, res) => {
  const i = await prisma.impuesto.findUnique({ where: { id: String(req.params.id) } });
  if (!i) return res.status(404).json({ error: 'Impuesto no encontrado' });
  res.json(i);
}));

router.post('/', wrap(async (req, res) => {
  const {
    nombre, tipo, porcentaje, codigoDIAN, activo,
    ctaCreditoVentas, cuentasBase, cuentasBaseDevoluciones,
    ctaDebitoVentas, ctaDebitoCompras, ctaCreditoCompras,
    exportado, valorImpuesto,
  } = req.body;
  const nombreLimpio = limpiar(nombre);
  if (!nombreLimpio) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const i = await prisma.impuesto.create({
    data: {
      nombre: nombreLimpio,
      tipo: limpiar(tipo),
      porcentaje: toNum(porcentaje) ?? 0,
      codigoDIAN: limpiar(codigoDIAN),
      ctaCreditoVentas: limpiar(ctaCreditoVentas),
      cuentasBase: aBool(cuentasBase),
      cuentasBaseDevoluciones: aBool(cuentasBaseDevoluciones),
      ctaDebitoVentas: limpiar(ctaDebitoVentas),
      ctaDebitoCompras: limpiar(ctaDebitoCompras),
      ctaCreditoCompras: limpiar(ctaCreditoCompras),
      exportado: aBool(exportado),
      valorImpuesto: toNum(valorImpuesto) ?? 0,
      ...(activo !== undefined && { activo: aBool(activo) }),
    },
  });
  await auditar({ req, accion: 'CREAR', entidad: 'impuesto', entidadId: i.id, detalle: `${i.nombre} ${i.porcentaje}%` });
  res.status(201).json(i);
}));

router.put('/:id', wrap(async (req, res) => {
  const {
    nombre, tipo, porcentaje, codigoDIAN, activo,
    ctaCreditoVentas, cuentasBase, cuentasBaseDevoluciones,
    ctaDebitoVentas, ctaDebitoCompras, ctaCreditoCompras,
    exportado, valorImpuesto,
  } = req.body;
  try {
    const i = await prisma.impuesto.update({
      where: { id: String(req.params.id) },
      data: {
        ...(nombre !== undefined && { nombre: limpiar(nombre) ?? '' }),
        ...(tipo !== undefined && { tipo: limpiar(tipo) }),
        ...(porcentaje !== undefined && { porcentaje: toNum(porcentaje) ?? 0 }),
        ...(codigoDIAN !== undefined && { codigoDIAN: limpiar(codigoDIAN) }),
        ...(ctaCreditoVentas !== undefined && { ctaCreditoVentas: limpiar(ctaCreditoVentas) }),
        ...(cuentasBase !== undefined && { cuentasBase: aBool(cuentasBase) }),
        ...(cuentasBaseDevoluciones !== undefined && { cuentasBaseDevoluciones: aBool(cuentasBaseDevoluciones) }),
        ...(ctaDebitoVentas !== undefined && { ctaDebitoVentas: limpiar(ctaDebitoVentas) }),
        ...(ctaDebitoCompras !== undefined && { ctaDebitoCompras: limpiar(ctaDebitoCompras) }),
        ...(ctaCreditoCompras !== undefined && { ctaCreditoCompras: limpiar(ctaCreditoCompras) }),
        ...(exportado !== undefined && { exportado: aBool(exportado) }),
        ...(valorImpuesto !== undefined && { valorImpuesto: toNum(valorImpuesto) ?? 0 }),
        ...(activo !== undefined && { activo: aBool(activo) }),
      },
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'impuesto', entidadId: i.id, detalle: i.nombre });
    res.json(i);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Impuesto no encontrado' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  try {
    await prisma.impuesto.delete({ where: { id: String(req.params.id) } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'impuesto', entidadId: String(req.params.id) });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Impuesto no encontrado' });
    throw e;
  }
}));

export default router;
