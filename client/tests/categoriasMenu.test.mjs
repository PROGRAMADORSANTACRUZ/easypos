import assert from 'node:assert/strict';
import test from 'node:test';
import { categoriasOrdenadas } from '../src/categoriasMenu.js';

const producto = (nombre, categoria) => ({ nombre, categoria });

test('las categorias del menu siguen el orden de su codigo y no el del producto ni el alfabetico', () => {
  const productos = [
    producto('1/2 POLLO', { nombre: 'SANTA PARRILLA', codigo: '01' }),
    producto('ACHIRAS', { nombre: 'ENTRADAS', codigo: '10' }),
    producto('AGUA', { nombre: 'BEBIDAS', codigo: '2' }),
    producto('CAFE', { nombre: 'COFFEE', codigo: '06' }),
    producto('SOPA', { nombre: 'SANCOCHOS', codigo: '03' }),
  ];
  assert.deepEqual(categoriasOrdenadas(productos), ['SANTA PARRILLA', 'BEBIDAS', 'SANCOCHOS', 'COFFEE', 'ENTRADAS']);
});

test('sin categoria y las categorias sin codigo quedan al final', () => {
  const productos = [
    producto('A', null),
    producto('B', { nombre: 'SIN CODIGO', codigo: null }),
    producto('C', { nombre: 'ENTRADAS', codigo: '02' }),
    producto('D', { nombre: 'ADICIONALES', codigo: '01' }),
    producto('E', { nombre: 'ENTRADAS', codigo: '02' }),
  ];
  assert.deepEqual(categoriasOrdenadas(productos), ['ADICIONALES', 'ENTRADAS', 'SIN CODIGO', 'Sin categoría']);
});
