import { esMedioEfectivo } from './pagosFactura.js';

const redondear = (valor) => Math.round((Number(valor) || 0) * 100) / 100;
const CLASES = ['efectivo', 'cheque', 'tarjetaCredito', 'tarjetaDebito', 'otros'];

// Columna del reporte a la que pertenece cada medio de pago.
export function claseMedio(id, formas = []) {
  const codigo = String(id || '').toUpperCase();
  if (esMedioEfectivo(codigo, formas)) return 'efectivo';
  if (['DAT', 'DTF'].includes(codigo)) return 'tarjetaCredito';
  if (codigo === 'DBO') return 'tarjetaDebito';
  const dian = String(formas.find((forma) => forma.id === codigo)?.formaPagoDian || '');
  if (codigo === 'CHE' || /^20(?:-|$)/.test(dian)) return 'cheque';
  return 'otros';
}

export function numeroDocumento(letra, companiaCodigo, centro, consecutivo) {
  const compania = String(companiaCodigo || '00').slice(-2).padStart(2, '0');
  return `${letra}${compania}-${centro || '000'}-${String(consecutivo).padStart(8, '0')}`;
}

function totalesPorClase(lineas, formas) {
  const totales = Object.fromEntries(CLASES.map((clase) => [clase, 0]));
  for (const linea of lineas) {
    const clase = claseMedio(linea.id, formas);
    totales[clase] = redondear(totales[clase] + (linea.valor || 0));
  }
  return totales;
}

// Saldo por medio de un cierre: usa el cuadre guardado y, en cierres antiguos, lo reconstruye con los pagos.
function cuadreDeCierre(apertura, pagos, recogidas, formas) {
  const guardados = Array.isArray(apertura.cuadreMedios?.medios) ? apertura.cuadreMedios.medios : null;
  if (guardados) {
    return guardados
      .filter((medio) => (medio.esperado || 0) !== 0 || (medio.contado || 0) !== 0)
      .map((medio) => ({
        id: medio.id, nombre: medio.nombre || medio.id,
        saldo: medio.esperado == null ? null : redondear(medio.esperado),
        fisico: medio.contado == null ? null : redondear(medio.contado),
        diferencia: medio.diferencia == null ? null : redondear(medio.diferencia),
      }));
  }
  const saldos = new Map();
  for (const pago of pagos) saldos.set(pago.formaPago, redondear((saldos.get(pago.formaPago) || 0) + pago.monto));
  const efectivo = [...saldos.keys()].find((id) => esMedioEfectivo(id, formas));
  if (efectivo) saldos.set(efectivo, redondear(saldos.get(efectivo) - recogidas));
  return [...saldos].map(([id, saldo]) => ({
    id, nombre: formas.find((forma) => forma.id === id)?.formaPago || id, saldo, fisico: null, diferencia: null,
  }));
}

/**
 * Arma los documentos de caja: E (recogida parcial) y G (cierre con todos los medios agrupados).
 * Los consecutivos se asignan en orden cronologico por letra, compania y centro.
 */
