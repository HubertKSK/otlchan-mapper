@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Nie znaleziono Node.js.
  echo Zainstaluj Node.js 18+ z https://nodejs.org/ i uruchom ten plik ponownie.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo.
  echo Instalowanie zaleznosci aplikacji...
  call npm install
  if errorlevel 1 (
    echo.
    echo Instalacja zaleznosci nie powiodla sie.
    pause
    exit /b 1
  )
)

echo.
echo Uruchamiam Otchlan Mapper...
start "" "http://localhost:5173"
npm start

