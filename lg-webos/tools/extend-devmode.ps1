# Renueva (o solo consulta) la sesion del Modo Desarrollador de la LG desde PowerShell.
#   .\tools\extend-devmode.ps1          -> renueva a 1000 h
#   .\tools\extend-devmode.ps1 -Check   -> solo muestra el tiempo restante
# Usa el token guardado en tools\.devmode-token (mismo servidor que el boton Extend de la app).
param([switch]$Check)
$ErrorActionPreference = "Stop"
$tokenFile = Join-Path $PSScriptRoot ".devmode-token"
if (-not (Test-Path $tokenFile)) { Write-Error "No existe $tokenFile"; exit 1 }
$token = (Get-Content $tokenFile -Raw).Trim()
if (-not $token) { Write-Error "El token esta vacio"; exit 1 }
$action = if ($Check) { "CheckDevModeSession" } else { "ResetDevModeSession" }
if ($Check) { "Tiempo restante de la sesion:" } else { "Renovando la sesion a 1000 h..." }
Invoke-RestMethod "https://developer.lge.com/secure/$action.dev?sessionToken=$token"
