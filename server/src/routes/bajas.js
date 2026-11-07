import { Router } from 'express';
import { prisma } from '../prisma.js';
import { auditar } from '../auditoria.js';
import { ajustarStockEnBodega } from '../inventarioKits.js';

const router = Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const tiposItem = new Set(['PRODUCTO', 'INSUMO']);
const estadosBaja = new Set(['PENDIENTE', 'APROBADA', 'RECHAZADA']);
const patronFoto = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/i;

const seleccionBajaLista = {
  id: true,
  tipoItem: true,
  productoId: true,
  itemId: true,
  bodegaId: true,
  cantidad: true,
  notas: true,
  estado: true,
  solicitadoPorId: true,
  solicitanteCuenta: true,
  solicitanteNombre: true,
  decididoPorId: true,
  decisionCuenta: true,
  decisionNombre: true,
  respuesta: true,
  createdAt: true,
  decididoAt: true,
  producto: { select: { id: true, nombre: true, codigo: true } },
  item: { select: { id: true, nombre: true, codigo: true, unidad: true } },
  bodega: { select: { id: true, nombre: true } },
};

const exigirPermiso = (codigo) => (req, res, next) => {
  if ((req.usuario?.permisos || []).includes(codigo)) return next();
  return res.status(403).json({ error: `No tienes permiso para ${codigo}` });
};

const errorHttp = (mensaje, status) => Object.assign(new Error(mensaje), { status });

function validarFotos(fotos) {
  if (!Array.isArray(fotos) || fotos.length < 1 || fotos.length > 3) return false;
  let bytesTotales = 0;
  for (const foto of fotos) {
    if (typeof foto !== 'string') return false;
    const coincidencia = foto.match(patronFoto);
    if (!coincidencia) return false;
    const bytes = Buffer.from(coincidencia[1], 'base64');
    if (!bytes.length || bytes.length > 1_000_000 || bytes.toString('base64') !== coincidencia[1]) return false;
    bytesTotales += bytes.length;
  }
  return bytesTotales <= 3_000_000;
}

function validarCantidad(valor) {
  const cantidad = Number(valor);
  return Number.isFinite(cantidad) && cantidad > 0 ? cantidad : null;
}

router.get('/', exigirPermiso('inventario.ver'), wrap(async (req, res) => {
  const estado = String(req.query.estado || 'TODAS').toUpperCase();
  if (estado !== 'TODAS' && !estadosBaja.has(estado)) {
    return res.status(400).json({ error: 'Estado de baja inválido' });
  }
  const bajas = await prisma.bajaInventario.findMany({
    where: estado === 'TODAS' ? undefined : { estado },
    select: seleccionBajaLista,
    orderBy: { createdAt: 'desc' },
  });
  res.json(bajas);
}));

router.get('/opciones', exigirPermiso('inventario.ver'), wrap(async (_req, res) => {
  const [bodegas, productos, insumos] = await Promise.all([
    prisma.bodega.findMany({ orderBy: [{ nombre: 'asc' }, { id: 'asc' }] }),
    prisma.inventario.findMany({
      where: { cantidad: { gt: 0 }, productoId: { not: null }, bodegaId: { not: null } },
      select: {
        productoId: true,
        bodegaId: true,
        cantidad: true,
        producto: { select: { id: true, nombre: true, codigo: true, costo: true } },
        bodega: { select: { id: true, nombre: true } },
      },
    }),
    prisma.inventarioItemBodega.findMany({
      where: { stock: { gt: 0 } },
      select: {
        itemId: true,
        bodegaId: true,
        stock: true,
        item: { select: { id: true, nombre: true, codigo: true, unidad: true, costo: true } },
        bodega: { select: { id: true, nombre: true } },
      },
    }),
  ]);
  res.json({ bodegas, productos, insumos });
}));

router.get('/:id/fotos', exigirPermiso('inventario.ver'), wrap(async (req, res) => {
  const baja = await prisma.bajaInventario.findUnique({ where: { id: String(req.params.id) }, select: { fotos: true } });
  if (!baja) return res.status(404).json({ error: 'Solicitud de baja no encontrada' });
  res.json({ fotos: baja.fotos });
}));
router.post('/', exigirPermiso('inventario.crear'), wrap(async (req, res) => {
  const tipoItem = String(req.body?.tipoItem || '').toUpperCase();
  const bodegaId = String(req.body?.bodegaId || '');
  const cantidad = validarCantidad(req.body?.cantidad);
  const notas = req.body?.notas == null ? null : String(req.body.notas).trim();
  if (!tiposItem.has(tipoItem)) return res.status(400).json({ error: 'Selecciona un producto o un insumo' });
  if (!bodegaId) return res.status(400).json({ error: 'Selecciona una bodega' });
  if (cantidad === null) return res.status(400).json({ error: 'La cantidad debe ser mayor a cero' });
  if (notas?.length > 2000) return res.status(400).json({ error: 'Las notas no pueden superar 2000 caracteres' });
  if (!validarFotos(req.body?.fotos)) return res.status(400).json({ error: 'Adjunta de 1 a 3 fotos válidas, de máximo 1 MB cada una' });

  const productoId = tipoItem === 'PRODUCTO' ? String(req.body?.productoId || '') : null;
  const itemId = tipoItem === 'INSUMO' ? Number(req.body?.itemId) : null;
  if (tipoItem === 'PRODUCTO' && !productoId) return res.status(400).json({ error: 'Selecciona un producto' });
  if (tipoItem === 'INSUMO' && (!Number.isSafeInteger(itemId) || itemId <= 0)) return res.status(400).json({ error: 'Selecciona un insumo' });

  const baja = await prisma.$transaction(async (tx) => {
    const bodega = await tx.bodega.findUnique({ where: { id: bodegaId } });
    if (!bodega) throw errorHttp('La bodega seleccionada no existe', 404);
    let articulo;
    let stock;
    if (tipoItem === 'PRODUCTO') {
      articulo = await tx.inventario.findFirst({
        where: { productoId, bodegaId },
        include: { producto: true },
      });
      if (!articulo?.producto) throw errorHttp('El producto no tiene una existencia registrada en esa bodega', 404);
      stock = articulo.cantidad;
    } else {
      articulo = await tx.inventarioItemBodega.findUnique({
        where: { itemId_bodegaId: { itemId, bodegaId } },
        include: { item: true },
      });
      if (!articulo?.item) throw errorHttp('El insumo no tiene una existencia registrada en esa bodega', 404);
      stock = articulo.stock;
    }
    if (stock < cantidad) throw errorHttp(`Stock insuficiente en ${bodega.nombre} (disponible ${stock})`, 409);

    return tx.bajaInventario.create({
      data: {
        tipoItem,
        productoId,
        itemId,
        bodegaId,
        cantidad,
        fotos: req.body.fotos,
        notas: notas || null,
        solicitadoPorId: req.usuario.id,
        solicitanteCuenta: req.usuario.usuario,
        solicitanteNombre: req.usuario.nombre,
      },
      select: seleccionBajaLista,
    });
  });

  await auditar({ req, accion: 'CREAR', entidad: 'BajaInventario', entidadId: baja.id, detalle: `${tipoItem} x${cantidad} en ${baja.bodega.nombre}` });
  res.status(201).json(baja);
}));

