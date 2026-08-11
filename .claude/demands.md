
## DEMANDA — 2026-07-18T03:05:57.235Z
STATUS: TRIADA
TITULO: Na aba pedidos poder filtrar por mais antigo
DETALHE: Ordenação "mais antigo" já existe implementada (order.ts/order.html,
propriedade sortOrder). Gap real encontrado: o filtro "Todos" usa
getPendingOrders(), que exclui status finished/canceled — não é "todos" de
fato. Virou TASK-025 em .claude/tasks.md.
