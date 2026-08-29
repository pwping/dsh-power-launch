@echo off
REM ASCII-only on purpose: cmd parses .bat files in the system ANSI codepage,
REM and non-ASCII bytes can silently corrupt line parsing (this broke the
REM powershell call once). UI text with Chinese lives in the UTF-8 BOM'd .ps1.
chcp 65001 >nul 2>&1
title DeepSeek Harness - Web Launcher

set "PATH=D:\Program Files\nodejs;%APPDATA%\npm;%PATH%"
set "npm_config_registry=https://registry.npmmirror.com"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dsh-launch.ps1" %*

if errorlevel 1 (
    echo.
    echo [dsh-launch] Start failed. Press any key to close this window...
    pause >nul
)
