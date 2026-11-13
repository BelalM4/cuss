@echo off
cd /d "%~dp0"
if not exist .env copy .env.example .env
if not exist node_modules\vite call npm install
if not exist web\dist call npm run build
start "" http://localhost:3000
node server.js
pause
