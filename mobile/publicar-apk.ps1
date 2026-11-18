# Compila la APK firmada con la llave propia y la publica en el sitio (client/public/movil).
# Uso (desde la carpeta mobile):  .\publicar-apk.ps1
# Después: git add client/public/movil mobile; git commit; git push  -> Dokploy despliega y las
# apps instaladas detectan la versión nueva (versionCode mayor) y se actualizan solas.
# Antes de publicar, sube versionCode/versionName en android/app/build.gradle.
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
if (-not $env:JAVA_HOME) { $env:JAVA_HOME = "$env:LOCALAPPDATA\POS-Tools\jdk21" }
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk" }
$env:Path = "$env:JAVA_HOME\bin;$env:Path"

$claves = "$env:USERPROFILE\POS-Keystore\keystore.properties"
if (-not (Test-Path $claves)) { throw "Falta la llave de firma: $claves" }

Push-Location "$PSScriptRoot\android"
try {
  & .\gradlew.bat assembleRelease --no-daemon
  if ($LASTEXITCODE -ne 0) { throw 'Falló la compilación de la APK' }
} finally { Pop-Location }

$apk = "$PSScriptRoot\android\app\build\outputs\apk\release\app-release.apk"
if (-not (Test-Path $apk)) { throw "No se generó $apk (¿APK sin firmar?)" }

$gradle = Get-Content "$PSScriptRoot\android\app\build.gradle" -Raw
$codigo = [int][regex]::Match($gradle, 'versionCode\s+(\d+)').Groups[1].Value
$nombre = [regex]::Match($gradle, 'versionName\s+"([^"]+)"').Groups[1].Value
$sha = (Get-FileHash $apk -Algorithm SHA256).Hash.ToLower()

$destino = "$raiz\client\public\movil"
$versionPublicada = "$destino\version.json"
if (Test-Path $versionPublicada) {
  $anterior = [int](Get-Content $versionPublicada -Raw | ConvertFrom-Json).versionCode
  if ($codigo -le $anterior) { throw "versionCode $codigo no es mayor que el ya publicado ($anterior): subelo en build.gradle o los celulares no detectaran la APK" }
}
New-Item -ItemType Directory -Force $destino | Out-Null
# El nombre lleva la versión: Cloudflare cachea los .apk por horas y un nombre fijo serviría la APK vieja.
Get-ChildItem $destino -Filter 'POS-Santacruz*.apk' | Remove-Item -Force
$archivo = "POS-Santacruz-$nombre.apk"
Copy-Item $apk "$destino\$archivo" -Force
$json = [ordered]@{ versionCode = $codigo; versionName = $nombre; sha256 = $sha; url = "/movil/$archivo" } | ConvertTo-Json
[IO.File]::WriteAllText("$destino\version.json", $json, (New-Object Text.UTF8Encoding($false)))
"APK $nombre (versionCode $codigo) publicada en $destino\$archivo"
