import assert from 'node:assert/strict';
import test from 'node:test';
import { horaReservable, mesaDisponible, turnosDelDia, validarSolicitudReserva } from '../src/reservasNucleo.js';

const ahora = new Date('2026-11-23T17:10:00Z'); // 12:10 p. m. en Colombia

test('los turnos van de 12:00 a 21:00 cada 30 minutos y no se puede reservar en el pasado', () => {
  const turnos = turnosDelDia();
  assert.deepEqual([turnos[0], turnos[1], turnos.at(-1), turnos.length], ['12:00', '12:30', '21:00', 19]);
  assert.equal(horaReservable('2026-11-23', '12:00', ahora), false);
  assert.equal(horaReservable('2026-11-23', '12:30', ahora), true);
  assert.equal(horaReservable('2026-11-23', '12:15', ahora), false);
  assert.equal(horaReservable('2026-11-22', '18:00', ahora), false);
});

test('una mesa reservada de 1:00 a 2:00 bloquea los turnos que se cruzan con esa hora', () => {
  const mesa = { id: 4, estado: 'LIBRE', esFantasma: false };
  const reservas = [{ mesaId: 4, estado: 'CONFIRMADA', fechaHora: new Date('2026-11-24T18:00:00Z'), duracionMin: 60 }];
  const turno = (hora) => new Date(`2026-11-24T${hora}:00-05:00`);
  assert.equal(mesaDisponible(mesa, reservas, turno('12:00'), ahora), true);
  assert.equal(mesaDisponible(mesa, reservas, turno('12:30'), ahora), false);
  assert.equal(mesaDisponible(mesa, reservas, turno('13:30'), ahora), false);
  assert.equal(mesaDisponible(mesa, reservas, turno('14:00'), ahora), true);
  assert.equal(mesaDisponible({ ...mesa, id: 5 }, reservas, turno('13:00'), ahora), true);
  assert.equal(mesaDisponible(mesa, [{ ...reservas[0], estado: 'CANCELADA' }], turno('13:00'), ahora), true);
});

test('una mesa ocupada en el salon no se puede reservar para la proxima hora', () => {
  const mesa = { id: 1, estado: 'OCUPADA', esFantasma: false };
  assert.equal(mesaDisponible(mesa, [], new Date('2026-11-23T12:30:00-05:00'), ahora), false);
  assert.equal(mesaDisponible(mesa, [], new Date('2026-11-23T14:00:00-05:00'), ahora), true);
});

test('la solicitud exige datos de contacto y aceptar las politicas', () => {
  const base = {
    personas: 2, fecha: '2026-11-24', hora: '13:30', mesaId: 4, nombre: ' isaac  jose ',
    celular: '300 568 2955', email: 'Sistemas@Gmail.com', aceptaPoliticas: true,
  };
  const { datos } = validarSolicitudReserva(base, ahora);
  assert.equal(datos.nombre, 'ISAAC JOSE');
  assert.equal(datos.celular, '3005682955');
  assert.equal(datos.email, 'sistemas@gmail.com');
  assert.equal(datos.fechaHora.toISOString(), '2026-11-24T18:30:00.000Z');
  assert.match(validarSolicitudReserva({ ...base, aceptaPoliticas: false }, ahora).error, /políticas/);
  assert.match(validarSolicitudReserva({ ...base, email: 'malo' }, ahora).error, /correo/);
  assert.match(validarSolicitudReserva({ ...base, hora: '11:00' }, ahora).error, /hora/);
});
