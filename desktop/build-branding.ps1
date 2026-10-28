$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$output = Join-Path $PSScriptRoot 'build'
$logoPath = Join-Path $PSScriptRoot '..\client\public\logo-claro.png'
$logo = [System.Drawing.Image]::FromFile($logoPath)
$background = [System.Drawing.ColorTranslator]::FromHtml('#1E1B18')
$cream = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#EDDFCA'))
$muted = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#B0A89E'))
$red = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#E13626'))
$titleFont = [System.Drawing.Font]::new('Segoe UI', 28, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$bodyFont = [System.Drawing.Font]::new('Segoe UI', 11, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$smallFont = [System.Drawing.Font]::new('Segoe UI', 9, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)

function New-Canvas([int]$width, [int]$height) {
    $bitmap = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    return $bitmap
}

function Draw-Logo($graphics, [int]$x, [int]$y, [int]$width) {
    $height = [int]($width * $logo.Height / $logo.Width)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.DrawImage($logo, $x, $y, $width, $height)
}

try {
    $artworkScale = 4
    $sidebar = New-Canvas (164 * $artworkScale) (314 * $artworkScale)
    $graphics = [System.Drawing.Graphics]::FromImage($sidebar)
    try {
        $graphics.ScaleTransform($artworkScale, $artworkScale)
        $gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
            [System.Drawing.Point]::new(0, 0), [System.Drawing.Point]::new(164, 314),
            $background, [System.Drawing.ColorTranslator]::FromHtml('#62120B'))
        try { $graphics.FillRectangle($gradient, 0, 0, 164, 314) } finally { $gradient.Dispose() }
        $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
        $graphics.FillRectangle($red, 0, 0, 164, 4)
        Draw-Logo $graphics 16 28 132
        $graphics.DrawString('POS', $titleFont, $cream, 16, 110)
        $graphics.FillRectangle($red, 18, 153, 32, 3)
        $graphics.DrawString("Todo tu restaurante,`nen un solo lugar.", $bodyFont, $cream, 18, 171)
        $graphics.DrawString("VENTAS  /  MESAS`nCAJA  /  INVENTARIO", $smallFont, $muted, 18, 231)
        $graphics.DrawString('ASADOS SANTACRUZ', $smallFont, $cream, 18, 289)
        $sidebar.Save((Join-Path $output 'sidebar.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp)
    } finally { $graphics.Dispose(); $sidebar.Dispose() }

    $header = New-Canvas (150 * $artworkScale) (57 * $artworkScale)
    $graphics = [System.Drawing.Graphics]::FromImage($header)
    try {
        $graphics.ScaleTransform($artworkScale, $artworkScale)
        $graphics.Clear($background)
        Draw-Logo $graphics 8 4 134
        $header.Save((Join-Path $output 'header.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp)
    } finally { $graphics.Dispose(); $header.Dispose() }

    $frames = @()
    foreach ($size in @(16, 24, 32, 48, 64, 128, 256)) {
        $bitmap = [System.Drawing.Bitmap]::new($size, $size)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $stream = [System.IO.MemoryStream]::new()
        try {
            $graphics.Clear($background)
            $graphics.FillRectangle($red, 0, 0, $size, [Math]::Max(1, [int]($size * 0.045)))
            $width = [int]($size * 0.9)
            $height = [int]($width * $logo.Height / $logo.Width)
            Draw-Logo $graphics ([int](($size - $width) / 2)) ([int](($size - $height) / 2)) $width
            $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
            $frames += ,@{ Size = $size; Bytes = $stream.ToArray() }
        } finally { $graphics.Dispose(); $bitmap.Dispose(); $stream.Dispose() }
    }

    $iconStream = [System.IO.File]::Create((Join-Path $output 'icon.ico'))
    $writer = [System.IO.BinaryWriter]::new($iconStream)
    try {
        $writer.Write([uint16]0)
        $writer.Write([uint16]1)
        $writer.Write([uint16]$frames.Count)
        $offset = 6 + 16 * $frames.Count
        foreach ($frame in $frames) {
            $dimension = if ($frame.Size -eq 256) { 0 } else { $frame.Size }
            $writer.Write([byte]$dimension)
            $writer.Write([byte]$dimension)
            $writer.Write([byte]0)
            $writer.Write([byte]0)
            $writer.Write([uint16]1)
            $writer.Write([uint16]32)
            $writer.Write([uint32]$frame.Bytes.Length)
            $writer.Write([uint32]$offset)
            $offset += $frame.Bytes.Length
        }
        foreach ($frame in $frames) { $writer.Write([byte[]]$frame.Bytes) }
    } finally { $writer.Dispose(); $iconStream.Dispose() }
    Write-Output 'Branding generado desde client\public\logo-claro.png'
} finally {
    $logo.Dispose()
    $cream.Dispose()
    $muted.Dispose()
    $red.Dispose()
    $titleFont.Dispose()
    $bodyFont.Dispose()
    $smallFont.Dispose()
}
