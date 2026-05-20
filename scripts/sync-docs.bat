@echo off
setlocal enabledelayedexpansion

echo ==============================
echo   Syncing project documents
echo ==============================

REM Ensure docs directory exists
if not exist "docs" (
    echo Creating docs directory...
    mkdir "docs"
)

REM ---- AI WORKER ----
if exist "apps\ai-engine\CHECKPOINT.md" (
    echo Syncing apps/ai-engine/CHECKPOINT.md...
    copy /Y "apps\ai-engine\CHECKPOINT.md" "docs\checkpoint-ai-engine.md" >nul
) else (
    echo WARNING: apps\ai-engine\CHECKPOINT.md not found!
)

if exist "apps\ai-engine\INSTRUCTION.md" (
    echo Syncing apps\ai-engine/INSTRUCTION.md...
    copy /Y "apps\ai-engine\INSTRUCTION.md" "docs\INSTRUCTION-ai-engine.md" >nul
) else (
    echo WARNING: apps\ai-engine\INSTRUCTION.md not found!
)

REM ---- BACKEND ----
if exist "apps\backend-api\CHECKPOINT.md" (
    echo Syncing apps\backend-api/CHECKPOINT.md...
    copy /Y "apps\backend-api\CHECKPOINT.md" "docs\checkpoint-backend.md" >nul
) else (
    echo WARNING: apps\backend-api\CHECKPOINT.md not found!
)

if exist "apps\backend-api\INSTRUCTION.md" (
    echo Syncing apps\backend-api/INSTRUCTION.md...
    copy /Y "apps\backend-api\INSTRUCTION.md" "docs\INSTRUCTION-backend.md" >nul
) else (
    echo WARNING: apps\backend-api\INSTRUCTION.md not found!
)

REM ---- MOBILE APP ----
if exist "apps\mobile-app\CHECKPOINT.md" (
    echo Syncing apps/mobile-app/CHECKPOINT.md...
    copy /Y "apps\mobile-app\CHECKPOINT.md" "docs\checkpoint-mobile-app.md" >nul
) else (
    echo WARNING: apps\mobile-app\CHECKPOINT.md not found!
)

if exist "apps\mobile-app\INSTRUCTION.md" (
    echo Syncing apps/mobile-app/INSTRUCTION.md...
    copy /Y "apps\mobile-app\INSTRUCTION.md" "docs\INSTRUCTION-mobile-app.md" >nul
) else (
    echo WARNING: apps\mobile-app\INSTRUCTION.md not found!
)

echo.
echo Sync completed.
echo ==============================

endlocal