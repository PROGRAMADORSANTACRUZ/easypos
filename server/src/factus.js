// Cliente para la API de Factus (proveedor tecnologico DIAN). OAuth2 password grant con cache de token.
import { prisma } from './prisma.js';
import { codigoPagoDian } from './pagosFactura.js';

const BASE_URL = process.env.FACTUS_BASE_URL || 'https://api-sandbox.factus.com.co';

let tokenCache = null; // { accessToken, refreshToken, expiraEn (timestamp ms) }

async function solicitarToken() {
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: process.env.FACTUS_CLIENT_ID || '',
    client_secret: process.env.FACTUS_CLIENT_SECRET || '',
    username: process.env.FACTUS_USER || '',
    password: process.env.FACTUS_PASSWORD || '',
  });
  const resp = await fetch(`${BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.error_description || data.message || `Factus auth fallo (HTTP ${resp.status})`);
  }
  tokenCache = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiraEn: Date.now() + (Number(data.expires_in || 3600) - 60) * 1000, // 60s de margen
  };
  return tokenCache.accessToken;
}

// Devuelve un access_token valido, reutilizando el cache mientras no haya expirado.
export async function obtenerTokenFactus() {
  if (tokenCache && tokenCache.expiraEn > Date.now()) return tokenCache.accessToken;
  return solicitarToken();
}

// Llamada generica autenticada contra la API de Factus.
export async function factusFetch(path, { method = 'GET', body } = {}) {
  const token = await obtenerTokenFactus();
  const resp = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(data.message || `Factus respondio HTTP ${resp.status}`);
    err.detalle = data;
    err.status = resp.status;
    throw err;
  }
  return data;
}

// Verifica que las credenciales configuradas permitan autenticar contra Factus.
export async function probarConexionFactus() {
  await solicitarToken();
  return { ok: true, ambiente: BASE_URL };
}

// Mapa de tipo de documento local (Cliente.tipoDocumento) -> codigo DIAN (tabla 6).
const DOC_DIAN = { RC: '11', TI: '12', CC: '13', TE: '21', CE: '22', NIT: '31', PAS: '41', DIE: '42', PEP: '47', NUIP: '91' };
// Mapa de metodo de pago local -> codigo DIAN (tabla 25, forma de pago simplificada).
export async function cargarPagosFactura(factura, buscar = (where) => prisma.pago.findMany({
  where,
  select: { formaPago: true, monto: true },
})) {
  if (Array.isArray(factura.pagos)) return factura.pagos;
  return factura.id ? buscar({ facturaId: factura.id }) : [];
}

async function formasPagoFactura(factura, pagos) {
  const codigos = [...new Set([factura.metodoPago, ...pagos.map((pago) => pago.formaPago)])]
    .filter((codigo) => typeof codigo === 'string' && /^[A-Z0-9_-]{1,10}$/.test(codigo));
  return codigos.length ? prisma.formaPago.findMany({ where: { id: { in: codigos } }, select: { id: true, formaPagoDian: true } }) : [];
}

// Datos de "Consumidor Final" cuando la factura no tiene cliente asociado.
const CLIENTE_GENERICO = {
  identification_document_code: '13',
  identification: '222222222',
  legal_organization_code: '2',
  names: 'Consumidor Final',
  address: 'N/A',
  country_code: 'CO',
  municipality_code: '11001', // Bogota D.C. (Factus exige un municipio valido aunque sea generico)
};

// Convierte un Cliente local al objeto "customer" que exige Factus.
function mapearClienteFactus(cliente) {
  if (!cliente) return CLIENTE_GENERICO;
  const esJuridica = cliente.tipoCliente === 'JURIDICA';
  return {
    identification_document_code: DOC_DIAN[cliente.tipoDocumento] || '13',
    identification: (cliente.numeroDocumento || cliente.documento || '222222222').replace(/\D/g, '') || '222222222',
    legal_organization_code: esJuridica ? '1' : '2',
    tribute_code: cliente.responsableIVA ? '01' : 'ZZ',
    ...(esJuridica ? { company: cliente.razonSocial || cliente.nombre } : { names: cliente.nombre || cliente.razonSocial }),
    address: cliente.direccion || 'N/A',
    email: cliente.email || undefined,
    phone: cliente.telefono || undefined,
    country_code: 'CO',
    municipality_code: cliente.municipioCodigo || '11001', // Bogota D.C. si el cliente no tiene municipio cargado
  };
}

// Convierte las lineas de FacturaDetalle (con producto incluido) al array "items" de Factus.
export function mapearItemsFactus(detalle) {
  return detalle.map((d) => {
    const impuesto = d.producto?.impuesto;
    const tipo = String(impuesto?.tipo || '').toUpperCase();
    const cantidad = Number(d.cantidad) || 0;
    const total = Number(d.total);
    const iva = Number(d.iva) || 0;
    const tieneSnapshotImportes = Number.isFinite(total) && Number.isFinite(Number(d.iva)) && cantidad > 0;
    const baseLinea = total - iva;
    const precioBase = tieneSnapshotImportes ? baseLinea / cantidad : Number(d.precioUnitario) || 0;
    const porcentaje = tieneSnapshotImportes
      ? (baseLinea > 0 ? iva / baseLinea * 100 : 0)
      : Number(impuesto?.porcentaje ?? d.producto?.iva ?? 0);
    return {
      code_reference: d.productoCodigo || d.producto?.codigo || String(d.productoId || ''),
      name: d.productoNombre || d.producto?.nombre || 'Producto',
      quantity: cantidad.toFixed(2),
      discount_rate: '0.00',
      price: precioBase.toFixed(2),
      unit_measure_code: '94', // Unidad (generico; UnidadMedida local no trae codigo DIAN)
      standard_code: '1',
      taxes: [
        {
          code: impuesto?.codigoDIAN || (tipo === 'INC' ? '04' : '01'),
          rate: porcentaje.toFixed(6),
          is_excluded: !(porcentaje > 0),
        },
      ],
    };
  });
}

export function mapearPagosFactus(factura, pagosFactura, formas) {
  const total = Number(factura.total) || 0;
  const propina = Math.max(0, Number(factura.propina) || 0);
  const totalConPropina = total + propina;
  if (factura.credito) {
    return [
      {
        payment_form: '2',
        payment_method_code: codigoPagoDian(factura.metodoPago, formas),
        amount: total.toFixed(2),
        ...(factura.vence ? { due_date: new Date(factura.vence).toISOString().slice(0, 10) } : {}),
      },
      ...(propina > 0 ? [{
        payment_form: '1',
        payment_method_code: codigoPagoDian('EFE', formas),
        amount: propina.toFixed(2),
      }] : []),
    ];
  }

  const pagosRegistrados = pagosFactura.filter((pago) => Number(pago.monto) > 0);
  if (!pagosRegistrados.length) {
    return [{
      payment_form: '1',
      payment_method_code: codigoPagoDian(factura.metodoPago, formas),
      amount: totalConPropina.toFixed(2),
    }];
  }

  const sumaPagos = pagosRegistrados.reduce((suma, pago) => suma + Number(pago.monto), 0);
  let asignado = 0;
  return pagosRegistrados.map((pago, indice) => {
    const monto = indice === pagosRegistrados.length - 1
      ? totalConPropina - asignado
      : Math.round(totalConPropina * Number(pago.monto) / sumaPagos * 100) / 100;
    asignado += monto;
    return {
      payment_form: '1',
      payment_method_code: codigoPagoDian(pago.formaPago, formas),
      amount: monto.toFixed(2),
    };
  });
}

// Emite (crea y valida) una factura en Factus a partir de la Factura local ya creada
// (con cliente y detalle.producto incluidos). Lanza si la llamada falla.
export async function crearFacturaFactus(factura) {
  const pagosFactura = await cargarPagosFactura(factura);
  const formas = await formasPagoFactura(factura, pagosFactura);
  const referenceCode = `${factura.prefijo || 'FEV'}${factura.numeroFactura}`;
  const paymentDetails = mapearPagosFactus(factura, pagosFactura, formas);
  const payload = {
    reference_code: referenceCode,
    numbering_range_id: Number(process.env.FACTUS_NUMBERING_RANGE_FACTURA) || undefined,
    payment_details: paymentDetails,
    customer: mapearClienteFactus(factura.cliente),
    items: mapearItemsFactus(factura.detalle || []),
  };
  return factusFetch('/v2/bills/validate', { method: 'POST', body: payload });
}

// Emite una nota credito en Factus asociada a la factura ya reportada (factura.numeroFactus).
export async function crearNotaCreditoFactus({ nota, factura }) {
  const pagos = await cargarPagosFactura(factura);
  const referenceCode = `NC${nota.id.slice(0, 8)}`;
  const payload = {
    reference_code: referenceCode,
    correction_concept_code: '2', // Anulacion de la factura (motivo generico)
    numbering_range_id: Number(process.env.FACTUS_NUMBERING_RANGE_NOTA_CREDITO) || undefined,
    bill_number: factura.numeroFactus,
    observation: nota.motivo || undefined,
    payment_details: [{ payment_form: '1', payment_method_code: codigoPagoDian(factura.metodoPago, await formasPagoFactura(factura, pagos)), amount: Number(nota.total).toFixed(2) }],
    customer: mapearClienteFactus(factura.cliente),
    items: mapearItemsFactus(factura.detalle || []),
  };
  return factusFetch('/v2/credit-notes/validate', { method: 'POST', body: payload });
}

