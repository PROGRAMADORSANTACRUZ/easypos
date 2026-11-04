import { camposMetodoPago, camposValorPago, separarMetodosPago, separarValoresPago } from './pagosFactura.js';

const modelosFactura = new Set(['Factura', 'FacturaVenta']);
const claves = ['companiaCodigo', 'centroOperacionCodigo', 'prefijo', 'numeroFactura'];
const camposCabecera = new Set([
  'createdAt', 'numeroDocumentoCliente', 'nombreCliente', 'sucursalCliente',
  'telefonoCliente', 'direccionCliente', 'barrioCliente', 'ciudadCliente', 'emailCliente',
  'subtotal', 'impuestoPct', 'impuesto', 'total', 'propina', ...camposMetodoPago, ...camposValorPago,
  'credito', 'creditoDias', 'vence', 'cufe', 'numeroFactus', 'xmlPath', 'pdfPath',
  'estadoDIAN', 'usuarioNombre',
]);
const lecturas = new Set(['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count']);
const nombreClave = claves.join('_');

function numeroEntero(valor) {
  if (!/^\d+$/.test(String(valor)) || !Number.isInteger(Number(valor))
    || Number(valor) < 1 || Number(valor) > 2147483647) {
    throw Object.assign(new Error('El consecutivo debe ser un entero positivo de hasta 2147483647.'), { status: 400 });
  }
  return Number(valor);
}

function filtroNumero(valor) {
  if (Array.isArray(valor)) return valor.map(filtroNumero);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([campo, filtro]) => [campo, filtroNumero(filtro)]));
  }
  return valor == null ? valor : numeroEntero(valor);
}

