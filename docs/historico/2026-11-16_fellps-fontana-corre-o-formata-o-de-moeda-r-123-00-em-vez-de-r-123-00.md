# fellps-fontana/Correção-Formatação-de-moeda-R-123.00-em-vez-de-R-123-00
- Periodo: 2026-11-16 -> 2026-11-16
- Sessoes: SESSAO: 2026-11-16
- Fluxo: Correcao

## Demanda
Valores em reais apareciam com ponto decimal (`R$ 123.00`, `R$1,234.56`) em vez do
padrao brasileiro. Pedido: centralizar a formatacao pt-BR e aplicar em todas as telas,
sem alterar valores gravados.

## Tasks
### TASK-062 — Formatacao de moeda pt-BR em todas as telas
- Agent: hanzo
- Status final: CONCLUIDA
- Voltou da revisao: nao (revisao inline do Kira — mudanca visual, sem regra de negocio)
- Observacao: causa raiz era a ausencia de LOCALE_ID (Angular em en-US). Suite 1023/1023 verde; build dev e prod ok.

## Entrega por agent
- hanzo: locale pt-BR + DEFAULT_CURRENCY_CODE BRL em app.config; ~60 `R$ {{ x | number:'1.2-2' }}` e todos `currency:'BRL'` trocados por `| currency` em 12 templates; preco cru em order.html corrigido; spec de product-inventory alinhado ao locale.
- Kira: diagnostico, revisao inline, build de producao, documentacao.

## Decisoes
- Locale global em vez de helper/pipe proprio — o pipe `currency` do Angular com LOCALE_ID pt-BR ja e o formatador unico; evita codigo novo.
- Padronizar exibicao monetaria em `| currency` (sem `R$` literal no template) para um unico padrao.
- Labels de input ("Valor (R$)") e campos de digitacao mantidos.

## Pendencias / debito tecnico
- Nao validado visualmente no navegador (cobertura via build + specs).

## Documentacao atualizada
- docs/frontend/formatacao.md — novo: padrao vigente de locale/moeda/numeros/datas.

## Commits
```
0135d79 fix(ui): formatacao de moeda pt-BR (R$ 1.234,56) em todas as telas
8ff9f1c Merge pull request #47 from fellps-fontana/homologacao
42a393f Merge pull request #45 from fellps-fontana/homologacao
fd389ae Merge pull request #41 from fellps-fontana/homologacao
```

## Arquivos alterados
```
 src/app/app.config.ts                              |  8 ++-
 src/components/delivery-route/delivery-route.html  |  2 +-
 src/components/expense-form/expense-form.html      |  6 +-
 .../expense-report-panel/expense-report-panel.html |  2 +-
 src/components/expenses/expenses.html              | 22 +++---
 .../gastos-breakdown-modal.html                    |  6 +-
 src/components/home/home.html                      |  6 +-
 .../order-installments/order-installments.html     |  8 +--
 .../order-receivables/order-receivables.html       |  8 +--
 src/components/order/order.html                    | 30 ++++-----
 src/components/pdv/pdv.html                        | 22 +++---
 .../product-inventory/product-inventory.html       | 78 +++++++++++-----------
 .../product-inventory/product-inventory.spec.ts    | 12 +++-
 src/components/subscriptions/subscriptions.html    |  8 +--
 14 files changed, 115 insertions(+), 103 deletions(-)
```
