// Configuración de las páginas CRUD genéricas (maestros y documentos DIAN).
// Cada entrada define navegación (icono, etiqueta, ruta, permiso) y el cfg del CrudPage.

const etiquetaFactura = (f) => (f.numeroFactura ? `${f.prefijo || ''}${f.numeroFactura}` : `#${String(f.id).slice(0, 8)}`);
const fecha = (v) => (v ? String(v).slice(0, 10) : '');

export const CRUD_ENTIDADES = [
  {
    icon: 'sucursales', label: 'Sucursales', ruta: '/sucursales', modulo: 'sucursales',
    cfg: {
      titulo: 'Sucursales', singular: 'Sucursal', modulo: 'sucursales', endpoint: '/sucursales',
      descripcion: 'Puntos de venta / sedes de la empresa.',
      campos: [
        { name: 'codigo', label: 'Código', type: 'text', maxLength: 20 },
        { name: 'nombre', label: 'Nombre', type: 'text', required: true, maxLength: 200 },
        { name: 'direccion', label: 'Dirección', type: 'text' },
        { name: 'telefono', label: 'Teléfono', type: 'text', maxLength: 50 },
        { name: 'ciudad', label: 'Ciudad', type: 'text', maxLength: 100 },
        { name: 'activo', label: 'Activo', type: 'checkbox' },
      ],
      columnas: [
        { label: 'Código', get: (r) => r.codigo },
        { label: 'Nombre', get: (r) => r.nombre },
        { label: 'Ciudad', get: (r) => r.ciudad },
        { label: 'Teléfono', get: (r) => r.telefono },
        { label: 'Activo', get: (r) => (r.activo ? 'Sí' : 'No') },
      ],
    },
  },
  {
    icon: 'listas_precios', label: 'Listas de precios', ruta: '/listas-precios', modulo: 'listas_precios',
    cfg: {
      titulo: 'Listas de precios', singular: 'Lista', modulo: 'listas_precios', endpoint: '/listas-precios',
      descripcion: 'Listas de precios (mayorista, minorista, etc.). El detalle por producto se gestiona vía API.',
      campos: [
        { name: 'nombre', label: 'Nombre', type: 'text', required: true, maxLength: 150 },
        { name: 'descripcion', label: 'Descripción', type: 'textarea' },
        { name: 'activo', label: 'Activo', type: 'checkbox' },
      ],
      columnas: [
        { label: 'Nombre', get: (r) => r.nombre },
        { label: 'Descripción', get: (r) => r.descripcion },
        { label: 'Productos', get: (r) => r._count?.precios ?? 0 },
        { label: 'Activo', get: (r) => (r.activo ? 'Sí' : 'No') },
      ],
    },
  },
  {
    icon: 'promociones', label: 'Promociones', ruta: '/promociones', modulo: 'promociones',
    cfg: {
      titulo: 'Promociones', singular: 'Promoción', modulo: 'promociones', endpoint: '/promociones',
      descripcion: 'Descuentos y promociones vigentes.',
      campos: [
        { name: 'nombre', label: 'Nombre', type: 'text', required: true, maxLength: 200 },
        { name: 'tipo', label: 'Tipo', type: 'select', options: ['PORCENTAJE', 'VALOR', '2X1'] },
        { name: 'valor', label: 'Valor', type: 'number', step: '0.01' },
        { name: 'fechaInicio', label: 'Fecha inicio', type: 'date' },
        { name: 'fechaFin', label: 'Fecha fin', type: 'date' },
        { name: 'activo', label: 'Activo', type: 'checkbox' },
      ],
      columnas: [
        { label: 'Nombre', get: (r) => r.nombre },
        { label: 'Tipo', get: (r) => r.tipo },
        { label: 'Valor', get: (r) => r.valor, money: true },
        { label: 'Inicio', get: (r) => fecha(r.fechaInicio) },
        { label: 'Fin', get: (r) => fecha(r.fechaFin) },
        { label: 'Activo', get: (r) => (r.activo ? 'Sí' : 'No') },
      ],
    },
  },
  {
    icon: 'comisiones', label: 'Comisiones', ruta: '/comisiones', modulo: 'comisiones',
    cfg: {
      titulo: 'Comisiones de vendedores', singular: 'Comisión', modulo: 'comisiones', endpoint: '/comisiones',
      descripcion: 'Comisiones por venta. Si no indicas el valor, se calcula como base × porcentaje.',
      campos: [
        { name: 'vendedorId', label: 'Vendedor', type: 'ref', fuente: '/usuarios', labelKey: 'nombre' },
        { name: 'facturaId', label: 'Factura', type: 'ref', fuente: '/facturas', labelKey: etiquetaFactura },
        { name: 'base', label: 'Base', type: 'number', step: '0.01' },
        { name: 'porcentaje', label: 'Porcentaje (%)', type: 'number', step: '0.01' },
        { name: 'valor', label: 'Valor (opcional)', type: 'number', step: '0.01' },
        { name: 'pagada', label: 'Pagada', type: 'checkbox', default: false, hint: 'Pagada' },
      ],
      columnas: [
        { label: 'Vendedor', get: (r) => r.vendedor?.nombre },
        { label: 'Base', get: (r) => r.base, money: true },
        { label: '%', get: (r) => r.porcentaje },
        { label: 'Valor', get: (r) => r.valor, money: true },
        { label: 'Pagada', get: (r) => (r.pagada ? 'Sí' : 'No') },
      ],
    },
  },
  {
    icon: 'remisiones', label: 'Remisiones', ruta: '/remisiones', modulo: 'remisiones',
    cfg: {
      titulo: 'Remisiones', singular: 'Remisión', modulo: 'remisiones', endpoint: '/remisiones',
      descripcion: 'Notas de entrega / remisiones.',
      campos: [
        { name: 'numero', label: 'Número', type: 'text', maxLength: 50 },
        { name: 'clienteId', label: 'Cliente', type: 'ref', fuente: '/clientes', labelKey: 'nombre' },
        { name: 'estado', label: 'Estado', type: 'select', options: ['PENDIENTE', 'ENTREGADA', 'FACTURADA'], default: 'PENDIENTE' },
        { name: 'observaciones', label: 'Observaciones', type: 'textarea' },
      ],
      columnas: [
        { label: 'Número', get: (r) => r.numero },
        { label: 'Cliente', get: (r) => r.cliente?.nombre },
        { label: 'Estado', get: (r) => r.estado },
        { label: 'Fecha', get: (r) => fecha(r.fecha) },
      ],
    },
  },
  {
    icon: 'metodos_pago', label: 'Métodos de pago', ruta: '/metodos-pago', modulo: 'metodos_pago',
    cfg: {
      titulo: 'Métodos de pago', singular: 'Método', modulo: 'metodos_pago', endpoint: '/metodos-pago',
      descripcion: 'Catálogo de formas de pago con su código DIAN.',
      campos: [
        { name: 'nombre', label: 'Nombre', type: 'text', required: true, maxLength: 100 },
        { name: 'codigoDIAN', label: 'Código DIAN', type: 'text', maxLength: 10 },
        { name: 'activo', label: 'Activo', type: 'checkbox' },
      ],
      columnas: [
        { label: 'Nombre', get: (r) => r.nombre },
        { label: 'Código DIAN', get: (r) => r.codigoDIAN },
        { label: 'Activo', get: (r) => (r.activo ? 'Sí' : 'No') },
      ],
    },
  },
  {
    icon: 'pagos', label: 'Pagos', ruta: '/pagos', modulo: 'pagos',
    cfg: {
      titulo: 'Pagos', singular: 'Pago', modulo: 'pagos', endpoint: '/pagos',
      descripcion: 'Pagos recibidos asociados a facturas.',
      campos: [
        { name: 'facturaId', label: 'Factura', type: 'ref', fuente: '/facturas', labelKey: etiquetaFactura },
        { name: 'metodoPagoId', label: 'Método de pago', type: 'ref', fuente: '/metodos-pago', labelKey: 'nombre' },
        { name: 'monto', label: 'Monto', type: 'number', required: true, step: '0.01' },
        { name: 'referencia', label: 'Referencia', type: 'text', maxLength: 100 },
      ],
      columnas: [
        { label: 'Factura', get: (r) => (r.factura ? etiquetaFactura(r.factura) : '') },
        { label: 'Método', get: (r) => r.metodoPago?.nombre },
        { label: 'Monto', get: (r) => r.monto, money: true },
        { label: 'Referencia', get: (r) => r.referencia },
        { label: 'Fecha', get: (r) => fecha(r.fecha) },
      ],
    },
  },
  {
    icon: 'terceros', label: 'Terceros', ruta: '/terceros', modulo: 'terceros',
    cfg: {
      titulo: 'Terceros', singular: 'Tercero', modulo: 'terceros', endpoint: '/terceros',
      descripcion: 'Clientes, proveedores y empleados para contabilidad / DIAN.',
      campos: [
        { name: 'tipoDocumento', label: 'Tipo documento', type: 'select', options: ['CC', 'NIT', 'CE', 'PP', 'TI'] },
        { name: 'numeroDocumento', label: 'Número documento', type: 'text', maxLength: 30 },
        { name: 'nombre', label: 'Nombre', type: 'text', required: true, maxLength: 250 },
        { name: 'tipo', label: 'Tipo', type: 'select', options: ['CLIENTE', 'PROVEEDOR', 'EMPLEADO', 'OTRO'] },
        { name: 'telefono', label: 'Teléfono', type: 'text', maxLength: 50 },
        { name: 'email', label: 'Email', type: 'text', maxLength: 150 },
        { name: 'direccion', label: 'Dirección', type: 'text' },
        { name: 'activo', label: 'Activo', type: 'checkbox' },
      ],
      columnas: [
        { label: 'Documento', get: (r) => [r.tipoDocumento, r.numeroDocumento].filter(Boolean).join(' ') },
        { label: 'Nombre', get: (r) => r.nombre },
        { label: 'Tipo', get: (r) => r.tipo },
        { label: 'Teléfono', get: (r) => r.telefono },
        { label: 'Activo', get: (r) => (r.activo ? 'Sí' : 'No') },
      ],
    },
  },
  {
    icon: 'centros_costo', label: 'Centros de costo', ruta: '/centros-costo', modulo: 'centros_costo',
    cfg: {
      titulo: 'Centros de costo', singular: 'Centro de costo', modulo: 'centros_costo', endpoint: '/centros-costo',
      descripcion: 'Centros de costo para contabilidad.',
      campos: [
        { name: 'codigo', label: 'Código', type: 'text', maxLength: 20 },
        { name: 'nombre', label: 'Nombre', type: 'text', required: true, maxLength: 150 },
        { name: 'activo', label: 'Activo', type: 'checkbox' },
      ],
      columnas: [
        { label: 'Código', get: (r) => r.codigo },
        { label: 'Nombre', get: (r) => r.nombre },
        { label: 'Activo', get: (r) => (r.activo ? 'Sí' : 'No') },
      ],
    },
  },
  {
    icon: 'cuentas_contables', label: 'Plan de cuentas', ruta: '/cuentas-contables', modulo: 'cuentas_contables',
    cfg: {
      titulo: 'Plan de cuentas', singular: 'Cuenta contable', modulo: 'cuentas_contables', endpoint: '/cuentas-contables',
      descripcion: 'Cuentas contables (PUC) a las que se imputan los insumos.',
      campos: [
        { name: 'codigo', label: 'Código', type: 'text', required: true, maxLength: 20 },
        { name: 'nombre', label: 'Nombre', type: 'text', required: true, maxLength: 200 },
        { name: 'tipo', label: 'Tipo', type: 'select', options: ['ACTIVO', 'PASIVO', 'PATRIMONIO', 'INGRESO', 'GASTO', 'COSTO'] },
        { name: 'activo', label: 'Activo', type: 'checkbox' },
      ],
      columnas: [
        { label: 'Código', get: (r) => r.codigo },
        { label: 'Nombre', get: (r) => r.nombre },
        { label: 'Tipo', get: (r) => r.tipo },
        { label: 'Activo', get: (r) => (r.activo ? 'Sí' : 'No') },
      ],
    },
  },
  {
    icon: 'impuestos', label: 'Impuestos', ruta: '/impuestos', modulo: 'impuestos',
    cfg: {
      titulo: 'Impuestos', singular: 'Impuesto', modulo: 'impuestos', endpoint: '/impuestos',
      descripcion: 'Impuestos configurables (IVA, INC, retenciones).',
      campos: [
        { name: 'nombre', label: 'Impuesto', type: 'text', required: true, maxLength: 100 },
        { name: 'tipo', label: 'Tipo', type: 'select', options: ['IVA', 'INC', 'RETEFUENTE', 'RETEIVA', 'RETEICA'] },
        { name: 'porcentaje', label: 'Porcentaje Impuesto (%)', type: 'number', step: '0.01' },
        { name: 'valorImpuesto', label: 'Valor Impuesto (fijo)', type: 'number', step: '0.01' },
        { name: 'ctaCreditoVentas', label: 'Cta Crédito Ventas', type: 'text', maxLength: 30 },
        { name: 'ctaDebitoVentas', label: 'Cta Débito Ventas', type: 'text', maxLength: 30 },
        { name: 'cuentasBase', label: 'Cuentas Base', type: 'checkbox', default: false },
        { name: 'cuentasBaseDevoluciones', label: 'Cuentas Base Devoluciones', type: 'checkbox', default: false },
        { name: 'ctaDebitoCompras', label: 'Cta Débito Compras', type: 'text', maxLength: 30 },
        { name: 'ctaCreditoCompras', label: 'Cta Crédito Compras', type: 'text', maxLength: 30 },
        { name: 'codigoDIAN', label: 'Tipo_Impuesto (código DIAN)', type: 'text', maxLength: 10 },
        { name: 'exportado', label: 'Exportado', type: 'checkbox' },
        { name: 'activo', label: 'Activo', type: 'checkbox' },
      ],
      columnas: [
        { label: 'IdImpuesto', get: (r) => r.idImpuesto },
        { label: 'Nombre', get: (r) => r.nombre },
        { label: 'Tipo', get: (r) => r.tipo },
        { label: '%', get: (r) => r.porcentaje },
        { label: 'Valor', get: (r) => r.valorImpuesto },
        { label: 'Cta Créd. Ventas', get: (r) => r.ctaCreditoVentas },
        { label: 'Cta Déb. Ventas', get: (r) => r.ctaDebitoVentas },
        { label: 'Cuentas Base', get: (r) => (r.cuentasBase ? 'S' : 'N') },
        { label: 'Cuentas Base Devoluciones', get: (r) => (r.cuentasBaseDevoluciones ? 'S' : 'N') },
        { label: 'Cta Déb. Compras', get: (r) => r.ctaDebitoCompras },
        { label: 'Cta Créd. Compras', get: (r) => r.ctaCreditoCompras },
        { label: 'Tipo_Impuesto', get: (r) => r.codigoDIAN },
        { label: 'Exportado', get: (r) => (r.exportado ? 'S' : 'N') },
        { label: 'Activo', get: (r) => (r.activo ? 'Sí' : 'No') },
      ],
    },
  },
  {
    icon: 'unidades', label: 'Unidades de Medida', ruta: '/unidades-medida', modulo: 'unidades_medida',
    cfg: {
      titulo: 'Unidades de Medida', singular: 'Unidad', modulo: 'unidades_medida', endpoint: '/unidades-medida',
      descripcion: 'Unidades para productos e insumos (Kilogramo, Unidad, Mililitro...), con su factor de conversión.',
      campos: [
        { name: 'nombre', label: 'Nombre', type: 'text', required: true, maxLength: 50 },
        { name: 'abreviatura', label: 'Abreviatura', type: 'text', required: true, maxLength: 10 },
        { name: 'factorConversion', label: 'Factor de conversión', type: 'number', step: '0.01', default: 1 },
        { name: 'activo', label: 'Activo', type: 'checkbox' },
      ],
      columnas: [
        { label: 'Nombre', get: (r) => r.nombre },
        { label: 'Abreviatura', get: (r) => r.abreviatura },
        { label: 'Factor de conversión', get: (r) => r.factorConversion },
        { label: 'Activo', get: (r) => (r.activo ? 'Sí' : 'No') },
      ],
    },
  },
  {
    icon: 'eventos_dian', label: 'Eventos DIAN', ruta: '/eventos-dian', modulo: 'eventos_dian',
    cfg: {
      titulo: 'Eventos DIAN', singular: 'Evento', modulo: 'eventos_dian', endpoint: '/eventos-dian',
      descripcion: 'Eventos de facturación electrónica (acuse, aceptación, rechazo).',
      campos: [
        { name: 'facturaId', label: 'Factura', type: 'ref', fuente: '/facturas', labelKey: etiquetaFactura },
        { name: 'tipoEvento', label: 'Tipo de evento', type: 'text', maxLength: 50 },
        { name: 'estado', label: 'Estado', type: 'text', maxLength: 50 },
        { name: 'cufe', label: 'CUFE', type: 'text', maxLength: 200 },
        { name: 'mensaje', label: 'Mensaje', type: 'textarea' },
      ],
      columnas: [
        { label: 'Factura', get: (r) => (r.factura ? etiquetaFactura(r.factura) : '') },
        { label: 'Tipo', get: (r) => r.tipoEvento },
        { label: 'Estado', get: (r) => r.estado },
        { label: 'CUFE', get: (r) => r.cufe },
        { label: 'Fecha', get: (r) => fecha(r.fecha) },
      ],
    },
  },
  {
    icon: 'logs_integraciones', label: 'Logs integraciones', ruta: '/logs-integraciones', modulo: 'logs_integraciones',
    cfg: {
      titulo: 'Logs de integraciones', singular: 'Log', modulo: 'logs_integraciones', endpoint: '/logs-integraciones',
      descripcion: 'Registro de comunicaciones con sistemas externos (DIAN, pasarelas).',
      campos: [],
      columnas: [
        { label: 'Sistema', get: (r) => r.sistema },
        { label: 'Tipo', get: (r) => r.tipo },
        { label: 'Estado', get: (r) => r.estado },
        { label: 'Mensaje', get: (r) => r.mensaje },
        { label: 'Fecha', get: (r) => fecha(r.fecha) },
      ],
    },
  },
];
