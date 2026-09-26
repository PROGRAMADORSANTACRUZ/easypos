import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

import { prisma } from './prisma.js';

import mesasRouter from './routes/mesas.js';
import meserasRouter from './routes/meseras.js';
import cocinerosRouter from './routes/cocineros.js';
import preparacionCocinaRouter from './routes/preparacionCocina.js';
import productosRouter from './routes/productos.js';
import inventarioRouter from './routes/inventario.js';
import bodegasRouter from './routes/bodegas.js';
import existenciasRouter from './routes/existencias.js';
import movimientosRouter from './routes/movimientos.js';
import cajasRouter from './routes/cajas.js';
import asignacionCajasRouter from './routes/asignacionCajas.js';
import tiposDocumentoRouter from './routes/tiposDocumento.js';
import formasPagoRouter from './routes/formasPago.js';
import aperturasRouter from './routes/aperturas.js';
import facturaDetalleRouter from './routes/facturaDetalle.js';
import resolucionesRouter from './routes/resoluciones.js';
import notasCreditoRouter from './routes/notasCredito.js';
import notasDebitoRouter from './routes/notasDebito.js';
import retencionesRouter from './routes/retenciones.js';
import comprasRouter from './routes/compras.js';
import proveedoresRouter from './routes/proveedores.js';
import empresaRouter from './routes/empresa.js';
import sucursalesRouter from './routes/sucursales.js';
import listasPreciosRouter from './routes/listasPrecios.js';
import promocionesRouter from './routes/promociones.js';
import comisionesRouter from './routes/comisiones.js';
import cotizacionesRouter from './routes/cotizaciones.js';
import remisionesRouter from './routes/remisiones.js';
import metodosPagoRouter from './routes/metodosPago.js';
import pagosRouter from './routes/pagos.js';
import tercerosRouter from './routes/terceros.js';
import centrosCostoRouter from './routes/centrosCosto.js';
import cuentasContablesRouter from './routes/cuentasContables.js';
import impuestosRouter from './routes/impuestos.js';
import unidadesMedidaRouter from './routes/unidadesMedida.js';
import eventosDianRouter from './routes/eventosDian.js';
import logsIntegracionesRouter from './routes/logsIntegraciones.js';
import factusRouter from './routes/factus.js';
import pedidosRouter from './routes/pedidos.js';
import facturasRouter from './routes/facturas.js';
import cortesiasRouter from './routes/cortesias.js';
import usuariosRouter from './routes/usuarios.js';
import reportesRouter from './routes/reportes.js';
import clientesRouter from './routes/clientes.js';
import cuentasRouter from './routes/cuentas.js';
import rolesRouter from './routes/roles.js';
import permisosRouter from './routes/permisos.js';
import auditoriaRouter from './routes/auditoria.js';
import restaurantesRouter from './routes/restaurantes.js';
import { resolverTenant } from './middleware/tenant.js';
import { requireAuth, permisoPorMetodo } from './middleware/auth.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(resolverTenant);

app.get('/api/health', (_req, res) => res.json({ ok: true, servicio: 'EASYPOS API' }));

