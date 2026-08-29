@echo off
REM ASCII-only on purpose (see dsh-launch.bat). Invoked by dsh-launch.ps1 in a
REM HIDDEN console window; this script owns its redirection so crash output
REM always lands in the log file.
chcp 65001 >nul 2>&1
setlocal
set "PATH=D:\Program Files\nodejs;%APPDATA%\npm;%PATH%"
set "npm_config_registry=https://registry.npmmirror.com"

echo ==== dsh web start at %date% %time% (port %1) ==== >> "%~dp0dsh-web.log"
dsh web --port %1 --no-open >> "%~dp0dsh-web.log" 2>&1
echo ==== dsh web exited at %date% %time% code %errorlevel% ==== >> "%~dp0dsh-web.log"
