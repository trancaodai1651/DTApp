$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskRelease = Join-Path $taskRoot 'release'
New-Item -ItemType Directory -Force -Path $taskRelease | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression

$taskSourceZip = Join-Path $taskRelease 'DT-App-0.2.5-source.zip'
if (Test-Path -LiteralPath $taskSourceZip) { Remove-Item -LiteralPath $taskSourceZip -Force }
$taskArchive = [IO.Compression.ZipFile]::Open($taskSourceZip, [IO.Compression.ZipArchiveMode]::Create)
try {
    $taskFiles = [Collections.Generic.List[string]]::new()
    foreach ($taskName in @('package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html', 'README.md', 'THIRD_PARTY_NOTICES.md', '.gitignore', '.env.example')) {
        $taskFiles.Add((Join-Path $taskRoot $taskName))
    }
    foreach ($taskFolder in @('src', 'public', 'desktop', 'src-tauri', 'scripts', 'docs', '.github', 'licenses', 'build', 'tests')) {
        Get-ChildItem -LiteralPath (Join-Path $taskRoot $taskFolder) -File -Recurse -Force | Where-Object { ($_.FullName -notmatch '[\\/](target|worker-runtime|gen|__pycache__)[\\/]') -or $_.FullName -eq (Join-Path $taskRoot 'src-tauri\worker-runtime\.gitkeep') } | ForEach-Object { $taskFiles.Add($_.FullName) }
    }
    Get-ChildItem -LiteralPath (Join-Path $taskRoot 'server') -File | Where-Object { $_.Extension -eq '.mjs' -or $_.Name -in @('package.json', 'package-lock.json') } | ForEach-Object { $taskFiles.Add($_.FullName) }
    foreach ($taskFile in $taskFiles) {
        $taskEntry = $taskFile.Substring($taskRoot.Length + 1) -replace '\\', '/'
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($taskArchive, $taskFile, $taskEntry, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally { $taskArchive.Dispose() }

$taskWebZip = Join-Path $taskRelease 'DT-App-0.2.5-web.zip'
if (Test-Path -LiteralPath $taskWebZip) { Remove-Item -LiteralPath $taskWebZip -Force }
[IO.Compression.ZipFile]::CreateFromDirectory((Join-Path $taskRoot 'dist'), $taskWebZip, [IO.Compression.CompressionLevel]::Optimal, $false)
Write-Output $taskSourceZip
Write-Output $taskWebZip
