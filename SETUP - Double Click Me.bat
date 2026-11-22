@echo off
title GatePass Setup
color 1F
echo.
echo  ==================================================
echo     GatePass - One Time Setup
echo  ==================================================
echo.
set "SRC=%~dp0"
set "DEST=%USERPROFILE%\Documents\Projects\GatePass"

echo  [1/5] Stopping old GatePass (if running)...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo  [2/5] Copying project to %DEST% ...
if not exist "%DEST%" mkdir "%DEST%"
robocopy "%SRC%." "%DEST%" /E /XD node_modules cache /XF "SETUP - Double Click Me.bat" config.json /NFL /NDL /NJH /NJS /NP >nul

cd /d "%DEST%"
echo  [3/5] Installing packages (first time takes 1-2 minutes)...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo  ERROR: npm install failed. Check internet connection and that Node.js is installed.
  pause
  exit /b 1
)

echo  [4/5] Creating Desktop shortcut and auto-start...
powershell -NoProfile -ExecutionPolicy Bypass -File "%DEST%\setup\shortcuts.ps1" "%DEST%"

echo  [5/5] Starting GatePass and opening the website...
wscript "%DEST%\Open GatePass.vbs"

echo.
echo  ==================================================
echo   DONE!  GatePass is ready.
echo.
echo   - Project folder : %DEST%
echo   - Website        : http://localhost:3000
echo   - Desktop icon   : GatePass  (double-click any time)
echo   - It also starts automatically when the laptop turns on.
echo.
echo   You can now delete the GatePass folder and zip from Downloads.
echo  ==================================================
echo.
pause
