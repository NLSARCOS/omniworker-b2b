#!/bin/bash
# CodeGraph CLI wrapper - permite a agentes que no tienen MCP directo consultar el grafo
# Uso: ./codegraph-query.sh <comando> [args...]

PROJECT_PATH="/Users/nelsonsarcos/Documents/Simplet Pyects/aass2"
CODEGRAPH_BIN="/usr/local/bin/codegraph"

if [ -z "$1" ]; then
    echo "Uso: codegraph-query.sh <comando> [args...]"
    echo "Comandos disponibles:"
    echo "  search <símbolo>     - Buscar símbolo por nombre"
    echo "  callers <símbolo>    - Ver quién llama a esta función"
    echo "  callees <símbolo>    - Ver qué llama esta función"
    echo "  impact <símbolo>     - Ver impacto de cambios"
    echo "  node <símbolo>       - Ver detalles de un símbolo"
    echo "  files [ruta]         - Ver estructura de archivos"
    echo "  context <tarea>       - Generar contexto para una tarea"
    echo "  status               - Ver estado del índice"
    exit 1
fi

cd "$PROJECT_PATH" 2>/dev/null || exit 1

case "$1" in
    search)
        $CODEGRAPH_BIN query "$2" 2>/dev/null || echo "No encontrado: $2"
        ;;
    callers)
        $CODEGRAPH_BIN query "callers:$2" 2>/dev/null || echo "No encontrado: $2"
        ;;
    callees)
        $CODEGRAPH_BIN query "callees:$2" 2>/dev/null || echo "No encontrado: $2"
        ;;
    impact)
        $CODEGRAPH_BIN query "impact:$2" 2>/dev/null || echo "No encontrado: $2"
        ;;
    node)
        $CODEGRAPH_BIN query "node:$2" 2>/dev/null || echo "No encontrado: $2"
        ;;
    files)
        $CODEGRAPH_BIN files "${2:-.}" 2>/dev/null
        ;;
    context)
        $CODEGRAPH_BIN context "$2" 2>/dev/null
        ;;
    status)
        $CODEGRAPH_BIN status 2>/dev/null
        ;;
    sync)
        $CODEGRAPH_BIN sync 2>/dev/null && echo "Sincronizado"
        ;;
    *)
        echo "Comando desconocido: $1"
        exit 1
        ;;
esac