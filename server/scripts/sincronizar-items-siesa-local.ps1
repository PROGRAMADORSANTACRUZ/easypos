Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Sincronización Siesa - EasyPOS'
$form.StartPosition = 'CenterScreen'
$form.ClientSize = New-Object System.Drawing.Size(440, 310)
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false

$aviso = New-Object System.Windows.Forms.Label
$aviso.Text = 'Las credenciales se usan solo durante este proceso y no se guardan.'
$aviso.Location = New-Object System.Drawing.Point(16, 14)
$aviso.Size = New-Object System.Drawing.Size(408, 24)
$form.Controls.Add($aviso)

function AgregarCampo($titulo, $y, $secreto, $valorInicial = '') {
  $etiqueta = New-Object System.Windows.Forms.Label
  $etiqueta.Text = $titulo
  $etiqueta.Location = New-Object System.Drawing.Point(16, $y)
  $etiqueta.Size = New-Object System.Drawing.Size(408, 20)
  $form.Controls.Add($etiqueta)

  $entrada = New-Object System.Windows.Forms.TextBox
  $entrada.Location = New-Object System.Drawing.Point(16, ($y + 22))
  $entrada.Size = New-Object System.Drawing.Size(408, 24)
  $entrada.Text = $valorInicial
  if ($secreto) { $entrada.UseSystemPasswordChar = $true }
  $form.Controls.Add($entrada)
  return $entrada
}

$sqlUsuario = AgregarCampo 'Usuario SQL Server' 44 $false 'Carnesantacruz'
$sqlPassword = AgregarCampo 'Contraseña SQL Server' 96 $true
$posUsuario = AgregarCampo 'Usuario EasyPOS' 148 $false
$posPassword = AgregarCampo 'Contraseña EasyPOS' 200 $true

$aceptar = New-Object System.Windows.Forms.Button
$aceptar.Text = 'Continuar'
$aceptar.Location = New-Object System.Drawing.Point(248, 258)
$aceptar.Size = New-Object System.Drawing.Size(84, 30)
$aceptar.DialogResult = [System.Windows.Forms.DialogResult]::OK
$form.Controls.Add($aceptar)

$cancelar = New-Object System.Windows.Forms.Button
$cancelar.Text = 'Cancelar'
$cancelar.Location = New-Object System.Drawing.Point(340, 258)
$cancelar.Size = New-Object System.Drawing.Size(84, 30)
$cancelar.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
$form.Controls.Add($cancelar)
$form.AcceptButton = $aceptar
$form.CancelButton = $cancelar

if ($form.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
  Write-Host 'Sincronización cancelada.'
  exit 0
}
if (-not $sqlUsuario.Text -or -not $sqlPassword.Text -or -not $posUsuario.Text -or -not $posPassword.Text) {
  [System.Windows.Forms.MessageBox]::Show('Completa los cuatro campos para continuar.', 'Faltan datos') | Out-Null
  exit 1
}

$env:SIESA_LOCAL_SQL_USER = $sqlUsuario.Text
$env:SIESA_LOCAL_SQL_PASSWORD = $sqlPassword.Text
$env:EASYPOS_LOCAL_USER = $posUsuario.Text
$env:EASYPOS_LOCAL_PASSWORD = $posPassword.Text
$serverDir = Split-Path -Parent $PSScriptRoot
$exitCode = 0
Push-Location $serverDir
try {
  & node.exe (Join-Path $serverDir 'scripts/sincronizar-items-siesa-local.mjs')
  $exitCode = $LASTEXITCODE
} finally {
  $env:SIESA_LOCAL_SQL_USER = $null
  $env:SIESA_LOCAL_SQL_PASSWORD = $null
  $env:EASYPOS_LOCAL_USER = $null
  $env:EASYPOS_LOCAL_PASSWORD = $null
  Pop-Location
}
exit $exitCode