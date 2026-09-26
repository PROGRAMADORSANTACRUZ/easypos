import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const redondear = (n) => Math.round(n * 100) / 100;

// Asigna el siguiente consecutivo propio de cortesias (independiente de la numeracion DIAN).
async function siguienteConsecutivo(tx) {
  const ultima = await tx.cortesia.findFirst({ orderBy: { consecutivo: 'desc' }, select: { consecutivo: true } });
  const consecutivo = (ultima?.consecutivo || 0) + 1;
  const numero = `CORT-${String(consecutivo).padStart(6, '0')}`;
  return { consecutivo, numero };
}

const incluir = {
  cliente: true,
  detalle: { include: { producto: true } },
};

// Listar cortesias
router.get('/', wrap(async (_req, res) => {
  const cortesias = await prisma.cortesia.findMany({ orderBy: { createdAt: 'desc' }, include: incluir });
  res.json(cortesias);
}));

router.get('/:id', wrap(async (req, res) => {
  const cortesia = await prisma.cortesia.findUnique({ where: { id: String(req.params.id) }, include: incluir });
  if (!cortesia) return res.status(404).json({ error: 'Cortesia no encontrada' });
  res.json(cortesia);
}));

// Registrar una cortesia: descuenta los insumos de los kits, registra el movimiento de inventario
// y asigna un consecutivo propio. No genera factura DIAN.
// body: { items: [{ productoId, cantidad }], clienteId?, motivo?, observaciones? }
router.post('/', wrap(async (req, res) => {
  const { items, clienteId, motivo, observaciones } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Agrega al menos un producto a la cortesia' });
  }

  const productoIds = [...new Set(items.map((i) => String(i.productoId)))];
  const productos = await prisma.producto.findMany({
    where: { id: { in: productoIds } },
    include: { componentes: { include: { item: true } } },
  });
  const porId = new Map(productos.map((p) => [p.id, p]));

  // Normalizar lineas y calcular insumos requeridos (agrupados por item)
  const lineas = [];
  const requeridos = new Map(); // itemId -> cantidad total
  for (const i of items) {
    const prod = porId.get(String(i.productoId));
    if (!prod) return res.status(404).json({ error: `Producto no encontrado: ${i.productoId}` });
    const cantidad = Number(i.cantidad) || 0;
    if (cantidad <= 0) return res.status(400).json({ error: `Cantidad invalida para "${prod.nombre}"` });
    lineas.push({ producto: prod, cantidad });
    for (const c of prod.componentes) {
      requeridos.set(c.itemId, (requeridos.get(c.itemId) || 0) + c.cantidad * cantidad);
    }
  }

  // Validar stock disponible de insumos antes de descontar
  const itemIds = [...requeridos.keys()];
  const insumos = itemIds.length
    ? await prisma.inventarioItem.findMany({ where: { id: { in: itemIds } } })
    : [];
  for (const insumo of insumos) {
    const req_ = requeridos.get(insumo.id) || 0;
    if (insumo.stock < req_) {
      return res.status(409).json({
        error: `Inventario insuficiente de "${insumo.nombre}" (disponible ${insumo.stock}, requerido ${req_})`,
      });
    }
  }
  const costoPorItem = new Map(insumos.map((i) => [i.id, i.costo]));

  const subtotal = redondear(lineas.reduce((s, l) => s + l.producto.precio * l.cantidad, 0));
  const usuarioId = req.headers['x-usuario-id'] ? String(req.headers['x-usuario-id']) : null;
  const cli = clienteId ? await prisma.cliente.findUnique({ where: { id: String(clienteId) } }) : null;

  const cortesia = await prisma.$transaction(async (tx) => {
    const { consecutivo, numero } = await siguienteConsecutivo(tx);

    // Descontar insumos y dejar trazabilidad como movimiento de inventario (SALIDA)
    for (const [itemId, cantidad] of requeridos.entries()) {
      await tx.inventarioItem.update({ where: { id: itemId }, data: { stock: { decrement: cantidad } } });
      await tx.movimientoInventario.create({
        data: {
          itemId,
          tipoMovimiento: 'SALIDA',
          cantidad,
          costoUnitario: costoPorItem.get(itemId) || 0,
          documentoReferencia: numero,
        },
      });
    }

    return tx.cortesia.create({
      data: {
        consecutivo,
        numero,
        clienteId: cli?.id || null,
        motivo: motivo ? String(motivo).slice(0, 200) : null,
        observaciones: observaciones ? String(observaciones) : null,
        subtotal,
        usuarioId,
        detalle: {
          create: lineas.map((l) => ({
            productoId: l.producto.id,
            cantidad: l.cantidad,
            precioUnitario: l.producto.precio,
            total: redondear(l.producto.precio * l.cantidad),
          })),
        },
      },
      include: incluir,
    });
  });

  await auditar({ req, accion: 'CREAR', entidad: 'cortesia', entidadId: cortesia.id, detalle: `${cortesia.numero} • ${lineas.length} item(s)` });
  res.status(201).json(cortesia);
}));

export default router;
