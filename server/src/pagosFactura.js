const formatoImporte = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 0, maximumFractionDigits: 2,
});

export const camposMetodoPago = ['metodoPago1', 'metodoPago2', 'metodoPago3', 'metodoPago4'];

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
      return {
        metodo: texto.replace(/\s*\$?\s*[0-9.,]+\s*$/, '').trim().toUpperCase() || 'OTRO',
        monto: Number(texto.replace(/[^0-9,]/g, '').replace(',', '.')) || 0,
      };
    });
    const totalPagos = partes.reduce((suma, parte) => suma + parte.monto, 0);
    if (propina && Math.abs(totalPagos - (factura.total || 0)) < 0.01) {
      const efectivo = partes.find((parte) => /^efectivo/i.test(parte.metodo));
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
    resultado[camposMetodoPago[indice]] = `${metodo} $${formatoImporte.format(monto / 100)}`;
  });
  return resultado;
}