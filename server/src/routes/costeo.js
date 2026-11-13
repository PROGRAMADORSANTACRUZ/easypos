import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';
import { costoReceta, indicadoresPlato, leerCosto, recalcularCostosPlatos } from '../costeoPlatos.js';
import { diaColombia, inicioDiaColombia, finDiaColombia } from '../fechaColombia.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const OBJETIVO_COSTO = Number(process.env.OBJETIVO_COSTO_PLATO) || 33;

async function datosCosteo() {
  const [platos, insumos] = await Promise.all([
    prisma.producto.findMany({
      where: { esKit: true },
      orderBy: { nombre: 'asc' },
      select: {
        id: true, codigo: true, nombre: true, precio: true, iva: true, costo: true, activo: true,
        categoria: { select: { nombre: true } },
        componentes: { select: { cantidad: true, item: { select: { id: true, codigo: true, nombre: true, unidad: true, costo: true } } } },
      },
    }),
    prisma.inventarioItem.findMany({
      orderBy: { nombre: 'asc' },
      select: { id: true, codigo: true, nombre: true, unidad: true, costo: true, _count: { select: { componentes: true } } },
    }),
  ]);
  return {
    objetivo: OBJETIVO_COSTO,
    platos: platos.map((plato) => {
      const costo = costoReceta(plato.componentes);
      return {
        id: plato.id, codigo: plato.codigo, nombre: plato.nombre, categoria: plato.categoria?.nombre || 'Sin categoría',
        activo: plato.activo, precio: plato.precio, iva: plato.iva, costo, costoGuardado: plato.costo,
        ...indicadoresPlato({ precio: plato.precio, iva: plato.iva, costo }),
        insumosSinCosto: plato.componentes.filter((c) => !(c.item.costo > 0)).length,
        receta: plato.componentes.map((c) => ({
          itemId: c.item.id, codigo: c.item.codigo, nombre: c.item.nombre, unidad: c.item.unidad,
          cantidad: c.cantidad, costoUnitario: c.item.costo, subtotal: Math.round(c.cantidad * c.item.costo * 100) / 100,
        })),
      };
    }),
    insumos: insumos.map(({ _count, ...insumo }) => ({ ...insumo, platos: _count.componentes })),
  };
}

router.get('/', wrap(async (_req, res) => {
  res.json(await datosCosteo());
}));

// Costo de lo vendido en un periodo: unidades vendidas de cada plato x costo actual de su receta.
router.get('/ventas', wrap(async (req, res) => {
  const { desde, hasta } = req.query;
  const valida = (valor) => typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) && diaColombia(inicioDiaColombia(valor)) === valor;
  if (!valida(desde) || !valida(hasta) || desde > hasta) return res.status(400).json({ error: 'Selecciona un rango de fechas válido.' });
  const where = { fecha: { gte: inicioDiaColombia(desde), lt: finDiaColombia(hasta) }, productoId: { not: null } };
  const select = { productoId: true, cantidad: true, total: true, iva: true };
  const [electronicas, pos, { platos }] = await Promise.all([
    prisma.facturaDetalle.findMany({ where, select }),
    prisma.facturaVentaDetalle.findMany({ where, select }),
    datosCosteo(),
  ]);
  const porPlato = new Map(platos.map((plato) => [plato.id, plato]));
  const acumulado = new Map();
  for (const linea of [...electronicas, ...pos]) {
    const plato = porPlato.get(linea.productoId);
    if (!plato) continue;
    const fila = acumulado.get(plato.id) || { id: plato.id, nombre: plato.nombre, categoria: plato.categoria, costoUnitario: plato.costo, unidades: 0, ventaNeta: 0 };
    fila.unidades += Number(linea.cantidad) || 0;
    fila.ventaNeta += (Number(linea.total) || 0) - (Number(linea.iva) || 0);
    acumulado.set(plato.id, fila);
  }
  const r2 = (valor) => Math.round(valor * 100) / 100;
  const filas = [...acumulado.values()].map((fila) => {
    const costoTotal = r2(fila.costoUnitario * fila.unidades);
    const ventaNeta = r2(fila.ventaNeta);
    return {
      ...fila, unidades: r2(fila.unidades), ventaNeta, costoTotal, utilidad: r2(ventaNeta - costoTotal),
      porcentajeCosto: ventaNeta > 0 ? r2(costoTotal / ventaNeta * 100) : null,
    };
  }).sort((a, b) => b.costoTotal - a.costoTotal || b.ventaNeta - a.ventaNeta);
  const ventaNeta = r2(filas.reduce((s, f) => s + f.ventaNeta, 0));
  const costoTotal = r2(filas.reduce((s, f) => s + f.costoTotal, 0));
  res.json({
    desde, hasta, filas,
    totales: { unidades: r2(filas.reduce((s, f) => s + f.unidades, 0)), ventaNeta, costoTotal, utilidad: r2(ventaNeta - costoTotal), porcentajeCosto: ventaNeta > 0 ? r2(costoTotal / ventaNeta * 100) : null },
  });
}));

