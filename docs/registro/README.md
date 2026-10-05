# Documentacion de SANTACRUZ POS para registro

## Documentos de entrega

- [Descripcion tecnica en PDF](Descripcion-tecnica-SANTACRUZ-POS.pdf).
- [Manual de usuario en PDF](Manual-de-usuario-SANTACRUZ-POS.pdf).
- [Descripcion tecnica en HTML](Descripcion-tecnica-SANTACRUZ-POS.html).
- [Manual de usuario en HTML](Manual-de-usuario-SANTACRUZ-POS.html).
- [Fuente editable de la descripcion](Descripcion-tecnica-SANTACRUZ-POS.md).
- [Fuente editable del manual](Manual-de-usuario-SANTACRUZ-POS.md).
- [Relacion y hashes de los archivos](Integridad-documental.json).

Los HTML incluyen las imagenes y estilos dentro del propio archivo y se pueden abrir sin un servidor. Los PDF contienen la descripcion y el manual ilustrado. Las ocho capturas PNG originales estan en la carpeta `capturas`.

## Antes de presentar

| Dato | Estado |
| --- | --- |
| Autor o autores, con identificacion legal | Por completar por el titular |
| Titular de derechos y soporte de adquisicion o cesion | Por completar y verificar |
| Fecha real de creacion y primera publicacion | Por completar con sus evidencias |
| Version de la obra presentada | Por confirmar; no confundir con fecha del documento |
| Correspondencia SANTACRUZ POS / EASYPOS / Asados Santacruz | Por confirmar por el titular |
| Requisitos y anexos de la autoridad de registro | Por revisar antes de radicar |

Esta documentacion se basa en la implementacion revisada. No constituye prueba independiente de autoria, certificacion tributaria, dictamen juridico ni auditoria de seguridad. Las dependencias de terceros deben identificarse como tales.

## Origen de las capturas

Se ejecuta el cliente React sin modificar sus componentes. Un navegador automatizado aislado recibe una sesion ficticia y respuestas de consulta previamente definidas; las escrituras API y las conexiones externas se bloquean. No se inicia el backend, no se consulta PostgreSQL y no se emiten documentos a Factus o a la DIAN.

Las capturas se generan a 1440 x 1000 o con altura mayor si la pagina lo necesita. No se retoca la marca ni se inventa una respuesta de aceptacion electronica. Los hashes SHA-256 permiten detectar cambios posteriores, pero no certifican autoria ni fecha de creacion. `revisionCodigoConsultado` identifica el codigo de referencia, no necesariamente un commit que incluya estos anexos documentales.

## Regenerar y verificar

Requisitos: Node.js compatible con las herramientas, npm, Microsoft Edge instalado y el cliente local en funcionamiento. Las dependencias de esta carpeta estan separadas de las del POS.

Desde la raiz del repositorio `easypos`, inicie el cliente en una terminal:

```powershell
npm --prefix client run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

En otra terminal:

```powershell
npm --prefix docs/registro ci
npm --prefix docs/registro run build
npm --prefix docs/registro run check
git diff --check
```

El generador utiliza Edge en modo headless. Para usar Google Chrome instalado, defina `DOCS_BROWSER_CHANNEL=chrome`. Puede cambiar el puerto mediante `DOCS_POS_URL`, pero solo se aceptan direcciones de loopback. No apunte el generador a produccion.

El proceso comprueba referencias locales, carga de imagenes, errores de ejecucion del cliente, dimensiones PNG, ausencia de desbordamiento de los HTML a 1440 y 390 pixeles, firmas PDF, ocho figuras y los hashes de catorce archivos de entrega. Las pruebas no validan login real, transacciones del servidor, impresion fisica, GPS o aceptacion DIAN.