async function cargarPendienteParaDecision(tx, req, id) {
  await tx.$queryRaw`SELECT "id" FROM "BajasInventario" WHERE "id" = ${id} FOR UPDATE`;
  const baja = await tx.bajaInventario.findUnique({ where: { id } });
  if (!baja) throw errorHttp('Solicitud de baja no encontrada', 404);
  if (baja.estado !== 'PENDIENTE') throw errorHttp('La solicitud ya fue atendida', 409);
  if (baja.solicitadoPorId === req.usuario.id) throw errorHttp('Otra persona debe aprobar o rechazar esta solicitud', 403);
  return baja;
}

router.post('/:id/aprobar', exigirPermiso('inventario.editar'), wrap(async (req, res) => {
  const id = String(req.params.id);
  const baja = await prisma.$transaction(async (tx) => {
    const pendiente = await cargarPendienteParaDecision(tx, req, id);
    let costoUnitario = 0;
    if (pendiente.tipoItem === 'PRODUCTO') {
      const existencia = await tx.inventario.findFirst({
        where: { productoId: pendiente.productoId, bodegaId: pendiente.bodegaId },
        include: { producto: true },
      });
      if (!existencia?.producto) throw errorHttp('La existencia del producto ya no está disponible', 409);
      const descontado = await tx.inventario.updateMany({
        where: { id: existencia.id, cantidad: { gte: pendiente.cantidad } },
        data: { cantidad: { decrement: pendiente.cantidad } },
      });
      if (descontado.count !== 1) throw errorHttp('Stock insuficiente para aprobar esta baja', 409);
      costoUnitario = existencia.producto.costo || 0;
    } else {
      const existencia = await tx.inventarioItemBodega.findUnique({
        where: { itemId_bodegaId: { itemId: pendiente.itemId, bodegaId: pendiente.bodegaId } },
        include: { item: true },
      });
      if (!existencia?.item || existencia.stock < pendiente.cantidad) throw errorHttp('Stock insuficiente para aprobar esta baja', 409);
      costoUnitario = existencia.item.costo || 0;
      await ajustarStockEnBodega(tx, pendiente.itemId, pendiente.bodegaId, -pendiente.cantidad);
    }
    await tx.movimientoInventario.create({
      data: {
        productoId: pendiente.productoId,
        itemId: pendiente.itemId,
        bodegaId: pendiente.bodegaId,
        tipoMovimiento: 'BAJA',
        cantidad: pendiente.cantidad,
        costoUnitario,
        documentoReferencia: `BAJA ${pendiente.id}`,
      },
    });
    return tx.bajaInventario.update({
      where: { id },
      data: {
        estado: 'APROBADA',
        decididoPorId: req.usuario.id,
        decisionCuenta: req.usuario.usuario,
        decisionNombre: req.usuario.nombre,
        decididoAt: new Date(),
      },
      select: seleccionBajaLista,
    });
  });
  await auditar({ req, accion: 'APROBAR_BAJA', entidad: 'BajaInventario', entidadId: baja.id, detalle: `${baja.tipoItem} x${baja.cantidad}` });
  res.json(baja);
}));

router.post('/:id/rechazar', exigirPermiso('inventario.editar'), wrap(async (req, res) => {
  const respuesta = String(req.body?.respuesta || '').trim();
  if (!respuesta || respuesta.length > 1000) return res.status(400).json({ error: 'Indica un motivo de rechazo (máximo 1000 caracteres)' });
  const id = String(req.params.id);
  const baja = await prisma.$transaction(async (tx) => {
    await cargarPendienteParaDecision(tx, req, id);
    return tx.bajaInventario.update({
      where: { id },
      data: {
        estado: 'RECHAZADA',
        decididoPorId: req.usuario.id,
        decisionCuenta: req.usuario.usuario,
        decisionNombre: req.usuario.nombre,
        respuesta,
        decididoAt: new Date(),
      },
      select: seleccionBajaLista,
    });
  });
  await auditar({ req, accion: 'RECHAZAR_BAJA', entidad: 'BajaInventario', entidadId: baja.id, detalle: respuesta });
  res.json(baja);
}));

export default router;