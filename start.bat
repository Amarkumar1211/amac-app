@echo off
setlocal enabledelayedexpansion

echo ===========================================
echo Starting AMAC Application Services...
echo ===========================================

:: Get the local IPv4 address
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr IPv4') do (
    set IP=%%a
    set IP=!IP: =!
)

if "%IP%"=="" set IP=localhost

echo [1/2] Starting ASP.NET Core Backend API (Port 4900)...
cd backend
start "AMAC Backend (API)" cmd /c "dotnet run"

echo [2/2] Starting React Vite Frontend (Port 5175)...
cd ../frontend
start "AMAC Frontend (React)" cmd /c "npm run dev -- --host"

echo.
echo Both services are now starting in separate windows!
echo - Backend API is available at: http://%IP%:4900
echo - Frontend UI is available at: http://%IP%:5175
echo.
echo ^(You can share the Frontend UI link with anyone on your local WiFi/Network!^)
echo.
pause
