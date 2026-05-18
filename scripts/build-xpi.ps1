# Build XPI with forward-slash paths (required by Mozilla/Thunderbird)
param(
    [string]$Version = "0.2.6"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path $PSScriptRoot -Parent
$xpiName = "CalDavSync-v$Version.xpi"
$xpiPath = Join-Path $projectRoot $xpiName

# Remove old xpi if exists
if (Test-Path $xpiPath) { Remove-Item $xpiPath -Force }

# Load assemblies
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zipStream = [System.IO.File]::Create($xpiPath)
$zip = New-Object System.IO.Compression.ZipArchive($zipStream, [System.IO.Compression.ZipArchiveMode]::Create)

$dirs = @("src", "ui", "api", "icons")
$rootFiles = @("manifest.json")

foreach ($dir in $dirs) {
    $dirPath = Join-Path $projectRoot $dir
    Get-ChildItem -Path $dirPath -Recurse -File | ForEach-Object {
        $relativePath = $_.FullName.Substring($projectRoot.Length + 1).Replace('\', '/')
        $entry = $zip.CreateEntry($relativePath)
        $entryStream = $entry.Open()
        $fileStream = [System.IO.File]::OpenRead($_.FullName)
        $fileStream.CopyTo($entryStream)
        $fileStream.Close()
        $entryStream.Close()
        Write-Host "  + $relativePath"
    }
}

foreach ($file in $rootFiles) {
    $filePath = Join-Path $projectRoot $file
    $entry = $zip.CreateEntry($file)
    $entryStream = $entry.Open()
    $fileStream = [System.IO.File]::OpenRead($filePath)
    $fileStream.CopyTo($entryStream)
    $fileStream.Close()
    $entryStream.Close()
    Write-Host "  + $file"
}

$zip.Dispose()
$zipStream.Close()

Write-Host "`nBuilt: $xpiName"
