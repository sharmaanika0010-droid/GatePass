@echo off
title Upload GatePass to GitHub
cd /d "%~dp0"
echo.
echo  ==========================================
echo     Upload GatePass to GitHub
echo  ==========================================
echo.
echo  Pehle github.com/new par "GatePass" naam ki EMPTY repository bana lo
echo  (README / .gitignore tick mat karna). Phir koi bhi key dabao.
echo.
pause
where git >nul 2>nul || (echo  Git installed nahi hai. https://git-scm.com/download/win se install karo. & pause & exit /b)
if not exist ".git" git init >nul
git config user.name >nul 2>nul || git config user.name "Anika Sharma"
git config user.email >nul 2>nul || git config user.email "sharmaanika0010-droid@users.noreply.github.com"
git add .
git commit -m "GatePass - Blockchain-Based Hostel Outpass Verification System" >nul 2>nul
git branch -M main
git remote remove origin >nul 2>nul
git remote add origin https://github.com/sharmaanika0010-droid/GatePass.git
git push -u origin main
echo.
if %errorlevel%==0 (echo   DONE!  https://github.com/sharmaanika0010-droid/GatePass) else (echo   Push fail hua - upar ka error dekho.)
echo.
pause
