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
New-Item -ItemType Directory -Force $destino | Out-Null
Copy-Item $apk "$destino\POS-Santacruz.apk" -Force
$json = [ordered]@{ versionCode = $codigo; versionName = $nombre; sha256 = $sha; url = '/movil/POS-Santacruz.apk' } | ConvertTo-Json
[IO.File]::WriteAllText("$destino\version.json", $json, (New-Object Text.UTF8Encoding($false)))
"APK $nombre (versionCode $codigo) publicada en $destino"
