# fellps-fontana/fix-super-admin-contador
- Periodo: 2026-11-10 -> 2026-11-10
- Sessoes: SESSAO: 2026-11-10
- Fluxo: Correcao

## Demanda
Duas correcoes pequenas e independentes, num PR para homologacao:
(1) super-admin dentro de outra empresa nao conseguia criar pedido
("Missing or insufficient permissions") porque a rule de counters/{companyId}
nao tinha o bypass de isSuperAdminUser(); (2) no iOS Safari o input de data
vazava da borda do modal e o texto ficava centralizado.

## Tasks
### TASK-060 — Super-admin no contador de pedidos (counters/{companyId})
- Agent: Kira inline (diff exato veio no pedido)
- Status final: CONCLUIDA
- Voltou da revisao: nao (style aprovou com nit cosmetico na regra, ajustado; gon aprovou)
- Observacao: 2 testes novos de rules; regra-de-negocio registra o bypass.

### TASK-061 — Campo de data vazando no iOS Safari
- Agent: Kira inline (CSS exato veio no pedido)
- Status final: CONCLUIDA
- Voltou da revisao: nao
- Observacao: so src/styles.css; nenhuma tela individual mudou.

## Entrega por agent
- killua: nao entrou (sem estrutura nova)
- levi / hanzo: nao despachados; alteracao aplicada inline pelo Kira conforme especificacao do usuario
- mike: nao entrou (sem regra critica de calculo/estado)
- style: APROVADO; obs: quebra de linha no paragrafo da regra (corrigida); min-height 44px vale para os 20 campos de data
- gon: APROVADO; baixa: counters sem validacao de formato do valor (risco preexistente, nao ampliado)

## Decisoes
- Bypass de counters/{companyId} igual ao das colecoes operacionais — super-admin opera a empresa selecionada, e criar pedido exige o contador.
- Correcao do iOS em CSS global (input[type=date|datetime-local|time|month]) em vez de tela a tela — os 20 campos em 11 telas herdam.

## Pendencias / debito tecnico
- Deploy das rules em homolog e merge na main: manuais, depois da revisao.
- Validacao visual no iPhone (homolog) nas telas listadas no aceite, e checar Android/desktop (icone de calendario no Chrome).
- docs/multi-tenant.md nao foi atualizado (restricao do pedido: nao tocar outros arquivos); a regra-de-negocio.md ja registra o bypass.

## Documentacao atualizada
- nenhuma em docs/ (ver pendencias)

## Commits
6ebf351 fix: super-admin usa o contador de pedidos e campo de data no iOS

## Arquivos alterados
 .claude/context/regra-de-negocio.md |  6 +++++-
 firestore.rules                     |  7 ++++++-
 src/styles.css                      | 24 ++++++++++++++++++++++++
 test/firestore.rules.spec.ts        | 26 ++++++++++++++++++++++++++
 4 files changed, 61 insertions(+), 2 deletions(-)
