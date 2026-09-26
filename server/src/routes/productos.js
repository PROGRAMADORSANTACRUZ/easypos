import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';
import { imprimirComandaPorEstacion } from '../impresionCocina.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Calcula cuantas unidades del producto se pueden armar segun el stock de sus insumos
function disponibilidadKit(producto) {
  if (!producto.componentes || producto.componentes.length === 0) return null;
  let max = Infinity;
  for (const c of producto.componentes) {
    if (c.cantidad <= 0) continue;
    max = Math.min(max, Math.floor(c.item.stock / c.cantidad));
  }
  return Number.isFinite(max) ? max : 0;
}

// Listar productos con su receta y disponibilidad
router.get('/', wrap(async (_req, res) => {
  const productos = await prisma.producto.findMany({
    orderBy: { nombre: 'asc' },
    include: {
      categoria: true,
      impuesto: true,
      unidad: true,
      componentes: { include: { item: true } },
    },
  });
  res.json(productos.map((p) => ({ ...p, disponibles: disponibilidadKit(p) })));
}));

// Categorias
router.get('/categorias', wrap(async (_req, res) => {
  const cats = await prisma.categoria.findMany({
    orderBy: { codigo: 'asc' },
    include: { _count: { select: { productos: true } } },
  });
  res.json(cats);
}));