export function construirDocumentosCaja({ recogidas, aperturas, pagos, movimientos, formas, centros }) {
  const porApertura = new Map(aperturas.map((apertura) => [apertura.id, apertura]));
  const nombreMedio = (id) => formas.find((forma) => forma.id === id)?.formaPago || id;
  const documentos = [];

  for (const recogida of recogidas) {
    const apertura = porApertura.get(recogida.aperturaId);
    const cajero = recogida.usuario || apertura?.usuario;
    const monto = redondear(recogida.monto);
    documentos.push({
      letra: 'E', id: `E:${recogida.id}`, fecha: new Date(recogida.fecha), aperturaId: recogida.aperturaId,
      tipo: 'Recogida parcial', estado: 'Aprobado', cajero, caja: apertura?.caja?.nombre || 'Sin caja',
      adiciones: 0, recogidas: 0, otrosIngresos: 0, otrosEgresos: monto,
      ...totalesPorClase([{ id: 'EFE', valor: monto }], formas),
      conceptos: [{ concepto: 'REC_PAR', descripcion: 'RECOGIDA PARCIAL', debito: monto, credito: 0 }],
      medios: [{ medio: 'EFE', nombre: nombreMedio('EFE'), ingreso: 0, egreso: monto, referencia: recogida.motivo || '', documento: '' }],
      cuadre: [],
    });
  }

  for (const apertura of aperturas.filter((item) => item.estado === 'CERRADA' && item.fechaCierre)) {
    const pagosApertura = pagos.filter((pago) => pago.aperturaId === apertura.id);
    const movimientosApertura = movimientos.filter((movimiento) => movimiento.aperturaId === apertura.id);
    const sumaTipo = (tipo) => redondear(movimientosApertura.filter((m) => m.tipo === tipo).reduce((s, m) => s + m.monto, 0));
    const recogidasApertura = sumaTipo('RECOGIDA');
    const cuadre = cuadreDeCierre(apertura, pagosApertura, recogidasApertura, formas);
    const saldos = cuadre.map((medio) => ({ id: medio.id, valor: medio.saldo || 0 }));

    const conceptos = cuadre.filter((medio) => medio.saldo)
      .map((medio) => ({ concepto: medio.id, descripcion: medio.nombre, debito: medio.saldo, credito: 0 }));
    const faltantes = cuadre.filter((medio) => medio.diferencia < 0);
    const sobrantes = cuadre.filter((medio) => medio.diferencia > 0);
    for (const medio of faltantes) conceptos.push({ concepto: medio.id, descripcion: medio.nombre, debito: 0, credito: -medio.diferencia });
    if (faltantes.length) {
      conceptos.push({ concepto: 'FAL', descripcion: 'FALTANTE', debito: redondear(faltantes.reduce((s, m) => s - m.diferencia, 0)), credito: 0 });
    }
    for (const medio of sobrantes) conceptos.push({ concepto: medio.id, descripcion: medio.nombre, debito: medio.diferencia, credito: 0 });
    if (sobrantes.length) {
      conceptos.push({ concepto: 'SOB', descripcion: 'SOBRANTE', debito: 0, credito: redondear(sobrantes.reduce((s, m) => s + m.diferencia, 0)) });
    }

    // El efectivo se recoge en una sola linea; los demas medios se detallan por cada pago.
    const efectivo = cuadre.filter((medio) => esMedioEfectivo(medio.id, formas) && medio.saldo);
    const medios = [
      ...efectivo.map((medio) => ({ medio: medio.id, nombre: medio.nombre, ingreso: 0, egreso: medio.saldo, referencia: '', documento: '' })),
      ...pagosApertura.filter((pago) => !esMedioEfectivo(pago.formaPago, formas)).map((pago) => ({
        medio: pago.formaPago, nombre: nombreMedio(pago.formaPago), ingreso: 0, egreso: redondear(pago.monto),
        referencia: pago.formaPago === 'AJP' ? 'Redondeo documento' : pago.referencia || '', documento: pago.documento || '',
      })),
    ];

    documentos.push({
      letra: 'G', id: `G:${apertura.id}`, fecha: new Date(apertura.fechaCierre), aperturaId: apertura.id,
      tipo: 'Cierre de caja', estado: 'Aprobado', cajero: apertura.usuario, caja: apertura.caja?.nombre || 'Sin caja',
      adiciones: 0, recogidas: redondear(saldos.reduce((s, m) => s + m.valor, 0)),
      otrosIngresos: sumaTipo('INGRESO'), otrosEgresos: sumaTipo('EGRESO'),
      ...totalesPorClase(saldos, formas),
      conceptos, medios,
      cuadre: cuadre.map((medio) => ({ medio: medio.id, nombre: medio.nombre, saldo: medio.saldo, fisico: medio.fisico, diferencia: medio.diferencia })),
    });
  }

  const contadores = new Map();
  return documentos
    .sort((a, b) => a.fecha - b.fecha || a.letra.localeCompare(b.letra) || a.id.localeCompare(b.id))
    .map((documento) => {
      const centro = centros.get(documento.aperturaId) || { compania: '', centro: '' };
      const clave = `${documento.letra}|${centro.compania}|${centro.centro}`;
      const consecutivo = (contadores.get(clave) || 0) + 1;
      contadores.set(clave, consecutivo);
      const { cajero, ...resto } = documento;
      return {
        ...resto,
        centro: centro.centro || '',
        compania: centro.compania || '',
        documento: numeroDocumento(documento.letra, centro.compania, centro.centro, consecutivo),
        tercero: cajero?.usuario || '',
        cajero: cajero?.nombre || 'Sin cajero',
      };
    });
}
