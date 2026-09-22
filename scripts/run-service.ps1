param([ValidateSet('bridge','mobile')][string]$Service)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $repo
$node = Join-Path $env:LOCALAPPDATA 'hermes\node\node.exe'
if (!(Test-Path -LiteralPath $node)) { $node = (Get-Command node.exe -ErrorAction Stop).Source }
$logDir = Join-Path $env:LOCALAPPDATA 'nerdbot-service-logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$entry = if ($Service -eq 'bridge') { 'bridge/server.mjs' } else { 'scripts/mobile-server.mjs' }
& $node $entry >> (Join-Path $logDir "$Service.log") 2>&1
exit $LASTEXITCODE