// Calcula el siguiente consecutivo (01, 02...) a partir del mayor codigo numerico existente.
async function siguienteCodigoCategoria() {
  const cats = await prisma.categoria.findMany({ select: { codigo: true } });
  const max = cats.reduce((m, c) => {
    const n = Number(c.codigo);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return String(max + 1).padStart(2, '0');
}

router.post('/categorias', wrap(async (req, res) => {
  const nombre = (req.body?.nombre || '').trim().toUpperCase();
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const impresoraIp = req.body?.impresoraIp?.trim() || null;
  const impresoraPuerto = req.body?.impresoraPuerto ? Number(req.body.impresoraPuerto) : 9100;
  try {
    const codigo = await siguienteCodigoCategoria();
    const cat = await prisma.categoria.create({ data: { nombre, codigo, impresoraIp, impresoraPuerto } });
    res.status(201).json(cat);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Ya existe una categoría con ese nombre' });
    throw e;
  }
}));

// El codigo es fijo desde la creacion: no se acepta en la edicion, solo nombre e impresora.
router.put('/categorias/:id', wrap(async (req, res) => {
  const nombre = (req.body?.nombre || '').trim().toUpperCase();
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const impresoraIp = req.body?.impresoraIp?.trim() || null;
  const impresoraPuerto = req.body?.impresoraPuerto ? Number(req.body.impresoraPuerto) : 9100;
  try {
    const cat = await prisma.categoria.update({ where: { id: String(req.params.id) }, data: { nombre, impresoraIp, impresoraPuerto } });
    res.json(cat);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Ya existe una categoría con ese nombre' });
    if (e.code === 'P2025') return res.status(404).json({ error: 'Categoría no encontrada' });
    throw e;
  }
}));

router.delete('/categorias/:id', wrap(async (req, res) => {
  const id = String(req.params.id);
  const enUso = await prisma.producto.count({ where: { categoriaId: id } });
  if (enUso > 0) {
    return res.status(409).json({ error: `No se puede eliminar: ${enUso} producto(s) usan esta categoría` });
  }
  try {
    await prisma.categoria.delete({ where: { id } });
    res.status(204).end();
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Categoría no encontrada' });
    throw e;
  }
}));

// Envía un ticket de prueba a la impresora de la categoría, para verificar la IP sin tomar un pedido.
router.post('/categorias/:id/probar-impresora', wrap(async (req, res) => {
  const cat = await prisma.categoria.findUnique({ where: { id: String(req.params.id) } });
  if (!cat) return res.status(404).json({ error: 'Categoría no encontrada' });
  if (!cat.impresoraIp) return res.status(400).json({ error: 'Esta categoría no tiene impresora configurada' });
  await imprimirComandaPorEstacion(
    { id: 0, mesa: { numero: 'PRUEBA' }, mesera: { nombre: 'Sistema' } },
    [{ cantidad: 1, notas: null, producto: { nombre: 'TICKET DE PRUEBA', categoria: cat } }],
  );
  res.json({ ok: true });
}));

// Crear producto (opcionalmente con receta de kit)
// body: { nombre, precio, codigo?, codigoBarras?, descripcion?, costo?, impuestoId?, iva?, unidadId?, stockMinimo?, categoriaId?, componentes?: [{ itemId, cantidad }] }
router.post('/', wrap(async (req, res) => {
  const { nombre, precio, codigo, codigoBarras, descripcion, costo, impuestoId, iva, unidadId, stockMinimo, categoriaId, foto, componentes = [] } = req.body;
  try {
    // Si viene un impuesto del maestro DIAN, su porcentaje manda sobre el IVA suelto
    let ivaFinal = Number(iva) || 0;
    if (impuestoId) {
      const imp = await prisma.impuesto.findUnique({ where: { id: String(impuestoId) } });
      if (!imp) return res.status(404).json({ error: 'Impuesto no encontrado' });
      ivaFinal = imp.porcentaje;
    }
    const producto = await prisma.producto.create({
      data: {
        nombre: nombre?.trim().toUpperCase(),
        precio: Number(precio),
        codigo: codigo?.trim() || null,
        codigoBarras: codigoBarras?.trim() || null,
        descripcion: descripcion?.trim().toUpperCase() || null,
        costo: Number(costo) || 0,
        impuestoId: impuestoId ? String(impuestoId) : null,
        iva: ivaFinal,
        unidadId: unidadId ? String(unidadId) : null,
        stockMinimo: Number(stockMinimo) || 0,
        categoriaId: categoriaId ? String(categoriaId) : null,
        foto: foto || null,
        esKit: componentes.length > 0,
        componentes: {
          create: componentes.map((c) => ({
            itemId: Number(c.itemId),
            cantidad: Number(c.cantidad) || 1,
          })),
        },
      },
      include: { componentes: { include: { item: true } }, categoria: true, impuesto: true, unidad: true },
    });
    await auditar({ req, accion: 'CREAR', entidad: 'producto', entidadId: producto.id, detalle: producto.nombre });
    res.status(201).json(producto);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Ya existe un producto con ese código' });
    throw e;
  }
}));

// Actualizar producto y su receta completa
router.put('/:id', wrap(async (req, res) => {
  const id = String(req.params.id);
  const { nombre, precio, codigo, codigoBarras, descripcion, costo, impuestoId, iva, unidadId, stockMinimo, categoriaId, activo, foto, componentes } = req.body;

  // Si viene impuestoId, su porcentaje manda sobre el IVA suelto
  let ivaSync;
  if (impuestoId !== undefined) {
    if (impuestoId) {
      const imp = await prisma.impuesto.findUnique({ where: { id: String(impuestoId) } });
      if (!imp) return res.status(404).json({ error: 'Impuesto no encontrado' });
      ivaSync = imp.porcentaje;
    } else {
      ivaSync = iva !== undefined ? Number(iva) || 0 : 0;
    }
  }

  try {
    const producto = await prisma.$transaction(async (tx) => {
      if (Array.isArray(componentes)) {
        await tx.kitComponente.deleteMany({ where: { productoId: id } });
        for (const c of componentes) {
          await tx.kitComponente.create({
            data: { productoId: id, itemId: Number(c.itemId), cantidad: Number(c.cantidad) || 1 },
          });
        }
      }
      return tx.producto.update({
        where: { id },
        data: {
          ...(nombre !== undefined && { nombre: nombre?.trim().toUpperCase() }),
          ...(precio !== undefined && { precio: Number(precio) }),
          ...(codigo !== undefined && { codigo: codigo?.trim() || null }),
          ...(codigoBarras !== undefined && { codigoBarras: codigoBarras?.trim() || null }),
          ...(descripcion !== undefined && { descripcion: descripcion?.trim().toUpperCase() || null }),
          ...(costo !== undefined && { costo: Number(costo) || 0 }),
          ...(impuestoId !== undefined && { impuestoId: impuestoId ? String(impuestoId) : null }),
          ...(ivaSync !== undefined ? { iva: ivaSync } : (iva !== undefined && { iva: Number(iva) || 0 })),
          ...(unidadId !== undefined && { unidadId: unidadId ? String(unidadId) : null }),
          ...(stockMinimo !== undefined && { stockMinimo: Number(stockMinimo) || 0 }),
          ...(categoriaId !== undefined && { categoriaId: categoriaId ? String(categoriaId) : null }),
          ...(activo !== undefined && { activo }),
          ...(foto !== undefined && { foto: foto || null }),
          ...(Array.isArray(componentes) && { esKit: componentes.length > 0 }),
        },
        include: { componentes: { include: { item: true } }, categoria: true, impuesto: true, unidad: true },
      });
    });

    await auditar({ req, accion: 'EDITAR', entidad: 'producto', entidadId: producto.id, detalle: producto.nombre });
    res.json({ ...producto, disponibles: disponibilidadKit(producto) });
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Ya existe un producto con ese código' });
    if (e.code === 'P2025') return res.status(404).json({ error: 'Producto no encontrado' });
    throw e;
  }
}));

router.delete('/:id', wrap(async (req, res) => {
  const id = String(req.params.id);
  await prisma.producto.delete({ where: { id } });
  await auditar({ req, accion: 'ELIMINAR', entidad: 'producto', entidadId: id });
  res.status(204).end();
}));

export default router;
