@echo off
echo ================================
echo   TextLens Frontend Setup
echo ================================
echo.

:: Check Node
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found. Please install Node.js 18+ from https://nodejs.org
    pause
    exit /b 1
)

echo Installing dependencies...
call npm install

echo.
echo ================================
echo   Starting frontend on port 3000
echo   Open http://localhost:3000
echo ================================
echo.

call npm run dev
pause
