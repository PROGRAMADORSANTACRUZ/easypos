// Lectura de basculas por puerto serie (COM).
// Casi todas las basculas de punto de venta envian el peso como texto ASCII, ya sea de
// forma continua o cuando se les pide con un comando. El lector generico extrae el numero,
// la unidad y si el peso esta estable; el formato continuo de Toledo (sin punto decimal y
// con palabras de estado) se interpreta aparte.
const { EventEmitter } = require('node:events');

const STX = '\x02';

// Comando que se envia para pedir el peso (null = la bascula lo manda sola).
const PERFILES = [
  { id: 'continuo', nombre: 'Continuo genérico (Toledo/Mettler, CAS, Torrey, Lexus, Excell…)', comando: null },
  { id: 'nci', nombre: 'NCI / Avery / Brecknell (W)', comando: 'W\r' },
  { id: 'enq', nombre: 'ENQ (Dibal, Epelsa, CAS ECR, Digi)', comando: '\x05' },
  { id: 'mt-sics', nombre: 'Mettler Toledo MT-SICS (SI)', comando: 'SI\r\n' },
  { id: 'ohaus', nombre: 'Ohaus (IP)', comando: 'IP\r\n' },
  { id: 'sartorius', nombre: 'Sartorius (ESC P)', comando: '\x1bP\r\n' },
  { id: 'p', nombre: 'Genérico P (Adam, A&D, otras)', comando: 'P\r\n' },
  { id: 'personalizado', nombre: 'Personalizado (comando propio)', comando: '' },
];

// Combinaciones de puerto mas comunes en basculas, de la mas a la menos probable.
const COMBINACIONES = [
  { baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1 },
  { baudRate: 9600, dataBits: 7, parity: 'even', stopBits: 1 },
  { baudRate: 4800, dataBits: 8, parity: 'none', stopBits: 1 },
  { baudRate: 4800, dataBits: 7, parity: 'even', stopBits: 1 },
  { baudRate: 2400, dataBits: 8, parity: 'none', stopBits: 1 },
  { baudRate: 2400, dataBits: 7, parity: 'even', stopBits: 1 },
  { baudRate: 19200, dataBits: 8, parity: 'none', stopBits: 1 },
  { baudRate: 1200, dataBits: 7, parity: 'even', stopBits: 1 },
];

const A_KG = { kg: 1, g: 0.001, lb: 0.45359237, oz: 0.028349523125 };

const redondear = (valor) => Math.round(valor * 1e6) / 1e6;

// Formato continuo Toledo: STX SWA SWB SWC + 6 digitos de peso + 6 de tara.
function parsearToledo(trama) {
  const inicio = trama.indexOf(STX);
  if (inicio < 0) return null;
  const m = /^\x02([\x20-\x7f])([\x20-\x7f])([\x20-\x7f])([ \d]{6})([ \d]{6})?/.exec(trama.slice(inicio));
  if (!m) return null;
  const swa = m[1].charCodeAt(0);
  const swb = m[2].charCodeAt(0);
  const digitos = Number(m[4].trim() || '0');
  // Bits 0-2 de SWA: posicion del punto decimal
  const escala = [100, 10, 1, 0.1, 0.01, 0.001, 0.0001, 0.00001][swa & 0b111];
  const valor = digitos * escala * (swb & 0b10 ? -1 : 1);
  const unidad = swb & 0b10000 ? 'kg' : 'lb';
  return {
    kg: redondear(valor * A_KG[unidad]),
    valor: redondear(valor),
    unidad,
    estable: !(swb & 0b1000),
    sobrecarga: Boolean(swb & 0b100),
    formato: 'toledo',
  };
}

function normalizarUnidad(texto) {
  const u = String(texto || '').toLowerCase();
  if (u === 'kg' || u === 'kgs') return 'kg';
  if (u === 'g' || u === 'gr' || u === 'grs') return 'g';
  if (u === 'lb' || u === 'lbs') return 'lb';
  if (u === 'oz') return 'oz';
  return null;
}

