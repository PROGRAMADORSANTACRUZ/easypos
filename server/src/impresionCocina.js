// Impresion de comandas de cocina via ESC/POS por red (TCP raw, puerto 9100 tipico).
// Cada categoria puede tener su propia impresora (estacion): asi la bebida sale en el
// bar y el sancocho en cocina, sin depender del navegador ni de un dialogo de impresion.
import { Socket } from 'node:net';
import { fechaHoraColombia } from './fechaColombia.js';

const ESC = '\x1b';
const GS = '\x1d';
const INIT = ESC + '@';
// Tabla de caracteres WPC1252 (ESC t 16): con ella salen bien la Ñ y las tildes
const TABLA_LATINA = ESC + 't' + '\x10';
const BOLD_ON = ESC + 'E' + '\x01';
const BOLD_OFF = ESC + 'E' + '\x00';
const CENTRO = ESC + 'a' + '\x01';
const IZQUIERDA = ESC + 'a' + '\x00';
const DOBLE_ALTO = GS + '!' + '\x11';
const SOLO_ALTO = GS + '!' + '\x01'; // doble alto sin ensanchar: las 48 columnas se conservan
const NORMAL = GS + '!' + '\x00';
const CORTE = GS + 'V' + '\x41' + '\x00';
const SALTO = '\n';
// Papel de 80 mm con la fuente normal: 48 caracteres por linea
export const COLUMNAS = 48;
const LINEA = '-'.repeat(COLUMNAS);

// Parte un texto en lineas de `ancho` columnas sin cortar palabras (salvo una mas larga que la linea);
// las lineas siguientes llevan la sangria indicada.
function envolver(texto, ancho, sangria = '') {
  const lineas = [];
  let actual = '';
  for (const palabra of String(texto).split(/\s+/).filter(Boolean)) {
    const candidata = actual ? `${actual} ${palabra}` : `${lineas.length ? sangria : ''}${palabra}`;
    if (candidata.length <= ancho) {
      actual = candidata;
      continue;
    }
    if (actual) lineas.push(actual);
    let resto = `${lineas.length ? sangria : ''}${palabra}`;
    while (resto.length > ancho) {
      lineas.push(resto.slice(0, ancho));
      resto = sangria + resto.slice(ancho);
    }
    actual = resto;
  }
  if (actual) lineas.push(actual);
  return lineas;
}

// Texto a la izquierda y a la derecha en la misma linea
function extremos(izquierda, derecha) {
  const espacio = COLUMNAS - izquierda.length - derecha.length;
  return espacio >= 1 ? izquierda + ' '.repeat(espacio) + derecha : `${izquierda}${SALTO}${derecha}`;
}

// Arma el texto plano (ESC/POS) de un ticket para una estacion con solo sus items, a 80 mm.
function construirTicket({ estacion, mesa, mesera, pedidoId, items, notasGenerales, observaciones, fecha = new Date() }) {
  let t = INIT + TABLA_LATINA + CENTRO + DOBLE_ALTO + BOLD_ON + (estacion || 'COCINA') + BOLD_OFF + NORMAL + SALTO;
  t += IZQUIERDA + LINEA + SALTO;
  t += BOLD_ON + extremos(`Mesa: ${mesa ?? '-'}`, `Pedido #${pedidoId}`) + BOLD_OFF + SALTO;
  t += envolver(`Mesera: ${mesera ?? '-'}`, COLUMNAS).join(SALTO) + SALTO;
  t += `Fecha: ${fechaHoraColombia(fecha)}` + SALTO;
  t += LINEA + SALTO;
  for (const it of items) {
    t += SOLO_ALTO + BOLD_ON + envolver(`${it.cantidad}x ${(it.nombre || '').toUpperCase()}`, COLUMNAS, '   ').join(SALTO) + BOLD_OFF + NORMAL + SALTO;
    if (it.notas) t += envolver(`(${it.notas})`, COLUMNAS - 3).map((l) => `   ${l}`).join(SALTO) + SALTO;
  }
  t += LINEA + SALTO;
  if (observaciones) t += BOLD_ON + envolver(`Obs: ${observaciones}`, COLUMNAS).join(SALTO) + BOLD_OFF + SALTO;
  if (notasGenerales) t += envolver(`Cambios: ${notasGenerales}`, COLUMNAS).join(SALTO) + SALTO;
  t += SALTO + SALTO + SALTO + CORTE;
  return t;
}

