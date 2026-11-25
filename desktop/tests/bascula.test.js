const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const { Bascula, parsearTrama, separarTramas } = require('../bascula.js');

test('interpreta las tramas de los protocolos de bascula mas comunes', () => {
  const casos = [
    ['ST,GS,+  1.234kg', 1.234, true], // CAS / A&D estable
    ['US,GS,+  0.850kg', 0.85, false], // CAS / A&D en movimiento
    ['S S      2.500 kg', 2.5, true], // Mettler MT-SICS
    ['S D      2.480 kg', 2.48, false],
    ['    1.250 kg ?', 1.25, false], // Ohaus inestable
    ['N     +   750.0 g  ', 0.75, true], // Sartorius en gramos
    ['  2.20 lb', 0.997903, true], // libras a kg
    ['0001,500', 1.5, true], // sin unidad y coma decimal: kg por defecto
    ['W -0.120kg', -0.12, true],
  ];
  for (const [trama, kg, estable] of casos) {
    const lectura = parsearTrama(trama);
    assert.equal(lectura?.kg, kg, trama);
    assert.equal(lectura.estable, estable, trama);
  }
});

test('interpreta el formato continuo de Toledo con punto decimal y estado en bits', () => {
  // SWA 0x25 -> 3 decimales (X.XXX); SWB 0x30 -> kg, estable, positivo
  assert.deepEqual(
    { ...parsearTrama('\x02%0 001234000000'), formato: undefined },
    { kg: 1.234, valor: 1.234, unidad: 'kg', estable: true, sobrecarga: false, formato: undefined },
  );
  // SWB 0x3A -> negativo y en movimiento
  const movimiento = parsearTrama('\x02%: 000500000000');
  assert.equal(movimiento.kg, -0.5);
  assert.equal(movimiento.estable, false);
});

test('descarta basura de una velocidad equivocada y marca sobrecarga', () => {
  assert.equal(parsearTrama('\xfe\xf8\x80\xe0\xfc\x9e'), null);
  assert.equal(parsearTrama(''), null);
  assert.equal(parsearTrama('ABC'), null);
  assert.equal(parsearTrama('OL,GS,+ ------kg').sobrecarga, true);
});

test('separa tramas por CR, LF o ETX y conserva la trama incompleta', () => {
  assert.deepEqual(separarTramas('1.0kg\r\n2.0kg\x033.0'), [['1.0kg', '2.0kg'], '3.0']);
});

class PuertoFalso extends EventEmitter {
  static instancias = [];
  static responde = () => null;
  static list = async () => [{ path: 'COM1' }, { path: 'COM3' }];
  constructor(opciones) {
    super();
    Object.assign(this, opciones);
    this.isOpen = false;
    this.escrito = [];
    PuertoFalso.instancias.push(this);
  }
  open(cb) { this.isOpen = true; cb(null); }
  close(cb) { this.isOpen = false; cb?.(); }
  write(datos) {
    this.escrito.push(datos);
    const respuesta = PuertoFalso.responde(this, datos);
    if (respuesta) setImmediate(() => this.emit('data', Buffer.from(respuesta, 'latin1')));
  }
}

test('detecta el puerto, la velocidad y el comando de una bascula que responde a W', async () => {
  PuertoFalso.instancias = [];
  PuertoFalso.responde = (puerto, datos) => (puerto.path === 'COM3' && puerto.baudRate === 4800
    && puerto.dataBits === 7 && datos === 'W\r' ? '  1.500 kg\r' : null);
  const bascula = new Bascula({ SerialPort: PuertoFalso });
  const pesos = [];
  bascula.on('peso', (lectura) => pesos.push(lectura.kg));
  const estado = await bascula.detectar({ escucharMs: 5, respuestaMs: 5 });
  assert.equal(estado.config.path, 'COM3');
  assert.equal(estado.config.baudRate, 4800);
  assert.equal(estado.config.perfil, 'nci');
  assert.equal(estado.conectada, true);
  // Ya conectada, sigue pidiendo el peso cada intervalo
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.ok(pesos.includes(1.5));
  await bascula.desconectar();
  assert.ok(PuertoFalso.instancias.filter((p) => p !== PuertoFalso.instancias.at(-1)).every((p) => !p.isOpen));
});

test('detecta una bascula de envio continuo sin enviarle comandos', async () => {
  PuertoFalso.instancias = [];
  PuertoFalso.responde = () => null;
  const original = PuertoFalso.prototype.open;
  PuertoFalso.prototype.open = function abrir(cb) {
    this.isOpen = true;
    if (this.path === 'COM1' && this.baudRate === 9600 && this.dataBits === 8) {
      this.emit('data', Buffer.from('ST,GS,+  0.750kg\r\nST,GS,+  0.750kg\r\n', 'latin1'));
      setImmediate(() => this.emit('data', Buffer.from('ST,GS,+  0.750kg\r\nST,GS,+  0.750kg\r\n', 'latin1')));
    }
    cb(null);
  };
  try {
    const bascula = new Bascula({ SerialPort: PuertoFalso });
    const estado = await bascula.detectar({ escucharMs: 20, respuestaMs: 5 });
    assert.equal(estado.config.path, 'COM1');
    assert.equal(estado.config.perfil, 'continuo');
    assert.equal(estado.config.comando, null);
    await bascula.desconectar();
  } finally {
    PuertoFalso.prototype.open = original;
  }
});

test('avisa cuando no encuentra ninguna bascula', async () => {
  PuertoFalso.responde = () => null;
  const bascula = new Bascula({ SerialPort: PuertoFalso });
  await assert.rejects(bascula.detectar({ escucharMs: 1, respuestaMs: 1 }), /No se detectó ninguna báscula/);
});
