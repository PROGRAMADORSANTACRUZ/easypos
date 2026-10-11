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

async function validarAlcance(companiaCodigo, centroOperacionCodigo) {
  if (!companiaCodigo && !centroOperacionCodigo) return null;
  if (!companiaCodigo || !centroOperacionCodigo) return 'Selecciona una compañía y su centro de operaciones';
  if (!['004', '006'].includes(companiaCodigo)) return 'Solo se permiten las compañías 004 y 006';
  const centro = await prisma.centroOperacion.findFirst({
    where: { codigo: centroOperacionCodigo, companiaCodigo, estado: 'Activo' },
    select: { codigo: true },
  });
  return centro ? null : 'El centro debe estar activo y pertenecer a la compañía seleccionada';
}

router.get('/', wrap(async (req, res) => {
  res.json(await prisma.impuesto.findMany({
    include: {
      compania: { select: { codigo: true, razonSocial: true } },
      centroOperacion: { select: { codigo: true, descripcion: true } },
    },
    orderBy: { nombre: 'asc' },
  }));
}));

router.get('/companias', wrap(async (_req, res) => {
  const companias = await prisma.compania.findMany({
    where: { codigo: { in: ['004', '006'] } },
    orderBy: { codigo: 'asc' },
    select: { codigo: true, razonSocial: true },
  });
  res.json(companias.map((compania) => ({ ...compania, id: compania.codigo })));
}));

router.get('/centros-operaciones', wrap(async (_req, res) => {
  const centros = await prisma.centroOperacion.findMany({
    where: { companiaCodigo: { in: ['004', '006'] }, estado: 'Activo' },
    orderBy: [{ companiaCodigo: 'asc' }, { codigo: 'asc' }],
    select: { codigo: true, descripcion: true, companiaCodigo: true },
  });
  res.json(centros.map((centro) => ({ ...centro, id: centro.codigo })));
}));

router.get('/:id', wrap(async (req, res) => {
  const i = await prisma.impuesto.findUnique({
    where: { id: String(req.params.id) },
    include: {
      compania: { select: { codigo: true, razonSocial: true } },
      centroOperacion: { select: { codigo: true, descripcion: true } },
    },
  });
  if (!i) return res.status(404).json({ error: 'Impuesto no encontrado' });
  res.json(i);
}));

router.post('/', wrap(async (req, res) => {
  const {
    nombre, tipo, porcentaje, codigoDIAN, activo,
    companiaCodigo, centroOperacionCodigo,
    ctaCreditoVentas, cuentasBase, cuentasBaseDevoluciones,
    ctaDebitoVentas, ctaDebitoCompras, ctaCreditoCompras,
    exportado, valorImpuesto,
  } = req.body;
  const nombreLimpio = limpiar(nombre);
  if (!nombreLimpio) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const compania = limpiar(companiaCodigo);
  const centro = limpiar(centroOperacionCodigo);
  const errorAlcance = await validarAlcance(compania, centro);
  if (errorAlcance) return res.status(400).json({ error: errorAlcance });
  const i = await prisma.impuesto.create({
    data: {
      nombre: nombreLimpio,
      tipo: limpiar(tipo),
      porcentaje: toNum(porcentaje) ?? 0,
      codigoDIAN: limpiar(codigoDIAN),
      ctaCreditoVentas: limpiar(ctaCreditoVentas),
      cuentasBase: limpiar(cuentasBase),
      cuentasBaseDevoluciones: limpiar(cuentasBaseDevoluciones),
      ctaDebitoVentas: limpiar(ctaDebitoVentas),
      ctaDebitoCompras: limpiar(ctaDebitoCompras),
      ctaCreditoCompras: limpiar(ctaCreditoCompras),
      exportado: aBool(exportado),
      valorImpuesto: toNum(valorImpuesto) ?? 0,
      companiaCodigo: compania,
      centroOperacionCodigo: centro,
      ...(activo !== undefined && { activo: aBool(activo) }),
    },
    include: {
      compania: { select: { codigo: true, razonSocial: true } },
      centroOperacion: { select: { codigo: true, descripcion: true } },
    },
  });
  await auditar({ req, accion: 'CREAR', entidad: 'impuesto', entidadId: i.id, detalle: `${i.nombre} ${i.porcentaje}%` });
  res.status(201).json(i);
}));

router.put('/:id', wrap(async (req, res) => {
  const {
    nombre, tipo, porcentaje, codigoDIAN, activo,
    companiaCodigo, centroOperacionCodigo,
    ctaCreditoVentas, cuentasBase, cuentasBaseDevoluciones,
    ctaDebitoVentas, ctaDebitoCompras, ctaCreditoCompras,
    exportado, valorImpuesto,
  } = req.body;
  try {
    const actual = await prisma.impuesto.findUnique({ where: { id: String(req.params.id) } });
    if (!actual) return res.status(404).json({ error: 'Impuesto no encontrado' });
    const compania = companiaCodigo === undefined ? actual.companiaCodigo : limpiar(companiaCodigo);
    const centro = centroOperacionCodigo === undefined ? actual.centroOperacionCodigo : limpiar(centroOperacionCodigo);
    const errorAlcance = await validarAlcance(compania, centro);
    if (errorAlcance) return res.status(400).json({ error: errorAlcance });
    const i = await prisma.impuesto.update({
      where: { id: String(req.params.id) },
      data: {
        ...(nombre !== undefined && { nombre: limpiar(nombre) ?? '' }),
        ...(tipo !== undefined && { tipo: limpiar(tipo) }),
        ...(porcentaje !== undefined && { porcentaje: toNum(porcentaje) ?? 0 }),
        ...(codigoDIAN !== undefined && { codigoDIAN: limpiar(codigoDIAN) }),
        ...(ctaCreditoVentas !== undefined && { ctaCreditoVentas: limpiar(ctaCreditoVentas) }),
        ...(cuentasBase !== undefined && { cuentasBase: limpiar(cuentasBase) }),
        ...(cuentasBaseDevoluciones !== undefined && { cuentasBaseDevoluciones: limpiar(cuentasBaseDevoluciones) }),
        ...(ctaDebitoVentas !== undefined && { ctaDebitoVentas: limpiar(ctaDebitoVentas) }),
        ...(ctaDebitoCompras !== undefined && { ctaDebitoCompras: limpiar(ctaDebitoCompras) }),
        ...(ctaCreditoCompras !== undefined && { ctaCreditoCompras: limpiar(ctaCreditoCompras) }),
        ...(exportado !== undefined && { exportado: aBool(exportado) }),
        ...(valorImpuesto !== undefined && { valorImpuesto: toNum(valorImpuesto) ?? 0 }),
        ...(companiaCodigo !== undefined && { companiaCodigo: compania }),
        ...(centroOperacionCodigo !== undefined && { centroOperacionCodigo: centro }),
        ...(activo !== undefined && { activo: aBool(activo) }),
      },
      include: {
        compania: { select: { codigo: true, razonSocial: true } },
        centroOperacion: { select: { codigo: true, descripcion: true } },
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
