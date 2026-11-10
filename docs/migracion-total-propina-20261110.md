# Total de factura con propina

## Contrato de importes

En las tablas fisicas `Factura` y `FacturaVenta`:

- `TotalConsumo` conserva el importe anterior de `Total`, sin propina.
- `Propina` conserva su desglose original.
- `Total` es `round(TotalConsumo + Propina, 2)`.

Por ejemplo: consumo 406000 y propina 5000 producen `Total = 411000`.
Los triggers y un CHECK mantienen esta regla en inserciones y actualizaciones,
incluso si se intenta escribir directamente otro valor en `Total`.
Repetir la conversion no vuelve a sumar la propina.

El campo logico `total` de Prisma y de la API sigue representando consumo;
ahora se mapea a `TotalConsumo`. El campo `totalConPropina` expone el `Total`
fisico. Asi los cobros, recibos, reportes y calculos fiscales existentes no
vuelven a sumar una propina ya incluida en la base.

No se modifican pagos registrados, detalles, subtotal, IVA, claves documentales,
CUFE, archivos fiscales ni respuestas de Factus. Las diferencias de pago
historicas no se corrigen ni se redistribuyen con esta migracion.

## Aplicacion en dos fases

No ejecutar ambas migraciones contra una aplicacion antigua en funcionamiento.

1. Respaldar todas las bases y restaurar el respaldo en una base de ensayo.
2. Ensayar ambas migraciones y verificar que se conservan los demas campos.
3. Aplicar **solo** `20261110150000_preparar_total_consumo` en cada base activa.
   Registrar esa migracion como aplicada con `prisma migrate resolve`.
   Esta fase conserva `Total` sin propina y sincroniza escrituras del cliente
   anterior con `TotalConsumo`, sin alterar el comportamiento en produccion.
4. Generar Prisma y desplegar el codigo nuevo. Confirmar que el campo `total`
   de ambos modelos de cabecera se mapea a `TotalConsumo`.
5. Con el codigo nuevo activo, aplicar `20261110160000_total_incluye_propina`
   y registrarla como aplicada. Esta fase sustituye el trigger transitorio,
   completa los totales y agrega el CHECK permanente.
6. Verificar los importes, pagos y documentos fiscales contra el respaldo.

En instalaciones nuevas sin una aplicacion antigua activa se pueden aplicar
ambas fases antes del primer arranque. No volver a una imagen antigua despues
de la segunda fase sin revertir tambien la semantica de `Total` y los triggers.

## Verificacion

Ejecutar para cada una de las dos tablas; el resultado debe ser cero:

```sql
SELECT count(*) AS inconsistentes
FROM "Factura"
WHERE round("Total"::numeric, 2)
  <> round("TotalConsumo"::numeric + "Propina"::numeric, 2);
```

La suma de los detalles incluye la linea de propina cuando existe y debe
coincidir con el nuevo total. No sumar nuevamente `Propina` a `Total` en
consultas SQL externas. Para ventas sin propina, `Total` y `TotalConsumo`
coinciden. Los archivos fiscales aceptados no se regeneran ni se reenvian.