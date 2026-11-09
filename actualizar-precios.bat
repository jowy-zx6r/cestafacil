@echo off
chcp 65001 >nul
REM Actualiza los precios de CestaFacil y los sube a GitHub.
cd /d "%~dp0"
echo ==== %date% %time% ==== >> actualizar-precios.log
git pull --quiet >> actualizar-precios.log 2>&1
node scripts\update_prices.mjs >> actualizar-precios.log 2>&1
if errorlevel 1 (
  echo No se pudieron actualizar los precios. Mira actualizar-precios.log >> actualizar-precios.log
  exit /b 1
)
git add prices.js
git diff --cached --quiet && (echo Sin cambios de precios. >> actualizar-precios.log & exit /b 0)
git commit -m "Precios actualizados %date%" >> actualizar-precios.log 2>&1
git push >> actualizar-precios.log 2>&1
echo Listo. >> actualizar-precios.log
