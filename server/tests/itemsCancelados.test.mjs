import assert from 'node:assert/strict';
import test from 'node:test';
import { itemsCanceladosDeEventos } from '../src/historialPedidos.js';

test('reconstruye los productos cancelados desde el historial del pedido', () => {
  const lechona = { id: 1, nombre: 'LECHONA', cantidad: 2, precioUnit: 22000, notas: 'sin picante' };
  const ensalada = { id: 2, nombre: 'ENSALADA', cantidad: 1, precioUnit: 8000, notas: null };
  const eventos = [
    { fecha: '2026-11-16T20:00:00Z', usuarioNombre: 'ADMIN', antes: { items: [lechona, ensalada] }, despues: { items: [ensalada] } },
    { fecha: '2026-11-16T20:05:00Z', usuarioNombre: 'CAJERO', antes: { items: [ensalada] }, despues: { items: [] } },
  ];
  assert.deepEqual(itemsCanceladosDeEventos(eventos), [
    { ...lechona, fecha: '2026-11-16T20:00:00Z', usuarioNombre: 'ADMIN' },
    { ...ensalada, fecha: '2026-11-16T20:05:00Z', usuarioNombre: 'CAJERO' },
  ]);
  assert.deepEqual(itemsCanceladosDeEventos([{ fecha: 'x', usuarioNombre: 'A', antes: null, despues: { items: [ensalada] } }]), []);
});