// Interpreta una trama de texto de cualquier bascula. Devuelve null si no hay un peso valido.
function parsearTrama(trama, { unidadPorDefecto = 'kg' } = {}) {
  if (typeof trama !== 'string' || !trama) return null;
  if (trama.includes(STX)) {
    const toledo = parsearToledo(trama);
    if (toledo) return toledo;
  }
  const texto = trama.replace(/[\x00-\x1f\x7f]/g, ' ').trim();
  if (!texto || texto.length > 80) return null;
  // Basura por velocidad equivocada: casi todo debe ser ASCII imprimible
  const imprimibles = texto.replace(/[^\x20-\x7e]/g, '').length;
  if (imprimibles / texto.length < 0.9) return null;
  if (/\b(OL|OVER|ERR|E\d+)\b|-{3,}/i.test(texto) && !/\d+[.,]\d+/.test(texto)) {
    return { kg: null, valor: null, unidad: null, estable: false, sobrecarga: true, formato: 'texto' };
  }

  const numero = /([+-]?)\s*(\d+(?:[.,]\d+)?)\s*(kgs?|grs?|g|lbs?|oz)?(?![a-z\d.,])/gi;
  let elegido = null;
  for (let m = numero.exec(texto); m; m = numero.exec(texto)) {
    const candidato = { signo: m[1], cifra: m[2], unidad: normalizarUnidad(m[3]) };
    // El peso es el primer numero con unidad; si ninguno la trae, el primero
    if (candidato.unidad) { elegido = candidato; break; }
    if (!elegido) elegido = candidato;
  }
  if (!elegido) return null;

  const unidad = elegido.unidad || unidadPorDefecto;
  const valor = Number(elegido.cifra.replace(',', '.')) * (elegido.signo === '-' ? -1 : 1);
  if (!Number.isFinite(valor)) return null;
  const inestable = /(^|[^A-Z])(US|MO|SD)([^A-Z]|$)/i.test(texto) // CAS/A&D: US, MO
    || /^S\s+D\b/.test(texto) // MT-SICS dinamico
    || /\?/.test(texto) // Ohaus/Sartorius
    || /\bmotion\b/i.test(texto);
  return {
    kg: redondear(valor * A_KG[unidad]),
    valor: redondear(valor),
    unidad,
    estable: !inestable,
    sobrecarga: false,
    formato: 'texto',
  };
}

