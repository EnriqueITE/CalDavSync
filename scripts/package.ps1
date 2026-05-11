$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root "manifest.json"
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$version = $manifest.version
$packageName = "CalDavSync-v$version.xpi"
$zipName = "CalDavSync-v$version.zip"
$packagePath = Join-Path $root $packageName
$zipPath = Join-Path $root $zipName

Push-Location $root
try {
  Get-ChildItem -Path $root -Filter "CalDavSync-v*.xpi" | Remove-Item -Force
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

  Compress-Archive -Path manifest.json,api,src,ui,README.md,TESTING.md -DestinationPath $zipPath -Force
  Move-Item -LiteralPath $zipPath -Destination $packagePath -Force
  Write-Host "Created $packageName"
} finally {
  Pop-Location
}
