@echo off
echo ================================
echo   TextLens OCR Backend Setup
echo ================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Please install Python 3.9+ from https://python.org
    pause
    exit /b 1
)

:: Create venv if not exists
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)

:: Activate venv
call venv\Scripts\activate.bat

:: Install dependencies
echo Installing dependencies (this may take a few minutes on first run)...
pip install -r requirements.txt --quiet

echo.
echo ================================
echo   Starting backend on port 8000
echo   Open http://localhost:8000/health to verify
echo ================================
echo.

python main.py
pause
