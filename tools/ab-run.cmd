@echo off
rem Wrapper: bypass script execution policy, then call ab-run.ps1
rem Example:
rem   ab-run.cmd -Script ab-timed.js -ScriptArgs "file:///C:/x/page.html","shots/x","300,900,1800"
setlocal
set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if exist "%ProgramFiles%\PowerShell\7\pwsh.exe" set "PS=%ProgramFiles%\PowerShell\7\pwsh.exe"
"%PS%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0ab-run.ps1" %*
