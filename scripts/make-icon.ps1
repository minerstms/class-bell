$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
New-Item -ItemType Directory -Force -Path (Join-Path $root 'assets'), (Join-Path $root 'build') | Out-Null

$size = 256
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::FromArgb(255, 15, 92, 92))
$gold = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 244, 208, 122))
$ink = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 28, 36, 48))
$g.FillEllipse($gold, 104, 24, 48, 36)
$g.FillRectangle($gold, 120, 52, 16, 24)
$points = @(
  [System.Drawing.Point]::new(96, 74),
  [System.Drawing.Point]::new(160, 74),
  [System.Drawing.Point]::new(214, 168),
  [System.Drawing.Point]::new(42, 168)
)
$g.FillPolygon($gold, $points)
$g.FillEllipse($gold, 36, 146, 184, 52)
$g.FillEllipse($ink, 112, 186, 32, 32)
$g.FillEllipse($gold, 118, 192, 20, 20)
$bmp.Save((Join-Path $root 'assets\icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Save((Join-Path $root 'build\icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$tray = New-Object System.Drawing.Bitmap 32, 32
$tg = [System.Drawing.Graphics]::FromImage($tray)
$tg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$tg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$tg.DrawImage($bmp, 0, 0, 32, 32)
$tray.Save((Join-Path $root 'assets\tray.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$tg.Dispose()
$bmp.Dispose()
$tray.Dispose()

node -e "const fs=require('fs'); const png=fs.readFileSync('build/icon.png'); const header=Buffer.alloc(6); header.writeUInt16LE(0,0); header.writeUInt16LE(1,2); header.writeUInt16LE(1,4); const entry=Buffer.alloc(16); entry.writeUInt8(0,0); entry.writeUInt8(0,1); entry.writeUInt8(0,2); entry.writeUInt8(0,3); entry.writeUInt16LE(1,4); entry.writeUInt16LE(32,6); entry.writeUInt32LE(png.length,8); entry.writeUInt32LE(22,12); fs.writeFileSync('build/icon.ico', Buffer.concat([header, entry, png]));"
Write-Output 'ICON_DONE'
