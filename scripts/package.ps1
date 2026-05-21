$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root "manifest.json"
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$version = $manifest.version
$packageName = "CalDavSync-v$version.xpi"
$zipName = "CalDavSync-v$version.zip"
$packagePath = Join-Path $root $packageName
$zipPath = Join-Path $root $zipName
$includeRoots = @("manifest.json", "api", "src", "ui", "icons")

function Add-ZipEntry {
  param(
    [System.IO.Compression.ZipArchive] $Archive,
    [string] $FilePath,
    [string] $EntryName
  )

  $normalizedEntryName = $EntryName.Replace("\", "/")
  $entry = $Archive.CreateEntry($normalizedEntryName, [System.IO.Compression.CompressionLevel]::Optimal)
  $entryStream = $entry.Open()
  $fileStream = [System.IO.File]::OpenRead($FilePath)
  try {
    $fileStream.CopyTo($entryStream)
  } finally {
    $fileStream.Dispose()
    $entryStream.Dispose()
  }
}

Push-Location $root
try {
  if (Test-Path $packagePath) {
    Remove-Item $packagePath -Force
  }
  if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
  }

  node --check src/secrets.js
  node --check src/caldav.js
  node --check src/sync-engine.js
  node --check src/background.js
  node --check ui/options.js
  node --check ui/popup.js
  node --check api/localCalendarMirror/implementation.js
  node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); JSON.parse(require('fs').readFileSync('api/localCalendarMirror/schema.json','utf8'));"

  $manifestIcons = @($manifest.icons.PSObject.Properties.Value)
  foreach ($iconPath in $manifestIcons) {
    if (-not (Test-Path (Join-Path $root $iconPath) -PathType Leaf)) {
      throw "Manifest icon is missing: $iconPath"
    }
  }

  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($rootEntry in $includeRoots) {
      $fullPath = Join-Path $root $rootEntry
      if (Test-Path $fullPath -PathType Leaf) {
        Add-ZipEntry -Archive $archive -FilePath $fullPath -EntryName $rootEntry
        continue
      }

      Get-ChildItem -Path $fullPath -File -Recurse | ForEach-Object {
        $relativePath = $_.FullName.Substring($root.Length + 1)
        Add-ZipEntry -Archive $archive -FilePath $_.FullName -EntryName $relativePath
      }
    }
  } finally {
    $archive.Dispose()
  }

  Move-Item -LiteralPath $zipPath -Destination $packagePath -Force

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $createdArchive = [System.IO.Compression.ZipFile]::OpenRead($packagePath)
  try {
    foreach ($entry in $createdArchive.Entries) {
      if ($entry.FullName.Contains("\")) {
        throw "Invalid ZIP entry path separator: $($entry.FullName)"
      }
    }
  } finally {
    $createdArchive.Dispose()
  }

  Write-Host "Created $packageName"
} finally {
  Pop-Location
}
