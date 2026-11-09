# fellps-fontana/copepod
- Periodo: 2026-11-09 -> 2026-11-09
- Sessoes: SESSAO: 2026-11-09 15:14
- Fluxo: Implementacao (com ciclos de Correcao pós-revisão)
- Base: `homologacao` (`3e662a5`)

## Demanda
Controle da mensalidade que as empresas clientes pagam ao dono da plataforma,
gerenciado pelo super-admin: config por empresa, cobrança mensal automática e
idempotente, botão Recebi, e aviso de vencimento/atraso no painel de
Notificações da empresa. v1 sem gateway e sem bloqueio.

## Tasks
### TASK-038 — Esqueleto compilável (model, regras puras, service)
- Agent: killua (Kira gravou)
- Status final: CONCLUIDA
- Voltou da revisao: nao
- Observacao: killua sem ferramenta de escrita; Kira gravou seção 14, schema e esqueleto. Worktree sem node_modules (npm ci). `.kira/` no .gitignore.
### TASK-039 — RED: regras puras
- Agent: mike · Status final: CONCLUIDA · Voltou da revisao: nao
- Observacao: 40 testes RED; contrato de erro (MensalidadeInvalidaError) fixado no esqueleto a pedido do mike.
### TASK-040 — RED: firestore.rules
- Agent: mike · Status final: CONCLUIDA · Voltou da revisao: nao
- Observacao: 52 testes (15 RED, 37 negações já verdes pelo curinga).
### TASK-041 — Implementar subscription-rules.ts
- Agent: levi · Status final: CONCLUIDA · Voltou da revisao: nao
- Observacao: 40/40; duplicação de helpers de data e validação de 2 casas levadas à TASK-044.
### TASK-042 — Implementar rules
- Agent: levi · Status final: CONCLUIDA · Voltou da revisao: nao
- Observacao: 119/119; só adições.
### TASK-043 — RED: SubscriptionService
- Agent: mike · Status final: CONCLUIDA · Voltou da revisao: nao
- Observacao: 25 testes RED (emulador, rules reais) + casos de 2 casas.
### TASK-044 — Implementar SubscriptionService
- Agent: levi · Status final: CONCLUIDA · Voltou da revisao: nao
- Observacao: dedup via export de 4 helpers de recurrence-rules.ts.
### TASK-045 — GREEN + suíte
- Agent: mike · Status final: CONCLUIDA · Voltou da revisao: nao
- Observacao: suíte 691/691.
### TASK-046 — Tela Assinaturas
- Agent: hanzo · Status final: CONCLUIDA · Voltou da revisao: 1x (style — bloqueio na geração, listeners sem takeUntilDestroyed, texto duplicado)
### TASK-047 — Aviso no painel de Notificações
- Agent: hanzo · Status final: CONCLUIDA · Voltou da revisao: 1x (style — texto duplicado, catchError sem log)
### TASK-048 — Revisão (style)
- Agent: style · Status final: CONCLUIDA · Voltou da revisao: 2 rodadas PRECISA CORRIGIR, aprovado na 3ª
### TASK-050..053 — Correções da rodada 1 (mike RED, levi, mike GREEN, hanzo)
- Status final: CONCLUIDA
- Observacao: isolamento de falha por empresa, paidDate validado, COBRANCA_NAO_ENCONTRADA, companyId == docId nas rules, textoDoAviso único; suíte 706/706.
### TASK-054..055 — Correção da rodada 2 (mike RED, levi)
- Status final: CONCLUIDA
- Observacao: empresa com falha identificada pelo id do documento.
### TASK-049 — Gate de segurança (gon)
- Agent: gon · Status final: CONCLUIDA · Voltou da revisao: nao
- Observacao: aprovado; 3 observações de endurecimento (débito).

## Entrega por agent
- killua: modelagem (coleções próprias, ids determinísticos, rules), seção 14, schema, decomposição em tasks e esqueleto.
- levi: subscription-rules.ts, subscription-service.ts, blocos de rules; correções das rodadas 1 e 2.
- hanzo: tela `/admin/assinaturas`, item "Mensalidade" no sino da Home; correções da rodada 1.
- mike: testes RED/GREEN — rules (52+5 novos), regras puras (55), service (30); suíte final 707/707.
- style: rodada 1 (6 achados: isolamento de falha, paidDate, texto duplicado, bloqueio/listeners, erro sem código, companyId == docId); rodada 2 (falha identificada por config.companyId); rodada 3 aprovado.
- gon: aprovado; sem brecha entre tenants nem exposição de dados.

## Decisoes
- Coleções próprias (`subscriptions`, `subscriptionCharges`) em vez de campos em `companies` — owner/admin têm update em `companies`.
- Geração no cliente ao abrir Assinaturas (confirmado pelo usuário); Function agendada só em prod no futuro.
- Antecipar a competência seguinte quando a janela de aviso de 5 dias abre (confirmado) — senão vencimento no início do mês nunca avisaria antes.
- Desfazer pagamento pelo super-admin (confirmado) — corrige "Recebi" por engano.
- Aviso visível a todos os usuários da empresa, não desligável, sem chave Pix (confirmado).
- Falha de geração identificada pelo id do documento, sem preencher `companyId` (preencher mascararia config corrompida).
- PR contra `homologacao` (padrão das entregas em teste; prod só com pedido explícito).

## Pendencias / debito tecnico
- Sem abrir Assinaturas no mês, a cobrança não nasce e a empresa não é avisada (aceito na v1).
- Rules não validam tipos de `amount`/`dueDate`/`dueDay`/`active`, mês 13 em `competence`, nem chaves extras no update (gon, baixa).
- `getConfigs`/`getCharges` sem teste.
- CSS de modal/spinner duplicado entre telas (padrão do repo; extrair depois).
- Data de pagamento futura aceita — regra não definida (pergunta em aberto ao usuário).
- Deploy de rules no homolog necessário antes de testar (`npm run deploy:rules:staging`).

## Documentacao atualizada
- docs/backend/mensalidade.md — novo domínio.
- docs/backend/notificacoes.md — consolidado de docs/notificacoes.md (removido) + tipo mensalidade.
- docs/frontend/navegacao.md — novo; Home, /admin, /admin/assinaturas.

## Commits
```
c0b3650 feat(assinaturas): mensalidade da plataforma com aviso em Notificações
```
(+ commit de documentação e histórico desta branch)

## Arquivos alterados
```
 .claude/context/regra-de-negocio.md                | 114 +++++
 .claude/context/schema.dbml                        |  24 +
 .gitignore                                         |   3 +
 firestore.rules                                    |  49 ++
 src/app/app.routes.ts                              |   2 +
 src/components/home/home.css                       |  20 +
 src/components/home/home.html                      |  53 +-
 src/components/home/home.ts                        |  73 ++-
 src/components/subscriptions/subscriptions.css     | 168 +++++++
 src/components/subscriptions/subscriptions.html    | 117 +++++
 src/components/subscriptions/subscriptions.ts      | 245 ++++++++++
 src/components/super-admin/super-admin.html        |   1 +
 src/models/subscription-model.ts                   |  48 ++
 .../recurring-order-service/recurrence-rules.ts    |   8 +-
 .../subscription-rules.spec.ts                     | 328 +++++++++++++
 .../subscription-service/subscription-rules.ts     | 294 +++++++++++
 .../subscription-service.spec.ts                   | 543 +++++++++++++++++++++
 .../subscription-service/subscription-service.ts   | 209 ++++++++
 test/firestore.rules.spec.ts                       | 493 +++++++++++++++++++
 19 files changed, 2769 insertions(+), 23 deletions(-)
```
