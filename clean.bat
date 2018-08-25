@echo off

:: Deleting some garbage
del yarn.lock /q >nul 2>nul
del package-lock.json /q >nul 2>nul

del app\package-lock.json /q >nul 2>nul
del app\yarn.lock /q >nul 2>nul

RD /S /Q node_modules >nul 2>nul
RD /S /Q app\node_modules >nul 2>nul

del /q dist\*.* >nul 2>nul
for /d %%i in (dist\*.*) do @rmdir /s /q "%%i"


:: Informing about that
@echo Deleted some garbage.
pause