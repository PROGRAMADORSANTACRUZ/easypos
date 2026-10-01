import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const toNum = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
const toDate = (v) => (v === undefined || v === null || v === '' ? undefined : new Date(v));
const aBool = (v) => v === true || v === 'true' || v === 1 || v === '1';
const conRelaciones = { vendedor: true, factura: true, facturaVenta: true };

// Valor = valor explicito o base*porcentaje/100 redondeado
const calcularValor = (valor, base, porcentaje) => {
  if (valor !== undefined && valor !== null && valor !== '') return Number(valor);
  if (base != null && porcentaje != null) return Math.round(Number(base) * Number(porcentaje)) / 100;
  return null;
};

router.get('/', wrap(async (req, res) => {
  const { vendedorId, pagada } = req.query;
  const where = {
    ...(vendedorId && { vendedorId: String(vendedorId) }),
    ...(pagada !== undefined && { pagada: aBool(pagada) }),
  };
  res.json(await prisma.comisionVendedor.findMany({
    where: Object.keys(where).length ? where : undefined,
    include: conRelaciones,
    orderBy: { fecha: 'desc' },
  }));
}));

router.get('/:id', wrap(async (req, res) => {
  const c = await prisma.comisionVendedor.findUnique({ where: { id: String(req.params.id) }, include: conRelaciones });
  if (!c) return res.status(404).json({ error: 'Comisión no encontrada' });
  res.json(c);
}));

router.post('/', wrap(async (req, res) => {
  const { vendedorId, facturaId, base, porcentaje, valor, pagada, fecha } = req.body;
  const esVenta = !!facturaId && !!(await prisma.facturaVenta.findUnique({ where: { id: String(facturaId) }, select: { id: true } }));
  const c = await prisma.comisionVendedor.create({
    data: {
      vendedorId: vendedorId ? String(vendedorId) : null,
      facturaId: !esVenta && facturaId ? String(facturaId) : null,
      facturaVentaId: esVenta ? String(facturaId) : null,
      base: toNum(base),
      porcentaje: toNum(porcentaje),
      valor: calcularValor(valor, toNum(base), toNum(porcentaje)),
      ...(pagada !== undefined && { pagada: aBool(pagada) }),
      ...(toDate(fecha) && { fecha: toDate(fecha) }),
    },
    include: conRelaciones,
  });
  await auditar({ req, accion: 'CREAR', entidad: 'comision_vendedor', entidadId: c.id, detalle: `Valor ${c.valor ?? ''}` });
  res.status(201).json(c);
}));

router.put('/:id', wrap(async (req, res) => {
  const { vendedorId, facturaId, base, porcentaje, valor, pagada, fecha } = req.body;
  const esVenta = facturaId !== undefined && facturaId !== null
    ? !!(await prisma.facturaVenta.findUnique({ where: { id: String(facturaId) }, select: { id: true } }))
    : false;
  try {
    const c = await prisma.comisionVendedor.update({
      where: { id: String(req.params.id) },
      data: {
        ...(vendedorId !== undefined && { vendedorId: vendedorId ? String(vendedorId) : null }),
        ...(facturaId !== undefined && {
          facturaId: !esVenta && facturaId ? String(facturaId) : null,
          facturaVentaId: esVenta && facturaId ? String(facturaId) : null,
        }),
        ...(base !== undefined && { base: toNum(base) }),
        ...(porcentaje !== undefined && { porcentaje: toNum(porcentaje) }),
        ...(valor !== undefined && { valor: calcularValor(valor, toNum(base), toNum(porcentaje)) }),
        ...(pagada !== undefined && { pagada: aBool(pagada) }),
        ...(fecha !== undefined && toDate(fecha) && { fecha: toDate(fecha) }),
      },
      include: conRelaciones,
    });
    await auditar({ req, accion: 'EDITAR', entidad: 'comision_vendedor', entidadId: c.id });
    res.json(c);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Comisión no encontrada' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  try {
    await prisma.comisionVendedor.delete({ where: { id: String(req.params.id) } });
    await auditar({ req, accion: 'ELIMINAR', entidad: 'comision_vendedor', entidadId: String(req.params.id) });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Comisión no encontrada' });
    throw e;
  }
}));

export default router;
