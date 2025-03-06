@echo off
REM Obtiene el directorio donde se encuentra el archivo batch
set MYVSCODEDIR=%~dp0

REM Comando para abrir Visual Studio Code con la carpeta especificada
code "%MYVSCODEDIR%"