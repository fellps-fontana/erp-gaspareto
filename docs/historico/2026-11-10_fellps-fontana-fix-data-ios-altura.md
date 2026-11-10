# fellps-fontana/fix-data-ios-altura
- Periodo: 2026-11-10 -> 2026-11-10
- Sessoes: SESSAO: 2026-11-10
- Fluxo: Correcao

## Demanda
Apos o PR #44, no iPhone os campos de data (ex.: Nova despesa > Vencimento e
Mercadoria recebida em) continuavam maiores que os outros inputs.

## Tasks
### Ajuste pos-entrega do PR #44 — altura do campo de data no iOS
- Agent: Kira inline (mudanca puramente visual, revisao inline)
- Status final: CONCLUIDA
- Voltou da revisao: nao
- Observacao: validado pelo usuario em homolog antes de ir para producao.

## Entrega por agent
- Kira: CSS global zerando padding vertical de ::-webkit-datetime-edit-* e min-height do valor.

## Decisoes
- Correcao global em src/styles.css (bug do WebKit), nenhuma tela individual alterada.

## Pendencias / debito tecnico
- nenhuma

## Documentacao atualizada
- nenhuma em docs/

## Commits
4ed46a6 fix(ui): campo de data mais alto que os outros inputs no iOS Safari

## Arquivos alterados
 src/styles.css | 24 ++++++++++++++++++++++++
 1 file changed, 24 insertions(+)
