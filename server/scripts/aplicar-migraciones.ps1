# Aplica las migraciones pendientes de Prisma en el contenedor del POS en produccion.
# Sirve cuando un cambio trae tablas o permisos nuevos (ej. impresoras del local, devoluciones).
# Uso (en una terminal normal de VS Code, no desde el chat), desde la carpeta del proyecto:
#   .\server\scripts\aplicar-migraciones.ps1
$ErrorActionPreference = 'Stop'
$llave = 'C:\CRENDENCIALES-SERVIDORES\CLAVE.pem'
$servidor = 'adminsvr@20.121.178.90'
$servicio = 'posgruposantacruz-5wzjke'

# El comando va como un solo argumento de una linea: por tuberia, PowerShell 5.1 agrega \r a cada linea
# y el servidor recibe "deploy\r" (Unknown command). Sin comillas dobles para que PowerShell no las altere.
$remoto = 'C=$(sudo docker ps -q -f name=SERVICIO | head -1); ' +
  'if [ -z $C ]; then echo No se encontro el contenedor SERVICIO en este servidor; exit 1; fi; ' +
  'echo Contenedor: $C; ' +
  'sudo docker exec $C sh -c ''cd /app/server && npx prisma migrate deploy'''
$remoto = $remoto -replace 'SERVICIO', $servicio

& ssh -i $llave $servidor $remoto
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron aplicar las migraciones (revisa el mensaje de arriba)' }
'Listo. En el POS cierra sesion y vuelve a entrar para cargar los permisos nuevos.'
