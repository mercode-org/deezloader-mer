@echo off
echo Starting to compile.
echo The software will be compiled to /dist folder

:: Starting to compile
npm install && npm run dist:win64
pause
