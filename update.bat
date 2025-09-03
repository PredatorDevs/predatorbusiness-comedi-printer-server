@echo off
setlocal

set GIT_BIN=%~dp0tools\PortableGit\bin\git.exe
set APPDIR=%~dp0

if not exist "%GIT_BIN%" (
  echo ❌ No se encontró git.exe en %GIT_BIN%
  pause
  exit /b 1
)

rem 1) Inicializar una vez
if not exist "%APPDIR%\.git" (
  echo 🔄 Inicializando repo...
  "%GIT_BIN%" init "%APPDIR%"
  "%GIT_BIN%" -C "%APPDIR%" remote add origin https://github.com/PredatorDevs/predatorbusiness-comedi-printer-server.git
  "%GIT_BIN%" -C "%APPDIR%" fetch --depth=1 origin master
  "%GIT_BIN%" -C "%APPDIR%" checkout -f FETCH_HEAD
  goto done
)

rem 2) Actualizar
echo ⏬ Descargando cambios...
"%GIT_BIN%" -C "%APPDIR%" fetch --depth=1 origin master
"%GIT_BIN%" -C "%APPDIR%" reset --hard FETCH_HEAD

:done
echo ✅ Proyecto actualizado.
pause