// Rutas protegidas: requieren sesion (JWT) y, cuando el modulo tiene permisos
// definidos en el catalogo (ver server/src/tenantSeed.js), el permiso correspondiente.
// Los routers de "usuarios" y "plataforma/restaurantes" gestionan su propia
// autenticacion internamente porque exponen rutas publicas puntuales (login / listado publico).
app.use('/api/mesas', requireAuth, permisoPorMetodo('mesas'), mesasRouter);
app.use('/api/meseras', requireAuth, meserasRouter);
app.use('/api/cocineros', requireAuth, cocinerosRouter);
app.use('/api/preparacion-cocina', requireAuth, preparacionCocinaRouter);
app.use('/api/productos', requireAuth, permisoPorMetodo('productos'), productosRouter);
app.use('/api/inventario', requireAuth, permisoPorMetodo('inventario'), inventarioRouter);
app.use('/api/bodegas', requireAuth, permisoPorMetodo('bodegas'), bodegasRouter);
app.use('/api/existencias', requireAuth, existenciasRouter);
app.use('/api/movimientos', requireAuth, permisoPorMetodo('movimientos'), movimientosRouter);
app.use('/api/cajas', requireAuth, permisoPorMetodo('caja'), cajasRouter);
app.use('/api/asignacion-cajas', requireAuth, asignacionCajasRouter);
app.use('/api/tipos-documento', requireAuth, tiposDocumentoRouter);
app.use('/api/formas-pago', requireAuth, formasPagoRouter);
app.use('/api/aperturas', requireAuth, aperturasRouter);
app.use('/api/factura-detalle', requireAuth, facturaDetalleRouter);
app.use('/api/resoluciones', requireAuth, permisoPorMetodo('resoluciones'), resolucionesRouter);
app.use('/api/notas-credito', requireAuth, permisoPorMetodo('notas_credito'), notasCreditoRouter);
app.use('/api/notas-debito', requireAuth, permisoPorMetodo('notas_debito'), notasDebitoRouter);
app.use('/api/retenciones', requireAuth, permisoPorMetodo('retenciones'), retencionesRouter);
app.use('/api/compras', requireAuth, permisoPorMetodo('compras'), comprasRouter);
app.use('/api/proveedores', requireAuth, permisoPorMetodo('proveedores'), proveedoresRouter);
app.use('/api/empresa', requireAuth, permisoPorMetodo('empresa'), empresaRouter);
app.use('/api/sucursales', requireAuth, permisoPorMetodo('sucursales'), sucursalesRouter);
app.use('/api/listas-precios', requireAuth, permisoPorMetodo('listas_precios'), listasPreciosRouter);
app.use('/api/promociones', requireAuth, permisoPorMetodo('promociones'), promocionesRouter);
app.use('/api/comisiones', requireAuth, permisoPorMetodo('comisiones'), comisionesRouter);
app.use('/api/cotizaciones', requireAuth, permisoPorMetodo('cotizaciones'), cotizacionesRouter);
app.use('/api/remisiones', requireAuth, permisoPorMetodo('remisiones'), remisionesRouter);
app.use('/api/metodos-pago', requireAuth, permisoPorMetodo('metodos_pago'), metodosPagoRouter);
app.use('/api/pagos', requireAuth, permisoPorMetodo('pagos'), pagosRouter);
app.use('/api/terceros', requireAuth, permisoPorMetodo('terceros'), tercerosRouter);
app.use('/api/centros-costo', requireAuth, permisoPorMetodo('centros_costo'), centrosCostoRouter);
app.use('/api/cuentas-contables', requireAuth, permisoPorMetodo('cuentas_contables'), cuentasContablesRouter);
app.use('/api/impuestos', requireAuth, permisoPorMetodo('impuestos'), impuestosRouter);
app.use('/api/unidades-medida', requireAuth, permisoPorMetodo('unidades_medida'), unidadesMedidaRouter);
app.use('/api/eventos-dian', requireAuth, permisoPorMetodo('eventos_dian'), eventosDianRouter);
app.use('/api/logs-integraciones', requireAuth, permisoPorMetodo('logs_integraciones'), logsIntegracionesRouter);
app.use('/api/factus', requireAuth, permisoPorMetodo('empresa'), factusRouter);
app.use('/api/pedidos', requireAuth, permisoPorMetodo('pedidos'), pedidosRouter);
app.use('/api/facturas', requireAuth, permisoPorMetodo('facturas'), facturasRouter);
app.use('/api/cortesias', requireAuth, permisoPorMetodo('cortesias'), cortesiasRouter);
app.use('/api/usuarios', usuariosRouter);
app.use('/api/reportes', requireAuth, permisoPorMetodo('reportes'), reportesRouter);
app.use('/api/clientes', requireAuth, permisoPorMetodo('clientes'), clientesRouter);
app.use('/api/cuentas', requireAuth, permisoPorMetodo('cuentas'), cuentasRouter);
app.use('/api/roles', requireAuth, permisoPorMetodo('roles'), rolesRouter);
app.use('/api/permisos', requireAuth, permisosRouter);
app.use('/api/auditoria', requireAuth, permisoPorMetodo('auditoria'), auditoriaRouter);
app.use('/api/plataforma/restaurantes', restaurantesRouter);

// API pura: el frontend es una app aparte (CSR) que se sirve por su cuenta y solo
// consume estos endpoints por JSON. Cualquier ruta no reconocida responde 404 en JSON.
app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// Manejo central de errores
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Error interno' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`EASYPOS API escuchando en http://localhost:${PORT}`);
  // Precalienta la conexion a la DB para que la primera consulta no pague el costo de conexion.
  prisma.$connect().catch((e) => console.error('No se pudo precalentar la DB:', e.message));
});
