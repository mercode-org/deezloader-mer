@echo off

:: Deleting some garbage
RD /S /Q node_modules >nul 2>nul
RD /S /Q app\node_modules >nul 2>nul

del /q dist\*.* >nul 2>nul
for /d %%i in (dist\*.*) do @rmdir /s /q "%%i"


:: Informing about that
@echo Deleted some garbage.
pause
