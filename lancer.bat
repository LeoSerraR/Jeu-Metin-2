@echo off
title Lames de Jade - serveur
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js n'est pas installe. Telecharge la version LTS sur https://nodejs.org puis relance ce fichier.
  pause
  exit /b
)
if not exist node_modules (
  echo Installation des bibliotheques, patiente une minute...
  call npm install --omit=dev
)
start "" http://localhost:3000
node server/index.js
pause
