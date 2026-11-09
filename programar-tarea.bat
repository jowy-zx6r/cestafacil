@echo off
chcp 65001 >nul
REM Crea una tarea de Windows que actualiza los precios cada lunes a las 10:00.
REM Si ese lunes el ordenador está apagado, se ejecuta en cuanto lo enciendas.
set "BAT=%~dp0actualizar-precios.bat"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
 "$a = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument ('/c \"' + $env:BAT + '\"');" ^
 "$t = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 10:00;" ^
 "$s = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30);" ^
 "Register-ScheduledTask -TaskName 'CestaFacil - actualizar precios' -Action $a -Trigger $t -Settings $s -Force | Out-Null;" ^
 "Write-Host 'Tarea creada: cada lunes a las 10:00.'"
pause
