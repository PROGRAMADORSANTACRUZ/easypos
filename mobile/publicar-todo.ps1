# Publica la APK de punta a punta: compila, hace commit, push, espera el redeploy de Dokploy,
# restaura los labels de Traefik (deploy.sh) y verifica la version publicada.
# Antes: subir versionCode/versionName en android/app/build.gradle.
# Uso (en una terminal normal, no desde el chat):  .\publicar-todo.ps1
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$llave = 'C:\CRENDENCIALES-SERVIDORES\CLAVE.pem'
$servidor = 'adminsvr@20.121.178.90'
$servicio = 'posgruposantacruz-5wzjke'
$sitio = 'https://pos.grupo-santacruz.com'

function Invoke-Servidor([string]$comando) {
  & ssh -i $llave -o BatchMode=yes $servidor $comando
}

# 1. Compilar y copiar la APK a client/public/movil
& "$PSScriptRoot\publicar-apk.ps1"
if (-not $?) { throw 'Fallo publicar-apk.ps1' }
$version = Get-Content "$raiz\client\public\movil\version.json" -Raw | ConvertFrom-Json

# 2. Commit y push (no incluye otros cambios sin relacion)
Push-Location $raiz
try {
  git add client/public/movil mobile
  git commit -m "release(apk): $($version.versionName)" -m 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>'
  git push
  if ($LASTEXITCODE -ne 0) { throw 'Fallo git push' }
} finally { Pop-Location }

# 3. Dokploy redespliega y deja el servicio sin labels de Traefik: esperar a que eso ocurra (max 10 min)
"Esperando el redeploy de Dokploy..."
$limite = (Get-Date).AddMinutes(10)
do {
  Start-Sleep -Seconds 10
  $labels = (Invoke-Servidor "sudo docker service inspect --format '{{len .Spec.Labels}}' $servicio" | Out-String).Trim()
} while ($labels -ne '0' -and (Get-Date) -lt $limite)
Start-Sleep -Seconds 15

# 4. Restaurar los labels de Traefik
Get-Content "$raiz\deploy.sh" -Raw | & ssh -i $llave -o BatchMode=yes $servidor 'sudo bash -s'
if ($LASTEXITCODE -ne 0) { throw 'Fallo deploy.sh en el servidor' }

# 5. Verificar
Start-Sleep -Seconds 10
$publicada = Invoke-RestMethod "$sitio/movil/version.json"
if ($publicada.versionCode -eq $version.versionCode) { "OK: $sitio publica la $($publicada.versionName)" }
else { "ATENCION: el sitio publica $($publicada.versionName), se esperaba $($version.versionName). Revisa el despliegue en Dokploy." }