// Separa el flujo del puerto en tramas (CR, LF o ETX). Devuelve [tramas, resto].
function separarTramas(buffer) {
  const partes = buffer.split(/\r\n|\r|\n|\x03/);
  const resto = partes.pop();
  return [partes.filter((parte) => parte.trim()), resto.length > 256 ? resto.slice(-256) : resto];
}

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Bascula extends EventEmitter {
  constructor({ SerialPort }) {
    super();
    this.SerialPort = SerialPort;
    this.puerto = null;
    this.config = null;
    this.ultima = null;
    this.ultimaTrama = '';
    this.error = null;
    this.buffer = '';
    this.timer = null;
  }

  estado() {
    return {
      conectada: Boolean(this.puerto?.isOpen),
      config: this.config,
      lectura: this.ultima,
      ultimaTrama: this.ultimaTrama,
      error: this.error,
    };
  }

  async conectar(config) {
    await this.desconectar();
    const limpia = {
      path: String(config.path || ''),
      baudRate: Number(config.baudRate) || 9600,
      dataBits: [7, 8].includes(Number(config.dataBits)) ? Number(config.dataBits) : 8,
      parity: ['none', 'even', 'odd'].includes(config.parity) ? config.parity : 'none',
      stopBits: Number(config.stopBits) === 2 ? 2 : 1,
      perfil: config.perfil || 'continuo',
      comando: typeof config.comando === 'string' ? config.comando : null,
      intervaloMs: Math.min(Math.max(Number(config.intervaloMs) || 300, 100), 5000),
      unidadPorDefecto: normalizarUnidad(config.unidadPorDefecto) || 'kg',
    };
    if (!limpia.path) throw new Error('Selecciona el puerto COM de la báscula.');
    this.config = limpia;
    this.error = null;
    this.ultima = null;
    this.buffer = '';
    const puerto = new this.SerialPort({
      path: limpia.path, baudRate: limpia.baudRate, dataBits: limpia.dataBits,
      parity: limpia.parity, stopBits: limpia.stopBits, autoOpen: false,
    });
    await new Promise((resolve, reject) => puerto.open((err) => (err ? reject(err) : resolve())));
    this.puerto = puerto;
    puerto.on('data', (datos) => this.recibir(datos));
    puerto.on('error', (err) => { this.error = err.message; this.emit('estado', this.estado()); });
    puerto.on('close', () => { if (this.puerto === puerto) { this.puerto = null; this.emit('estado', this.estado()); } });
    if (limpia.comando) {
      this.timer = setInterval(() => { if (puerto.isOpen) puerto.write(limpia.comando); }, limpia.intervaloMs);
    }
    this.emit('estado', this.estado());
    return this.estado();
  }

  recibir(datos) {
    const [tramas, resto] = separarTramas(this.buffer + datos.toString('latin1'));
    this.buffer = resto;
    for (const trama of tramas) {
      this.ultimaTrama = trama.replace(/[\x00-\x1f\x7f]/g, (c) => `<${c.charCodeAt(0).toString(16).padStart(2, '0')}>`);
      const lectura = parsearTrama(trama, { unidadPorDefecto: this.config?.unidadPorDefecto });
      if (!lectura) continue;
      this.ultima = { ...lectura, fecha: Date.now() };
      this.emit('peso', this.ultima);
    }
  }

  async desconectar() {
    clearInterval(this.timer);
    this.timer = null;
    const puerto = this.puerto;
    this.puerto = null;
    if (puerto?.isOpen) await new Promise((resolve) => puerto.close(() => resolve()));
    this.emit('estado', this.estado());
  }

  // Prueba puertos, velocidades y comandos hasta recibir dos pesos validos seguidos.
  async detectar({ puertos, progreso = () => {}, escucharMs = 800, respuestaMs = 500 } = {}) {
    await this.desconectar();
    const lista = puertos?.length ? puertos : (await this.SerialPort.list()).map((p) => p.path);
    if (!lista.length) throw new Error('No se encontró ningún puerto COM. Revisa el cable o el driver USB-serial.');
    const perfilesConComando = PERFILES.filter((perfil) => perfil.comando);
    for (const path of lista) {
      for (const combinacion of COMBINACIONES) {
        progreso(`${path} · ${combinacion.baudRate} baudios ${combinacion.dataBits}${combinacion.parity[0].toUpperCase()}${combinacion.stopBits}`);
        let puerto;
        try {
          puerto = new this.SerialPort({ path, ...combinacion, autoOpen: false });
          await new Promise((resolve, reject) => puerto.open((err) => (err ? reject(err) : resolve())));
        } catch {
          break; // puerto ocupado o inexistente: siguiente puerto
        }
        let buffer = '';
        let validas = 0;
        puerto.on('data', (datos) => {
          const [tramas, resto] = separarTramas(buffer + datos.toString('latin1'));
          buffer = resto;
          validas += tramas.filter((trama) => parsearTrama(trama)?.kg != null).length;
        });
        const encontrado = async (perfil) => {
          await new Promise((resolve) => puerto.close(() => resolve()));
          return this.conectar({ path, ...combinacion, perfil: perfil.id, comando: perfil.comando });
        };
        await esperar(escucharMs);
        if (validas >= 2) return encontrado(PERFILES[0]);
        for (const perfil of perfilesConComando) {
          validas = 0;
          buffer = '';
          puerto.write(perfil.comando);
          await esperar(respuestaMs);
          puerto.write(perfil.comando);
          await esperar(respuestaMs);
          if (validas >= 1) return encontrado(perfil);
        }
        await new Promise((resolve) => puerto.close(() => resolve()));
      }
    }
    throw new Error('No se detectó ninguna báscula. Revisa que esté encendida y conectada, o configúrala manualmente.');
  }
}

module.exports = { Bascula, PERFILES, COMBINACIONES, parsearTrama, separarTramas };
