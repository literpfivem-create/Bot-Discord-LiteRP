@echo off
title LiteRP Bot
cd /d "%~dp0"
if not exist "node_modules\@napi-rs\canvas" (
    echo Installazione dipendenze...
    call npm install
)
if not exist .env (
    copy .env.example .env >nul
    echo File .env creato: inserisci il DISCORD_TOKEN e riavvia.
    notepad .env
    pause
    exit /b
)
:loop
node src/index.js
echo Il bot si e' fermato. Riavvio tra 5 secondi... (chiudi la finestra per uscire)
timeout /t 5 >nul
goto loop
