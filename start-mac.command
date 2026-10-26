#!/bin/bash
cd "$(dirname "$0")"
[ -d node_modules/vite ] || npm install
[ -d web/dist ] || npm run build
[ -f .env ] || cp .env.example .env
(sleep 2 && open http://localhost:3000) &
node server.js
