@echo off
setlocal
set SCRIPT_DIR=%~dp0
set ENGINE_DIR=%SCRIPT_DIR%..\engine

set LLAMA_BIN=%ENGINE_DIR%\llama-server.exe
set MODEL=%ENGINE_DIR%\slm.gguf
if not defined OMNIWORKER_LOCAL_SLM_PORT set OMNIWORKER_LOCAL_SLM_PORT=8080

if not exist "%LLAMA_BIN%" ( echo [local-llm] llama-server.exe not found. & exit /b 1 )
if not exist "%MODEL%"      ( echo [local-llm] slm.gguf not found.        & exit /b 1 )

echo [local-llm] Starting llama-server on port %OMNIWORKER_LOCAL_SLM_PORT%...
"%LLAMA_BIN%" --model "%MODEL%" --alias slm --port %OMNIWORKER_LOCAL_SLM_PORT% --ctx-size 4096 --threads 4 --no-mmap --log-disable
