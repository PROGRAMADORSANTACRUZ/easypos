const formatoImporte = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0, maximumFractionDigits: 2,
});

export const camposMetodoPago = ['metodoPago1', 'metodoPago2', 'metodoPago3', 'metodoPago4'];
export const camposValorPago = ['valor1', 'valor2', 'valor3', 'valor4'];

export function esMedioEfectivo(codigo, formas = []) {
  const metodo = String(codigo || '').trim().toUpperCase();
  return metodo === 'EFE' || /^EFECTIVO(?:\s|$)/.test(metodo)
    || formas.some((forma) => forma.id === metodo && /^10(?:-|$)/.test(forma.formaPagoDian || ''));
}

export function codigoPagoDian(codigo, formas = []) {
  const metodo = String(codigo || '').trim().toUpperCase();
  const forma = formas.find((registro) => registro.id === metodo);
  const configurado = String(forma?.formaPagoDian || '').match(/^(\d{1,3})(?:-|$)/)?.[1];
  return configurado || {
    EFECTIVO: '10', TARJETA: '48', TRANSFERENCIA: '42',
    EFE: '10', DAT: '48', DTF: '48', PSE: '42', QR: '42', TRE: '42', TRH: '42', DOM: 'ZZZ',
  }[metodo] || (forma ? 'ZZZ' : '10');
}

export async function validarPagosActivos(tx, pagos, factura) {
  if (!Array.isArray(pagos) || !pagos.length || pagos.some((pago) => !pago
    || typeof pago.formaPago !== 'string' || !/^[A-Z0-9_-]{1,10}$/.test(pago.formaPago)
    || !Number.isFinite(Number(pago.monto)) || Number(pago.monto) <= 0)) {
    throw Object.assign(new Error('Selecciona medios de pago activos y montos positivos.'), { status: 400 });
  }
  const codigos = [...new Set(pagos.map((pago) => pago.formaPago))].sort();
  const formas = await tx.$queryRaw`SELECT "CptoCaja" AS "id", "Activo" AS "activo" FROM "FormasPago"
    WHERE "CptoCaja" = ANY(${codigos}::text[]) ORDER BY "CptoCaja" FOR SHARE`;
  for (const codigo of codigos) {
    if (!formas.some((forma) => forma.id === codigo && forma.activo === true)) {
      throw Object.assign(new Error(`El medio de pago ${codigo} no existe o está inactivo. Actualiza los medios de pago.`), { status: 400 });
    }
  }
  if (factura) separarMetodosPago(factura, pagos);
}

export function separarValoresPago(metodos) {
  const resultado = {};
  camposMetodoPago.forEach((campo, indice) => {
    const texto = String(metodos[campo] ?? '0').trim().replace(/[\u00a0\u202f]/g, ' ');
    if (texto === '0') {
      resultado[campo] = '0';
      resultado[camposValorPago[indice]] = 0;
      return;
    }
    const coincidencia = texto.match(/^(.+?)\s+\$\s*((?:[0-9]{1,3}(?:\.[0-9]{3})+|[0-9]+)(?:,[0-9]{1,2})?)$/);
    if (!coincidencia) {
      throw Object.assign(new Error('El medio de pago debe incluir un importe verificable antes de separarlo.'), { status: 400 });
    }
    const centavos = Math.round(Number(coincidencia[2].replaceAll('.', '').replace(',', '.')) * 100);
    if (!Number.isSafeInteger(centavos) || centavos <= 0) {
      throw Object.assign(new Error('El importe de cada medio debe ser positivo y conservar precision de centavos.'), { status: 400 });
    }
    resultado[campo] = coincidencia[1].trim().toUpperCase();
    resultado[camposValorPago[indice]] = centavos / 100;
  });
  return resultado;
}

export function desglosarFactura(factura) {
  const metodo = String(factura.metodoPago || '').trim();
  const propina = factura.propina || 0;
  if (factura.credito) {
    const partes = [{ metodo: 'CR\u00c9DITO', monto: factura.total || 0 }];
    if (propina) partes.push({ metodo: 'EFECTIVO', monto: propina });
    return partes;
  }
  if (metodo.includes(' + ')) {
    const partes = metodo.split(' + ').map((parte) => {
      const texto = parte.trim();
      const importe = texto.match(/^(.+?)\s+\$?\s*((?:[0-9]{1,3}(?:\.[0-9]{3})+|[0-9]+)(?:,[0-9]{1,2})?)$/);
      return {
        metodo: (importe?.[1] || texto).trim().toUpperCase() || 'OTRO',
        monto: importe ? Number(importe[2].replaceAll('.', '').replace(',', '.')) : 0,
      };
    });
    const totalPagos = partes.reduce((suma, parte) => suma + parte.monto, 0);
    if (propina && Math.abs(totalPagos - (factura.total || 0)) < 0.01) {
      const efectivo = partes.find((parte) => esMedioEfectivo(parte.metodo));
      if (efectivo) efectivo.monto += propina;
      else partes.push({ metodo: 'EFECTIVO', monto: propina });
    }
    return partes;
  }
  return [{ metodo: (metodo || 'OTRO').toUpperCase(), monto: (factura.total || 0) + propina }];
}

export function separarMetodosPago(factura, pagos = [], { conservarImportesRegistrados = false } = {}) {
  const resultado = Object.fromEntries(camposMetodoPago.map((campo) => [campo, '0']));
  const centavos = (valor) => Math.round(Number(valor || 0) * 100);
  const esperado = centavos(factura.credito ? factura.propina : Number(factura.total || 0) + Number(factura.propina || 0));
  const partes = pagos.length && !factura.credito
    ? pagos.map((pago) => ({ metodo: pago.formaPago, monto: pago.monto }))
    : desglosarFactura(factura).filter((parte) => parte.metodo !== 'CR\u00c9DITO');
  if (!esperado && factura.credito) return resultado;
  const agrupados = new Map();
  for (const parte of partes) {
    const metodo = String(parte.metodo || '').trim().toUpperCase();
    const monto = centavos(parte.monto);
    if (!metodo || metodo === '0' || !Number.isSafeInteger(monto) || monto <= 0) {
      throw Object.assign(new Error('Cada pago requiere un medio y un importe positivo valido.'), { status: 400 });
    }
    agrupados.set(metodo, (agrupados.get(metodo) || 0) + monto);
  }
  if (agrupados.size > camposMetodoPago.length) {
    throw Object.assign(new Error('La factura admite hasta cuatro medios de pago distintos.'), { status: 400 });
  }
  if (!conservarImportesRegistrados && [...agrupados.values()].reduce((suma, monto) => suma + monto, 0) !== esperado) {
    throw Object.assign(new Error('Los medios de pago deben cubrir exactamente el total mas la propina.'), { status: 400 });
  }
  [...agrupados.entries()].forEach(([metodo, monto], indice) => {
    const importe = formatoImporte.formatToParts(monto / 100).map((parte) => {
      if (parte.type === 'group') return '.';
      if (parte.type === 'decimal') return ',';
      return parte.value;
    }).join('');
    resultado[camposMetodoPago[indice]] = `${metodo} $${importe}`;
  });
  return resultado;
}