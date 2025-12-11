@echo off
REM ============================================================================
REM  File: launch_RPS_Predictor.bat
REM  Purpose: Fully portable and self-repairing launcher for the
REM            Rock-Paper-Scissors Predictor game
REM  Author: John Weaver
REM  Description:
REM     This batch file launches the RPS Predictor React app using npm.
REM     It is designed to be "portable" — meaning it automatically detects
REM     the folder it's in and runs the correct commands without needing
REM     any manual path adjustments.
REM
REM     It is also "self-repairing" — if dependencies are missing,
REM     it automatically installs them before running the app.
REM
REM     To use:
REM       1. Save file inside your project folder (same place as package.json).
REM       2. Double-click to start the game.
REM       3. The script opens the local Vite dev server and your browser.
REM ============================================================================

REM === Automatically sets project directory to same folder as .bat file =======
REM  - %~dp0 expands to the drive letter and path of this batch file.
REM  - Makes the script portable; no need to edit paths when changing folder.
set "PROJECT_DIR=%~dp0"

REM === Tells Windows to switch drives if needed ===============================
REM === Script will detect and switch to the correct drive automatically, as
REM === long as the .bat file is inside your project folder ===
cd /d "%PROJECT_DIR%"

echo ================================================================
echo  Launching Rock-Paper-Scissors Predictor
echo  Project directory: %PROJECT_DIR%
echo ================================================================
echo.

REM === Check if Node.js is installed ==========================================
REM  - The "where" command searches for executables in the system PATH.
REM  - If not found, it exits with an error message.
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed on this system.
    echo Please install Node.js from https://nodejs.org/ and try again.
    pause
    exit /b
)

REM === Check if npm (Node Package Manager) is available ======================
REM  - npm is included with Node.js, so if Node is found, npm should be too.
REM  - If not found, it exits with an error message.
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: npm was not found in PATH.
    echo Please reinstall Node.js or add npm to your PATH.
    pause
    exit /b
)

REM === Check for the node_modules folder (where dependencies live) ============
REM  - If missing, run npm install automatically.
REM  - This ensures the app will run even on a fresh computer or new copy. ===
REM  - If npm install fails (e.g., no internet), it exits with an error.
if not exist "node_modules" (
    echo.
    echo Node modules not found. Installing dependencies...
    echo This may take a few minutes the first time.
    echo.
    npm install
    if %errorlevel% neq 0 (
        echo.
        echo ERROR: npm install failed. Please check your internet connection.
        pause
        exit /b
    )
)

REM === Start the development server in a new terminal window ==================
REM  - "start cmd /k" command opens a new Command Prompt window & keeps it open.
REM  - "npm run dev" runs the Vite development server defined in package.json.
start cmd /k "npm run dev"

REM === Adding wait time (in seconds) to give the server time to start =========
REM  - Adjust the number (3) if needed for slower systems.
timeout /t 3 >nul

REM === Open the local game page in your default browser =======================
REM  - The default Vite dev server runs at http://localhost:5173
REM  - You can change this if your vite.config specifies a different port.
start "" http://localhost:5173/

REM === Exit this launcher window ============================================
REM  - The actual server stays running in the other Command Prompt window.
REM  - This just closes the small launcher window.
exit
