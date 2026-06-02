$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$stopped = 0

Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
  Where-Object {
    $commandLine = [string]$_.CommandLine
    $commandLine -match '(^|[\\/\s"])server\.js($|[\\/\s"])'
  } |
  ForEach-Object {
    Write-Host "Zatrzymuje serwer Otchlan Mapper PID $($_.ProcessId)..."
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    $script:stopped += 1
  }

Get-Process OtchlanMemoryReader -ErrorAction SilentlyContinue |
  ForEach-Object {
    Write-Host "Zatrzymuje OtchlanMemoryReader.exe PID $($_.Id)..."
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    $script:stopped += 1
  }

if ($stopped -eq 0) {
  Write-Host "Nie znaleziono uruchomionego serwera ani OtchlanMemoryReader.exe."
} else {
  Write-Host "Zatrzymano procesy: $stopped"
}
