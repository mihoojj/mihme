# ab-run.ps1 - safe Chrome/Edge launcher + CDP script runner + targeted cleanup
#
# WHY: replace this dangerous pattern:
#        Get-Process chrome | Stop-Process -Force
#      which kills EVERY chrome on the machine, including the user's own browser.
#      This wrapper only ever stops the PID it launched.
#
# USAGE
#   .\ab-run.ps1 -Script ab-timed.js -ScriptArgs 'file:///C:/x/page.html','shots/x','300,900,1800'
#   .\ab-run.ps1 -Script ab-shot.js  -ScriptArgs 'file:///C:/x/page.html','.hero','shots/hero.png'
#   .\ab-run.ps1 -Script ab-full.js  -ScriptArgs 'https://example.com','shots/full.png'
#   .\ab-run.ps1 -DryRun                      # launch + connect + cleanup only
#
# OPTIONS
#   -Port 9222        CDP port (default 9222; busy port => fail fast, never kill the owner)
#   -Width 1440 -Height 900
#   -Headful          launch with a visible window (default: --headless=new)
#   -KeepProfile      keep the temp user-data-dir (default: delete it)
#   -ProfileDir PATH  use a specific profile dir
#   -Browser PATH     browser exe (default: auto-detect Chrome)
#   -NodePath PATH    node executable (default: node from PATH)
#
# SAFETY: cleanup is Stop-Process -Id <our pid> only. No name-based kills. Ever.
# NOTE:   the launched browser's stdout/stderr are redirected to files inside the
#         profile dir. Without that redirection the launched browser inherits the
#         caller's stdout pipe and the caller hangs until timeout.

[CmdletBinding()]
param(
  [string]$Script,
  [string[]]$ScriptArgs = @(),
  [int]$Port = 9222,
  [int]$Width = 1440,
  [int]$Height = 900,
  [switch]$Headful,
  [switch]$KeepProfile,
  [switch]$DryRun,
  [string]$ProfileDir,
  [string]$Browser,
  [string]$NodePath = 'node'
)

$ErrorActionPreference = 'Stop'

$browserExe = $Browser
if (-not $browserExe) {
  $browserExe = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $browserExe -or -not (Test-Path $browserExe)) {
  throw "browser executable not found: $browserExe"
}

if (-not $ProfileDir) {
  $ProfileDir = Join-Path $env:TEMP ('ab-auto-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
}
if (-not (Test-Path $ProfileDir)) {
  New-Item -ItemType Directory -Path $ProfileDir -Force | Out-Null
}

# Fail fast if the port is taken - do NOT kill whoever owns it.
$portBusy = $false
try {
  $tcp = New-Object System.Net.Sockets.TcpClient
  $tcp.Connect('127.0.0.1', $Port)
  $portBusy = $tcp.Connected
  $tcp.Close()
} catch {
  $portBusy = $false
}
if ($portBusy) {
  throw "port $Port is already in use (another browser/CDP session is listening). Use -Port <other> or wait."
}

$browserArgs = @(
  "--remote-debugging-port=$Port",
  "--user-data-dir=$ProfileDir",
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-networking',
  '--disable-extensions',
  '--disable-breakpad',
  '--noerrdialogs',
  '--hide-scrollbars',
  "--window-size=$Width,$Height",
  'about:blank'
)
if (-not $Headful) {
  $browserArgs = @('--headless=new', '--disable-gpu') + $browserArgs
}

$stdoutLog = Join-Path $ProfileDir 'stdout.log'
$stderrLog = Join-Path $ProfileDir 'stderr.log'

Write-Host ("[ab-run] launching {0}  port={1}" -f (Split-Path $browserExe -Leaf), $Port)
Write-Host "[ab-run] profile = $ProfileDir"

$proc = Start-Process -FilePath $browserExe -ArgumentList $browserArgs -PassThru `
  -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -WindowStyle Hidden

$ownPid = $proc.Id
$deadHint = 'browser exited right away. Common causes: (1) a "Get-Process chrome | Stop-Process -Force" loop killed it; (2) a restricted/sandboxed shell blocks Chrome crashpad - stderr shows "crash server failed to launch".'

function Get-StderrTail {
  param([string]$Path)
  if (Test-Path $Path) {
    return ((Get-Content $Path -Tail 5 -ErrorAction SilentlyContinue) -join ' / ')
  }
  return ''
}

try {
  $connected = $false
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 250
    $exited = $false
    try { $exited = $proc.HasExited } catch { }
    if ($exited) {
      $code = '?'
      try { $code = $proc.ExitCode } catch { }
      throw "launched browser exited with code $code. $deadHint  stderr: $(Get-StderrTail $stderrLog)"
    }
    try {
      $info = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 2
      Write-Host "[ab-run] connected: $($info.Browser)"
      $connected = $true
      break
    } catch { }
  }

  if (-not $connected) {
    throw "browser did not expose port $Port in time. $deadHint  stderr: $(Get-StderrTail $stderrLog)"
  }

  if ($DryRun) {
    Write-Host '[ab-run] dry run OK (script skipped)'
  } else {
    if (-not $Script) { throw '-Script is required unless -DryRun' }
    $nodeArgs = @($Script) + $ScriptArgs
    Write-Host ("[ab-run] {0} {1}" -f $NodePath, ($nodeArgs -join ' '))
    & $NodePath @nodeArgs
    if ($LASTEXITCODE -ne 0) { throw "node exited with code $LASTEXITCODE" }
    Write-Host '[ab-run] script done'
  }
} finally {
  Write-Host "[ab-run] cleanup: stopping own pid $ownPid only"
  try {
    Stop-Process -Id $ownPid -Force -ErrorAction Stop
    Write-Host "[ab-run] stopped pid $ownPid"
  } catch {
    Write-Warning "[ab-run] could not stop pid $ownPid : $($_.Exception.Message)"
  }
  Start-Sleep -Milliseconds 400
  if (-not $KeepProfile -and (Test-Path $ProfileDir)) {
    Remove-Item $ProfileDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host '[ab-run] profile removed'
  }
}
