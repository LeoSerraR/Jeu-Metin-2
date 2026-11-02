#!/bin/bash
# Lancement sur Mac ou Linux
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Installe Node.js (version LTS) depuis https://nodejs.org"; exit 1; }
[ -d node_modules ] || npm install --omit=dev
(sleep 2 && (open http://localhost:3000 2>/dev/null || xdg-open http://localhost:3000 2>/dev/null)) &
node server/index.js
