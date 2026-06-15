# Libère le port backend (défaut 5002) pour éviter proxy Vite cassé
param([int]$Port = 5002)

$conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $conns) {
  Write-Host "Port $Port deja libre."
  exit 0
}

$pids = $conns.OwningProcess | Sort-Object -Unique
foreach ($procId in $pids) {
  try {
    $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
    Write-Host "Arret PID $procId ($($proc.ProcessName))..."
    Stop-Process -Id $procId -Force -ErrorAction Stop
  } catch {
    Write-Warning "Impossible d'arreter PID $procId : $_"
  }
}
Write-Host "Port $Port libere."
