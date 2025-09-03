@echo off
setlocal

rem === RUTAS (ajusta si renombraste la carpeta) ===
set "GIT_BIN=%~dp0tools\PortableGit\bin\git.exe"
set "APPDIR=%~dp0"

if not exist "%GIT_BIN%" (
  echo [ERROR] No se encontro git.exe en: %GIT_BIN%
  pause
  exit /b 1
)

rem Cambiar a la carpeta del proyecto (evitamos -C y problemas de comillas)
pushd "%APPDIR%" || (
  echo [ERROR] No se pudo cambiar a %APPDIR%
  pause
  exit /b 1
)

rem === PRIMERA VEZ: inicializa repo local y hace checkout del ultimo commit ===
if not exist ".git" (
  echo Inicializando repositorio local...
  "%GIT_BIN%" init .
  "%GIT_BIN%" remote add origin https://github.com/PredatorDevs/predatorbusiness-comedi-printer-server.git
  "%GIT_BIN%" fetch --depth=1 origin master
  "%GIT_BIN%" checkout -f FETCH_HEAD
  goto done
)

rem === SIGUIENTES EJECUCIONES: actualiza a ultimo commit ===
echo Descargando cambios...
"%GIT_BIN%" fetch --depth=1 origin master
"%GIT_BIN%" reset --hard FETCH_HEAD

:done
echo Proyecto actualizado.
popd
pause
