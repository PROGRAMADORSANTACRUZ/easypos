export const fechaHoraColombia = (fecha) => new Date(fecha).toLocaleString('es-CO', { timeZone: 'America/Bogota' });

export const notaMovimientos = 'Los movimientos no registran centro, documento, estado de aprobación, tercero, medio de pago ni clasificación como adición u otros ingresos/egresos. Las recogidas parciales sí se identifican.';
export const columnasMovimientos = [
  'C.O.', 'Nro documento', 'Fecha', 'Estado', 'Nombre cajero', 'Caja', 'Tipo', 'Valor registrado',
  'Adiciones', 'Recogidas', 'Otros ingresos', 'Otros egresos', 'Efectivo', 'Cheque', 'Tarjeta crédito',
  'Tarjeta débito', 'Otros', 'Tercero', 'Razón social tercero', 'Motivo', 'Referencia movimiento',
];

const dineroMovimiento = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 });
export const filaMovimiento = (fila) => [
  'No disponible', 'No disponible', fechaHoraColombia(fila.fecha), 'No disponible', fila.cajero, fila.caja,
  fila.tipo, dineroMovimiento.format(fila.monto), 'No disponible',
  dineroMovimiento.format(fila.tipo === 'RECOGIDA' ? fila.monto : 0), ...Array(9).fill('No disponible'), fila.motivo, fila.id,
];
