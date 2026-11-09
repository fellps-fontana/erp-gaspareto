# fellps-fontana/fix-pedidos-espaco-vazio
- Periodo: 2026-11-09 -> 2026-11-09
- Sessoes: 2026-11-09
- Fluxo: Correcao

## Demanda
Tres ajustes visuais de mobile (iPhone) pedidos em lote: vao entre Resumo de
Producao e Valor Estimado em Pedidos; cabecalho do detalhe do lancamento do
Historico sob o X; campo de data da Nova Encomenda ocupando 1/4 da tela.
Um quarto item (Top 5 misturando kg e unidade) ja estava resolvido em
homologacao (commit 4022882) e nao gerou codigo.

## Tasks
Resolvidas inline pelo Kira (CSS/HTML pontual, sem regra de negocio), sem
arquivo de tasks.

### Vao entre Resumo de Producao e Valor Estimado
- Status final: concluida
- Voltou da revisao: nao
- Observacao: regressao do pagamento dividido/A receber. Em <=768px o
  `.summary-row` vira coluna e o `flex: 1 1 320px` do `.order-summary-header`
  passava a valer como altura (320px para ~84px de conteudo, vao de ~252px).
  Corrigido com `flex: 0 0 auto` no media query mobile.

### Cabecalho do detalhe do lancamento (Historico) sob o X
- Status final: concluida
- Voltou da revisao: nao
- Observacao: `.modal-fechar` e absoluto e o cabecalho nao reservava a area.
  Cabecalho em linhas (#numero + selos / data), `padding-right: 40px`, nome do
  cliente com margem e `overflow-wrap`. Chip Retirada passou a usar 🏪
  (caminhao fica so em Entrega) via `tipoEntregaIcone`.

### Campo de data da Nova Encomenda no mobile
- Status final: concluida
- Voltou da revisao: nao
- Observacao: em <=480px o `.schedule-row` empilhava label/date/botao. Agora
  em uma linha, input com 37px (= select de Vendedor), `appearance: none` e
  valor alinhado a esquerda (`::-webkit-date-and-time-value`). Binding de
  `scheduledDate` inalterado.

## Entrega por agent
- Kira: as tres correcoes inline.
- style/gon/mike: nao entraram (mudanca puramente visual, sem regra de negocio).

## Decisoes
- Botao de calendario da Nova Encomenda mantido no mobile — ele e "Adicionar
  ao Google Calendar", nao abre o seletor; escondê-lo removeria a funcao.
- Branch reposicionada de main para origin/homologacao antes das correcoes —
  main nao tinha a feature de pagamento dividido/A receber.

## Pendencias / debito tecnico
- Validar no iPhone real: Safari iOS (date nativo) nao e emulado pelo Chrome
  usado nos testes de layout.
- Resumo de Producao sem itens ainda renderiza a section vazia (no desktop
  ocupa espaco horizontal). Anterior a esta branch.

## Documentacao atualizada
- nenhuma (mudanca so de layout; docs de dominio nao descrevem CSS)

## Commits
142130c fix(pedidos): campo de data da Nova Encomenda em uma linha no mobile
5a29bad fix(historico): cabecalho do detalhe do lancamento nao fica sob o X no mobile
851b20d fix(pedidos): remove vao entre Resumo de Producao e Valor Estimado no mobile

## Arquivos alterados
 src/components/order/order.css                     | 32 ++++++++++++++++------
 src/components/order/order_mobile.css              |  6 ++++
 .../product-inventory/product-inventory.css        | 32 ++++++++++++++++++++--
 .../product-inventory/product-inventory.html       | 12 ++++----
 .../product-inventory/product-inventory.ts         |  4 +++
 5 files changed, 69 insertions(+), 17 deletions(-)
