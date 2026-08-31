@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-local.ps1"
set "FREE_CRM_EXIT=%ERRORLEVEL%"
if not "%FREE_CRM_EXIT%"=="0" pause
exit /b %FREE_CRM_EXIT%
