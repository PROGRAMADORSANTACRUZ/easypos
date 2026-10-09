export const GRUPOS_MODULOS_RESTAURANTE = [
  { id: 'ventas', label: 'Ventas' },
  { id: 'inventario', label: 'Inventario y Compras' },
  { id: 'dian', label: 'Facturación DIAN' },
  { id: 'parametros', label: 'Parámetros' },
  { id: 'reportes', label: 'Reportes' },
  { id: 'maestros', label: 'Maestros / DIAN' },
  { id: 'admin', label: 'Administración' },
];

export const MODULOS_RESTAURANTE_DEFAULT = GRUPOS_MODULOS_RESTAURANTE.map(({ id }) => id);

const RUTAS_MODULO = [
  ['ventas', ['/api/mesas', '/api/meseras', '/api/cocineros', '/api/preparacion-cocina', '/api/cajas', '/api/aperturas', '/api/pagos', '/api/pedidos', '/api/ventas-congeladas', '/api/cortesias', '/api/cuentas']],
  ['inventario', ['/api/inventario', '/api/bodegas', '/api/existencias', '/api/movimientos', '/api/compras', '/api/proveedores']],
  ['dian', ['/api/resoluciones', '/api/notas-credito', '/api/notas-debito', '/api/retenciones', '/api/eventos-dian', '/api/logs-integraciones', '/api/factus']],
  ['parametros', ['/api/companias', '/api/centros-operaciones', '/api/asignacion-cajas', '/api/tipos-documento']],
  ['reportes', ['/api/reportes']],
  ['maestros', ['/api/sucursales', '/api/listas-precios', '/api/promociones', '/api/comisiones', '/api/remisiones', '/api/metodos-pago', '/api/terceros', '/api/centros-costo', '/api/cuentas-contables', '/api/impuestos', '/api/unidades-medida']],
  ['admin', ['/api/usuarios', '/api/roles', '/api/permisos', '/api/auditoria']],
];

function gruposParaRuta(req) {
  const lectura = ['GET', 'HEAD'].includes(req.method);
  if (req.path === '/api/plataforma/restaurantes/publico') return [];
  if (req.path.startsWith('/api/productos/categorias')) return lectura ? ['ventas', 'dian', 'inventario', 'parametros'] : ['parametros'];
  if (req.path === '/api/productos' || req.path.startsWith('/api/productos/')) return lectura ? ['ventas', 'dian', 'inventario'] : ['inventario'];
  if (req.path === '/api/empresa' || req.path.startsWith('/api/empresa/')) return lectura ? ['ventas', 'dian', 'parametros'] : ['parametros'];
  if (req.path === '/api/formas-pago' || req.path.startsWith('/api/formas-pago/')) return lectura ? ['ventas', 'dian', 'parametros'] : ['parametros'];
  if (req.path === '/api/metodos-pago' || req.path.startsWith('/api/metodos-pago/')) return lectura ? ['ventas', 'dian', 'maestros'] : ['maestros'];
  if (req.path === '/api/clientes' || req.path.startsWith('/api/clientes/')) return lectura ? ['ventas', 'dian'] : ['ventas'];
  if (req.path === '/api/factura-detalle' || req.path.startsWith('/api/factura-detalle/')) return ['ventas', 'dian'];
  if (req.path.startsWith('/api/facturas')) {
    if (req.path.endsWith('/reenviar-dian')) return ['dian'];
    const electronica = req.query?.electronica ?? req.body?.electronica;
    if (lectura && req.path !== '/api/facturas' && electronica === undefined) return ['ventas', 'dian'];
    return electronica === false || electronica === 'false' ? ['ventas'] : ['dian'];
  }
  if (req.path.startsWith('/api/usuarios/') && ['login', 'sesion', 'logout'].includes(req.path.split('/').at(-1))) return [];
  return RUTAS_MODULO.filter(([, prefijos]) => prefijos.some((prefijo) => req.path === prefijo || req.path.startsWith(`${prefijo}/`))).map(([grupo]) => grupo);
}

export function restringirModuloRestaurante(req, res, next) {
  const grupos = gruposParaRuta(req);
  if (grupos.length === 0 || !req.tenant || !Array.isArray(req.tenant.modulos)) return next();
  if (grupos.some((grupo) => req.tenant.modulos.includes(grupo))) return next();
  return res.status(403).json({ error: 'Este módulo no está habilitado para el restaurante' });
}

export function validarModulosRestaurante(modulos) {
  const permitidos = new Set(MODULOS_RESTAURANTE_DEFAULT);
  return Array.isArray(modulos)
    && modulos.length > 0
    && modulos.every((modulo) => permitidos.has(modulo))
    && new Set(modulos).size === modulos.length;
}
