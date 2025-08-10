@echo off
setlocal enabledelayedexpansion

REM PlexTV Local Build Script for Windows
REM This script builds and runs PlexTV in a single container for testing

echo.
echo 🚀 PlexTV Local Build Script
echo ==============================

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not running. Please start Docker and try again.
    pause
    exit /b 1
)

echo [INFO] Docker is running ✓

REM Check if docker-compose is available
docker-compose --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] docker-compose is not installed. Please install it and try again.
    pause
    exit /b 1
)

echo [INFO] docker-compose is available ✓

REM Create data directories if they don't exist
echo [INFO] Creating data directories...
if not exist "data\database" mkdir "data\database"
if not exist "data\cache" mkdir "data\cache"
if not exist "data\logs" mkdir "data\logs"
if not exist "data\logos" mkdir "data\logos"

echo [SUCCESS] Data directories created

REM Generate UUID for SSDP if not exists
if not exist "data\.device-uuid" (
    echo [INFO] Generating device UUID...
    powershell -Command "[System.Guid]::NewGuid().ToString()" > "data\.device-uuid"
    echo [SUCCESS] Device UUID generated
) else (
    echo [INFO] Using existing device UUID
)

REM Stop any existing containers
echo [INFO] Stopping any existing containers...
docker-compose down --remove-orphans >nul 2>&1

REM Build the application
echo [INFO] Building PlexTV container (this may take a few minutes)...
docker-compose build --no-cache

if errorlevel 1 (
    echo [ERROR] Container build failed!
    pause
    exit /b 1
)

echo [SUCCESS] Container built successfully!

REM Start the application
echo [INFO] Starting PlexTV application...
docker-compose up -d

if errorlevel 1 (
    echo [ERROR] Failed to start PlexTV!
    pause
    exit /b 1
)

echo [SUCCESS] PlexTV started successfully!

REM Wait for application to be ready
echo [INFO] Waiting for application to be ready...
set "timeout=30"
set "counter=0"

:wait_loop
if !counter! geq !timeout! goto timeout_reached

REM Test if application is responding
powershell -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:8080/health' -TimeoutSec 2; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto app_ready

timeout /t 2 /nobreak >nul
set /a counter+=2
echo|set /p="."
goto wait_loop

:timeout_reached
echo.
echo [WARNING] Application didn't respond within !timeout! seconds
echo [INFO] You can check the logs with: docker-compose logs -f
goto show_info

:app_ready
echo.
echo [SUCCESS] Application is ready!

:show_info
echo.
echo 🎉 PlexTV is now running!
echo ==========================
echo.
echo 📱 Web Interface:     http://localhost:8080
echo 🔍 Health Check:      http://localhost:8080/health
echo 📊 Metrics:          http://localhost:8080/api/metrics
echo 📺 Discovery:        http://localhost:8080/discover.json
echo.
echo 🔧 Management Commands:
echo   View logs:          docker-compose logs -f
echo   Stop application:   docker-compose down
echo   Restart:           docker-compose restart
echo   Update ^& rebuild:   build-local.bat
echo.

REM Test endpoints
echo [INFO] Testing application endpoints...

powershell -Command "try { Invoke-WebRequest -Uri 'http://localhost:8080/health' -TimeoutSec 5 | Out-Null; Write-Host '[SUCCESS] Health endpoint ✓' } catch { Write-Host '[WARNING] Health endpoint not responding' }" 2>nul

powershell -Command "try { Invoke-WebRequest -Uri 'http://localhost:8080/discover.json' -TimeoutSec 5 | Out-Null; Write-Host '[SUCCESS] Discovery endpoint ✓' } catch { Write-Host '[WARNING] Discovery endpoint not responding' }" 2>nul

powershell -Command "try { Invoke-WebRequest -Uri 'http://localhost:8080' -TimeoutSec 5 | Out-Null; Write-Host '[SUCCESS] Web interface ✓' } catch { Write-Host '[WARNING] Web interface not responding' }" 2>nul

echo.
echo [SUCCESS] Setup complete! 🎉
echo.
echo [INFO] Next steps:
echo 1. Open http://localhost:8080 in your browser
echo 2. Add some channels and streams
echo 3. Configure your Plex server to use PlexTV as a tuner
echo 4. Enjoy live TV in Plex!
echo.
echo [INFO] For troubleshooting, check: docker-compose logs -f
echo.
echo Press any key to open the web interface...
pause >nul

REM Open web interface in default browser
start http://localhost:8080
