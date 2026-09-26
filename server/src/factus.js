// Cliente para la API de Factus (proveedor tecnologico DIAN). OAuth2 password grant con cache de token.
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
const PAGO_DIAN = { EFECTIVO: '10', TARJETA: '48', TRANSFERENCIA: '42' };

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
function mapearItemsFactus(detalle) {
  return detalle.map((d) => ({
    code_reference: d.producto?.codigo || String(d.productoId),
    name: d.producto?.nombre || 'Producto',
    quantity: Number(d.cantidad).toFixed(2),
    discount_rate: '0.00',
    price: Number(d.precioUnitario).toFixed(2),
    unit_measure_code: '94', // Unidad (generico; UnidadMedida local no trae codigo DIAN)
    standard_code: '1',
    taxes: [
      { code: '01', rate: Number(d.producto?.iva || 0).toFixed(2), is_excluded: !(d.producto?.iva > 0) },
    ],
  }));
}

// Emite (crea y valida) una factura en Factus a partir de la Factura local ya creada
// (con cliente y detalle.producto incluidos). Lanza si la llamada falla.
export async function crearFacturaFactus(factura) {
  const referenceCode = `${factura.prefijo || 'FEV'}${factura.numeroFactura}`;
  const esCredito = !!factura.credito;
  const payload = {
    reference_code: referenceCode,
    numbering_range_id: Number(process.env.FACTUS_NUMBERING_RANGE_FACTURA) || undefined,
    payment_details: [{
      payment_form: esCredito ? '2' : '1',
      payment_method_code: PAGO_DIAN[factura.metodoPago] || '10',
      amount: Number(factura.total).toFixed(2),
      ...(esCredito && factura.vence ? { due_date: new Date(factura.vence).toISOString().slice(0, 10) } : {}),
    }],
    customer: mapearClienteFactus(factura.cliente),
    items: mapearItemsFactus(factura.detalle || []),
  };
  return factusFetch('/v2/bills/validate', { method: 'POST', body: payload });
}

// Emite una nota credito en Factus asociada a la factura ya reportada (factura.numeroFactus).
export async function crearNotaCreditoFactus({ nota, factura }) {
  const referenceCode = `NC${nota.id.slice(0, 8)}`;
  const payload = {
    reference_code: referenceCode,
    correction_concept_code: '2', // Anulacion de la factura (motivo generico)
    numbering_range_id: Number(process.env.FACTUS_NUMBERING_RANGE_NOTA_CREDITO) || undefined,
    bill_number: factura.numeroFactus,
    observation: nota.motivo || undefined,
    payment_details: [{ payment_form: '1', payment_method_code: PAGO_DIAN[factura.metodoPago] || '10', amount: Number(nota.total).toFixed(2) }],
    customer: mapearClienteFactus(factura.cliente),
    items: mapearItemsFactus(factura.detalle || []),
  };
  return factusFetch('/v2/credit-notes/validate', { method: 'POST', body: payload });
}

