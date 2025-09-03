# --- Configuración del repositorio ---
$Owner     = "PredatorDevs"                         # Usuario/organización
$Repo      = "predatorbusiness-comedi-printer-server" # Nombre del repo
$Branch    = "master"                               # Rama a seguir
$InstallDir= Split-Path -Parent $PSCommandPath       # Carpeta donde corre este script

# --- Archivos/carpetas que NO quieres perder al actualizar ---
# Aquí puedes listar configs locales, logs, etc.
# Ejemplo: @("config/*.json","logs","uploads")
$Preserve  = @("config/*.json","logs")

# --- No toques de aquí hacia abajo ---
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$ua = @{ "User-Agent"="ZipUpdater" }

# 1) Descubrir el último commit de la rama
$commit   = Invoke-RestMethod -Headers $ua "https://api.github.com/repos/$Owner/$Repo/commits/$Branch"
$remoteId = $commit.sha
$zipUrl   = "https://api.github.com/repos/$Owner/$Repo/zipball/$remoteId"

$stateFile = Join-Path $InstallDir ".installed_version"
if (Test-Path $stateFile) {
  $current = (Get-Content $stateFile -Raw).Trim()
  if ($current -eq $remoteId) {
    Write-Host "✔ Ya estás en la última versión ($remoteId)."
    exit 0
  }
}

# 2) Descargar ZIP temporal
$tmp = New-Item -ItemType Directory -Path ([IO.Path]::Combine([IO.Path]::GetTempPath(), [Guid]::NewGuid()))
$zip = Join-Path $tmp "update.zip"
Invoke-WebRequest -Headers $ua -Uri $zipUrl -OutFile $zip

# 3) Extraer ZIP
Expand-Archive -Path $zip -DestinationPath $tmp
$newRoot = Get-ChildItem $tmp -Directory | Select-Object -First 1

# 4) Respaldar archivos/pastas a preservar
$preserveTmp = Join-Path $tmp "preserve"
New-Item -ItemType Directory -Path $preserveTmp | Out-Null
foreach ($pat in $Preserve) {
  Get-ChildItem -Path (Join-Path $InstallDir $pat) -Force -ErrorAction SilentlyContinue | ForEach-Object {
    $dest = Join-Path $preserveTmp ($_.FullName.Substring($InstallDir.Length).TrimStart('\','/'))
    New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force | Out-Null
    Copy-Item $_.FullName $dest -Recurse -Force -ErrorAction SilentlyContinue
  }
}

# 5) Borrar contenido viejo y copiar el nuevo
Get-ChildItem $InstallDir -Force | Where-Object { $_.Name -notin @(".","..","update.ps1","update.bat",".installed_version") } | ForEach-Object {
  if ($_.FullName -ne $PSCommandPath) { Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
}
Copy-Item (Join-Path $newRoot "*") $InstallDir -Recurse -Force

# 6) Restaurar lo preservado
if (Test-Path $preserveTmp) {
  Get-ChildItem $preserveTmp -Recurse -Force | ForEach-Object {
    if (-not $_.PSIsContainer) {
      $rel = $_.FullName.Substring($preserveTmp.Length).TrimStart('\','/')
      $dest = Join-Path $InstallDir $rel
      New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force | Out-Null
      Copy-Item $_.FullName $dest -Force
    }
  }
}

# 7) Guardar versión instalada
$remoteId | Set-Content -Path $stateFile -NoNewline
Write-Host "✔ Actualizado a $remoteId."