// Envia el texto crudo a la impresora por TCP. No lanza si falla (la cocina no debe
// bloquear el pedido); solo registra el error en consola.
function enviarAImpresora(ip, puerto, contenido) {
  return new Promise((resolve) => {
    const socket = new Socket();
    const terminar = (err) => {
      if (err) console.error(`[impresion] Error enviando a ${ip}:${puerto} ->`, err.message);
      socket.destroy();
      resolve();
    };
    socket.setTimeout(4000);
    socket.once('error', terminar);
    socket.once('timeout', () => terminar(new Error('timeout')));
    socket.connect(puerto, ip, () => {
      socket.write(Buffer.from(contenido, 'binary'), () => terminar());
    });
  });
}

// Agrupa los items del pedido por la impresora de su categoria y arma un ticket ESC/POS por estacion
// (cocina, bar, postres, etc). Items sin categoria/impresora se ignoran.
// pedido: { id, mesa, mesera, cambios }, items: [{ cantidad, notas, producto: { nombre, categoria } }]
// Devuelve [{ ip, puerto, estacion, datos }] con `datos` en base64, listo para enviar por TCP.
export function ticketsComanda(pedido, items) {
  const grupos = new Map(); // "ip:puerto" -> { ip, puerto, estacion, items: [] }
  for (const it of items) {
    const cat = it.producto?.categoria;
    if (!cat?.impresoraIp) continue;
    const puerto = cat.impresoraPuerto || 9100;
    const clave = `${cat.impresoraIp}:${puerto}`;
    if (!grupos.has(clave)) grupos.set(clave, { ip: cat.impresoraIp, puerto, estacion: cat.nombre, items: [] });
    grupos.get(clave).items.push({ cantidad: it.cantidad, notas: it.notas, nombre: it.producto?.nombre });
  }
  return [...grupos.values()].map((grupo) => ({
    ip: grupo.ip,
    puerto: grupo.puerto,
    estacion: grupo.estacion,
    datos: Buffer.from(construirTicket({
      estacion: grupo.estacion,
      mesa: pedido.mesa?.numero ?? (pedido.tipo === 'DOMICILIO' ? 'DOMICILIO' : null),
      mesera: pedido.mesera?.nombre,
      pedidoId: pedido.id,
      items: grupo.items,
      notasGenerales: pedido.cambios,
      observaciones: pedido.observaciones,
    }), 'binary').toString('base64'),
  }));
}

// Con el servidor en la nube las impresoras (IP privada del local) no son alcanzables: las comandas las envia el
// dispositivo que tomo el pedido (APK o app de escritorio, que si estan en la red del local). El servidor solo las
// envia el mismo si IMPRESION_COMANDAS_SERVIDOR=true (instalacion con el servidor dentro del local).
export const imprimeElServidor = (env = process.env) => String(env.IMPRESION_COMANDAS_SERVIDOR || '').toLowerCase() === 'true';

// Arma las comandas, las envia desde el servidor si corresponde y las devuelve para que las imprima el dispositivo.
export function prepararComandas(pedido, items, { env = process.env, enviar = enviarAImpresora } = {}) {
  const tickets = ticketsComanda(pedido, items);
  if (imprimeElServidor(env)) {
    for (const t of tickets) enviar(t.ip, t.puerto, Buffer.from(t.datos, 'base64').toString('binary')).catch(() => {});
    return [];
  }
  return tickets;
}

export async function imprimirComandaPorEstacion(pedido, items) {
  await Promise.all(ticketsComanda(pedido, items)
    .map((t) => enviarAImpresora(t.ip, t.puerto, Buffer.from(t.datos, 'base64').toString('binary'))));
}