// Cambia el costo de un insumo y recalcula al instante los platos que lo usan.
router.put('/insumos/:id', wrap(async (req, res) => {
  const id = Number(req.params.id);
  const costo = leerCosto(req.body?.costo);
  if (!Number.isInteger(id) || costo === null) return res.status(400).json({ error: 'Escribe un costo válido (número mayor o igual a 0).' });
  const resultado = await prisma.$transaction(async (tx) => {
    const insumo = await tx.inventarioItem.findUnique({ where: { id }, select: { id: true, nombre: true, costo: true } });
    if (!insumo) throw Object.assign(new Error('Insumo no encontrado'), { status: 404 });
    await tx.inventarioItem.update({ where: { id }, data: { costo } });
    return { insumo, platos: await recalcularCostosPlatos(tx, { itemIds: [id] }) };
  });
  await auditar({ req, accion: 'EDITAR', entidad: 'costeo_insumo', entidadId: String(id), detalle: `${resultado.insumo.nombre}: ${resultado.insumo.costo} -> ${costo}` });
  res.json({ platosActualizados: resultado.platos, ...(await datosCosteo()) });
}));

// Importa costos desde Excel: filas { referencia, costo }. La referencia puede ser el codigo o el nombre del insumo.
router.post('/insumos/importar', wrap(async (req, res) => {
  const filas = Array.isArray(req.body?.filas) ? req.body.filas : null;
  if (!filas?.length || filas.length > 5000) return res.status(400).json({ error: 'El archivo no tiene filas para importar.' });
  const insumos = await prisma.inventarioItem.findMany({ select: { id: true, codigo: true, nombre: true, costo: true } });
  const normalizar = (texto) => String(texto ?? '').trim().toUpperCase();
  const porCodigo = new Map(insumos.filter((i) => i.codigo).map((i) => [normalizar(i.codigo), i]));
  const porNombre = new Map(insumos.map((i) => [normalizar(i.nombre), i]));
  const cambios = new Map();
  const noEncontrados = [];
  const invalidos = [];
  for (const [indice, fila] of filas.entries()) {
    const referencia = normalizar(fila?.referencia);
    if (!referencia) continue;
    const costo = leerCosto(fila?.costo);
    if (costo === null) { invalidos.push(`Fila ${indice + 2}: ${referencia}`); continue; }
    const insumo = porCodigo.get(referencia) || porNombre.get(referencia);
    if (!insumo) { noEncontrados.push(referencia); continue; }
    cambios.set(insumo.id, { insumo, costo });
  }
  const aplicar = [...cambios.values()].filter(({ insumo, costo }) => Math.abs(insumo.costo - costo) >= 0.005);
  const platos = aplicar.length ? await prisma.$transaction(async (tx) => {
    for (const { insumo, costo } of aplicar) await tx.inventarioItem.update({ where: { id: insumo.id }, data: { costo } });
    return recalcularCostosPlatos(tx, { itemIds: aplicar.map(({ insumo }) => insumo.id) });
  }, { timeout: 60000 }) : 0;
  if (aplicar.length) await auditar({ req, accion: 'EDITAR', entidad: 'costeo_insumo', detalle: `Importación de costos: ${aplicar.length} insumos, ${platos} platos recalculados` });
  res.json({
    insumosActualizados: aplicar.length, sinCambios: cambios.size - aplicar.length, platosActualizados: platos,
    noEncontrados: noEncontrados.slice(0, 50), totalNoEncontrados: noEncontrados.length, invalidos: invalidos.slice(0, 50),
    ...(await datosCosteo()),
  });
}));

// Recalcula y guarda el costo de todos los platos con receta.
router.post('/recalcular', wrap(async (req, res) => {
  const platos = await prisma.$transaction((tx) => recalcularCostosPlatos(tx), { timeout: 60000 });
  res.json({ platosActualizados: platos, ...(await datosCosteo()) });
}));

export default router;