export function crearAdaptadorFacturas(modelos) {
  const relaciones = new Map(modelos.map((modelo) => [modelo.name,
    new Map(modelo.fields.filter((campo) => campo.kind === 'object').map((campo) => [campo.name, campo.type])),
  ]));
  const delegados = new Map(modelos.map((modelo) => [modelo.name[0].toLowerCase() + modelo.name.slice(1), modelo.name]));

  function donde(modelo, filtro) {
    if (!filtro || typeof filtro !== 'object') return filtro;
    if (Array.isArray(filtro)) return filtro.map((parte) => donde(modelo, parte));
    const resultado = {};
    const cabecera = {};
    for (const [campo, valor] of Object.entries(filtro)) {
      if (['AND', 'OR', 'NOT'].includes(campo)) resultado[campo] = donde(modelo, valor);
      else if (modelosFactura.has(modelo) && camposCabecera.has(campo)) cabecera[campo] = valor;
      else if (modelosFactura.has(modelo) && ['numeroFactura', 'consecutivo'].includes(campo)) resultado.numeroFactura = filtroNumero(valor);
      else if (relaciones.get(modelo)?.has(campo) && valor != null) {
        const relacionado = relaciones.get(modelo).get(campo);
        const envoltorios = ['is', 'isNot', 'some', 'every', 'none'];
        resultado[campo] = Object.keys(valor).some((clave) => envoltorios.includes(clave))
          ? Object.fromEntries(Object.entries(valor).map(([clave, parte]) => [clave, donde(relacionado, parte)]))
          : donde(relacionado, valor);
      } else resultado[campo] = valor;
    }
    if (Object.keys(cabecera).length) {
      resultado.AND = [
        ...(resultado.AND ? (Array.isArray(resultado.AND) ? resultado.AND : [resultado.AND]) : []),
        { cabecera: { is: cabecera } },
      ];
    }
    return resultado;
  }

  function ordenar(modelo, orden) {
    if (!orden) return orden;
    if (Array.isArray(orden)) return orden.map((parte) => ordenar(modelo, parte));
    return Object.fromEntries(Object.entries(orden).map(([campo, valor]) => {
      if (modelosFactura.has(modelo) && camposCabecera.has(campo)) return ['cabecera', { [campo]: valor }];
      if (modelosFactura.has(modelo) && campo === 'consecutivo') return ['numeroFactura', valor];
      const relacionado = relaciones.get(modelo)?.get(campo);
      return [campo, relacionado ? ordenar(relacionado, valor) : valor];
    }));
  }

  function argumentos(modelo, originales = {}) {
    const resultado = { ...originales };
    if (originales.where) resultado.where = donde(modelo, originales.where);
    if (originales.orderBy) resultado.orderBy = ordenar(modelo, originales.orderBy);
    for (const proyeccion of ['select', 'include']) {
      if (!originales[proyeccion]) continue;
      const seleccion = {};
      const cabecera = {};
      for (const [campo, opciones] of Object.entries(originales[proyeccion])) {
        if (proyeccion === 'select' && modelosFactura.has(modelo) && camposCabecera.has(campo)) {
          cabecera[campo] = opciones;
        } else if (modelosFactura.has(modelo) && campo === 'consecutivo') {
          seleccion.numeroFactura = opciones;
        } else if (campo === '_count' && opciones?.select) {
          seleccion._count = {
            select: Object.fromEntries(Object.entries(opciones.select).map(([relacion, cuenta]) => [relacion,
              cuenta && typeof cuenta === 'object'
                ? argumentos(relaciones.get(modelo)?.get(relacion), cuenta) : cuenta,
            ])),
          };
        } else {
          const relacionado = relaciones.get(modelo)?.get(campo);
          seleccion[campo] = relacionado && opciones
            ? argumentos(relacionado, opciones === true ? {} : opciones) : opciones;
        }
      }
      if (Object.keys(cabecera).length) seleccion.cabecera = { select: cabecera };
      resultado[proyeccion] = seleccion;
    }
    if (modelosFactura.has(modelo) && !originales.select) {
      resultado.include = { ...resultado.include, cabecera: true };
    }
    return resultado;
  }

  function presentar(modelo, valor, originales = {}) {
    if (valor == null || typeof valor !== 'object') return valor;
    if (Array.isArray(valor)) return valor.map((fila) => presentar(modelo, fila, originales));
    let resultado = { ...valor };
    if (modelosFactura.has(modelo)) {
      const { cabecera, ...operacion } = resultado;
      resultado = { ...cabecera, ...operacion };
      for (const campo of camposMetodoPago) {
        if (typeof resultado[campo] === 'string') resultado[campo] = resultado[campo].replace(/\s+\$.*$/, '');
      }
      for (const campo of camposValorPago) {
        if (resultado[campo] != null) resultado[campo] = Number(resultado[campo]);
      }
      if (resultado.numeroFactura != null) {
        if (modelo === 'FacturaVenta') resultado.consecutivo = resultado.numeroFactura;
        resultado.numeroFactura = String(resultado.numeroFactura);
      }
    }
    for (const [campo, relacionado] of relaciones.get(modelo) || []) {
      if (!(campo in resultado)) continue;
      const opciones = originales.select?.[campo] || originales.include?.[campo];
      resultado[campo] = presentar(relacionado, resultado[campo], opciones === true ? {} : opciones || {});
    }
    if (originales.select && modelosFactura.has(modelo)) {
      resultado = Object.fromEntries(Object.entries(resultado).filter(([campo]) => originales.select[campo]));
    }
    return resultado;
  }

  async function escribir(cliente, modelo, metodo, originales) {
    const delegado = modelo[0].toLowerCase() + modelo.slice(1);
    const tabla = cliente[delegado];
    const cabeceras = cliente[`${delegado}Cabecera`];
    const datos = { ...originales.data };
    const datosCabecera = {};
    for (const campo of camposCabecera) {
      if (datos[campo] !== undefined) datosCabecera[campo] = datos[campo];
      delete datos[campo];
    }
    delete datos.consecutivo;
    if (metodo === 'create' || datos.usuarioId !== undefined) {
      const usuario = datos.usuarioId
        ? await cliente.usuario.findUnique({ where: { id: datos.usuarioId }, select: { usuario: true } }) : null;
      if (!usuario?.usuario) throw Object.assign(new Error('La factura requiere un usuario que factura valido.'), { status: 400 });
      datosCabecera.usuarioNombre = usuario.usuario;
    }
    if (metodo === 'create') {
      datos.numeroFactura = numeroEntero(datos.numeroFactura);
      if (originales.data.consecutivo != null && Number(originales.data.consecutivo) !== datos.numeroFactura) {
        throw Object.assign(new Error('El consecutivo no coincide con el numero de la factura.'), { status: 400 });
      }
      if (claves.some((campo) => datos[campo] == null || datos[campo] === '')) {
        throw Object.assign(new Error('La clave de la factura requiere compania, centro, tipo y numero.'), { status: 400 });
      }
      const tipo = datos.tipoDocumentoId
        ? await cliente.tipoDocumento.findUnique({
          where: { id: datos.tipoDocumentoId },
          select: { companiaCodigo: true, centroOperacionCodigo: true, prefijo: true },
        }) : null;
      if (!tipo || tipo.companiaCodigo !== datos.companiaCodigo || tipo.centroOperacionCodigo !== datos.centroOperacionCodigo
        || tipo.prefijo !== datos.prefijo) {
        throw Object.assign(new Error('El tipo de documento no corresponde a la compania, centro y codigo de la factura.'), { status: 409 });
      }
      datos.metodoPago ||= 'EFECTIVO';
      const pagos = datos.pagos?.create;
      const metodosConImporte = separarMetodosPago(
        { ...datosCabecera, metodoPago: datos.metodoPago },
        pagos ? (Array.isArray(pagos) ? pagos : [pagos]) : [],
      );
      Object.assign(datosCabecera, separarValoresPago(metodosConImporte));
      if (pagos && !datosCabecera.credito) {
        const aplicados = camposMetodoPago.map((campo) => metodosConImporte[campo]).filter((pago) => pago !== '0');
        datos.metodoPago = aplicados.length === 1 ? aplicados[0].split(' $')[0] : aplicados.join(' + ');
      }
      await cabeceras.create({ data: { ...datosCabecera, ...Object.fromEntries(claves.map((campo) => [campo, datos[campo]])) } });
      const consulta = argumentos(modelo, { ...originales, data: datos });
      return presentar(modelo, await tabla.create(consulta), originales);
    }
    if (claves.some((campo) => datos[campo] !== undefined) || originales.data?.consecutivo !== undefined) {
      throw Object.assign(new Error('La clave de una factura emitida no se puede modificar.'), { status: 409 });
    }
    const existente = await tabla.findUniqueOrThrow({
      where: donde(modelo, originales.where),
      select: Object.fromEntries(claves.map((campo) => [campo, true])),
    });
    const clave = Object.fromEntries(claves.map((campo) => [campo, existente[campo]]));
    if (['metodoPago', 'total', 'propina', 'credito'].some((campo) => originales.data?.[campo] !== undefined)) {
      const actual = await tabla.findUniqueOrThrow({ where: donde(modelo, originales.where), include: { cabecera: true } });
      Object.assign(datosCabecera, separarValoresPago(separarMetodosPago({
        ...actual.cabecera, ...datosCabecera, metodoPago: datos.metodoPago ?? actual.metodoPago,
      })));
    }
    if (Object.keys(datosCabecera).length) await cabeceras.update({ where: { [nombreClave]: clave }, data: datosCabecera });
    const consulta = argumentos(modelo, originales);
    const resultado = Object.keys(datos).length
      ? await tabla.update({ ...consulta, data: datos })
      : await tabla.findUniqueOrThrow({ ...consulta, data: undefined });
    return presentar(modelo, resultado, originales);
  }

  function adaptar(cliente, enTransaccion = false) {
    return new Proxy(cliente, {
      get(destino, propiedad) {
        if (propiedad === '$transaction') {
          return (trabajo, opciones) => {
            if (typeof trabajo !== 'function') throw new Error('Usa una transaccion interactiva para las consultas de facturacion.');
            return destino.$transaction((transaccion) => trabajo(adaptar(transaccion, true)), opciones);
          };
        }
        const modelo = delegados.get(propiedad);
        const valor = destino[propiedad];
        if (!modelo) return typeof valor === 'function' ? valor.bind(destino) : valor;
        return new Proxy(valor, {
          get(tabla, metodo) {
            if (typeof tabla[metodo] !== 'function') return tabla[metodo];
            return async (originales = {}) => {
              if (modelosFactura.has(modelo) && ['create', 'update'].includes(metodo)) {
                const ejecutar = (transaccion) => escribir(transaccion, modelo, metodo, originales);
                return enTransaccion ? ejecutar(destino) : destino.$transaction(ejecutar);
              }
              if (modelosFactura.has(modelo) && !lecturas.has(metodo)) {
                throw new Error(`Operacion ${modelo}.${String(metodo)} no habilitada para cabeceras de facturacion.`);
              }
              const consulta = argumentos(modelo, originales);
              if (metodo === 'count') {
                delete consulta.include;
                if (!originales.select) delete consulta.select;
              }
              return presentar(modelo, await tabla[metodo](consulta), originales);
            };
          },
        });
      },
    });
  }
  return adaptar;
}