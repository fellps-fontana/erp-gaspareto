# Módulo: Contas a Pagar (`bills`)

## Visão geral

Tela dedicada (`src/components/bills/bills.ts`) pra gerenciar contas com
status sequencial `pendente → recebido → pago`. Esta entrega corrigiu uma
cadeia de bugs de produção (erro ao pagar, conta criada que não aparecia) e
adicionou escopo temporal fixo à listagem: só mostra pendentes (sempre) e
recebidas/pagas resolvidas no mês corrente. Também fechou o mesmo bug de
filtro na segunda tela que cria bills, dentro do módulo de Gestão
(`product-inventory.ts`).

## Regras de negócio implementadas

Ver `.claude/context/regra-de-negocio.md` seção 7 (Contas a pagar/receber
— CRÍTICA na máquina de estado). Resumo:

- Máquina de estado `pendente → recebido → pago` (avanço sequencial, uma
  etapa por vez) — **não foi alterada** por nenhuma correção desta entrega,
  confirmado pelo `style` em todas as rodadas de gate.
- **Escopo temporal da listagem (regra nova, não crítica)**: conta
  `pendente` sempre aparece, qualquer que seja a data. Conta `recebido`/
  `pago` só aparece se `receivedAt`/`paidAt` cair no mês corrente — sem
  seletor de mês na UI, é sempre "mês atual", fixo. Decidido com o usuário
  em 2026-08-16.
- Reset condicional de filtro de status ao criar conta nova: se o filtro
  ativo excluía `'pendente'` (estava em `'recebido'`/`'pago'`), a conta
  recém-criada ficava invisível — corrigido nos 3 pontos de criação de bill
  do sistema (`bills.ts`, `confirmarCompra()` e `gerarBillDeProdutoCompra()`
  em `product-inventory.ts`).

## Causa raiz dos bugs de produção reportados

Não era divergência de nomes de status entre camadas (front/back/schema
sempre bateram). Duas causas de infraestrutura, ambas fora do código do
módulo:

1. **`firestore.rules` multi-tenant nunca publicada em produção** desde a
   migração single-tenant → multi-tenant (`backfill-companyid.mjs` só
   migrou os dados, o passo seguinte documentado no próprio script —
   publicar rules/indexes — ficou pendente). Rejeitava update/create/delete
   silenciosamente (sem mensagem específica, por causa dos `catch {}` sem
   parâmetro).
2. **Índice composto de `purchaseProducts` (`companyId`+`createdAt`) nunca
   deployado em produção** — query com `orderBy` falhava inteira
   (`failed-precondition`), engolida pelo mesmo padrão de `catch`/
   `subscribe` sem tratamento de erro.

Os dois foram deployados manualmente em produção durante esta sessão
(`firebase deploy --only firestore:rules,firestore:indexes --project
default`) — fora do PR, ação de infra confirmada com o usuário antes de
rodar.

## Modelo de dados / telas entregues

- **`src/components/bills/bills.ts`**: 4 `catch {}` sem parâmetro viraram
  `catch (error)` com `console.error` antes de notificar o usuário
  (`ngOnInit`/`getBills().subscribe`, `avancarStatus`, `salvarConta`,
  `confirmDelete`); `salvarConta()` reseta `filtroStatus` pra `'todos'`
  incondicionalmente ao criar; novo escopo mensal via
  `estaNoEscopoMensal()`/`dataEstaNoMesCorrente()` + getter
  `billsNoEscopoMensal`, aplicado antes de `filtroStatus` em
  `billsFiltradas` e nos totais (`totalPendente/totalRecebido/totalPago`,
  `countByStatus`).
- **`src/components/product-inventory/product-inventory.ts`**: método
  privado `resetFiltroContasStatusSeNecessario()` (reset condicional, só
  mexe se o filtro estava em `'recebido'`/`'pago'`), chamado em
  `confirmarCompra()` e `gerarBillDeProdutoCompra()`.
- **`firestore.indexes.json`** / **`firestore.rules`**: já existiam
  corretos no repo — só precisaram ser publicados em produção (nenhuma
  mudança de conteúdo nesta entrega).

## Lacunas conhecidas / pendências

- 4 pontos de `.subscribe(data => ...)` sem callback de erro em
  `product-inventory.ts` (listas de produto/estoque/compras/clientes,
  ~linhas 203-229) continuam sem tratamento — mesmo padrão já corrigido em
  `bills.ts`, não fechado nesta entrega.
- Nomenclatura `purchaseProducts` (camelCase, real) diverge de
  `"purchase-products"` (kebab-case) documentada em `schema.dbml:156-158`
  — nota de documentação desatualizada, não afeta o código.

## O que cada agent entregou

- **hanzo**: única frente de código desta entrega (módulo é client-only,
  sem backend próprio — `levi`/`mike`/`killua` não entraram em nenhuma
  rodada de implementação; `killua` só foi usado uma vez, pra redigir a
  regra nova em `regra-de-negocio.md`, sem tool de escrita disponível no
  ambiente — Kira aplicou o texto mecanicamente). 5 rodadas de execução:
  fix de filtro+catches, TASK-033, TASK-034, correção de race condition,
  extração de duplicação.
- **style**: gate em 5 rodadas ao longo da entrega. Achados reais: race
  condition de `serverTimestamp()` (timestamp `null` na escrita otimista
  local fazia bill recém-classificada sumir da tela por um instante) e
  duplicação de código exata entre `confirmarCompra()` e
  `gerarBillDeProdutoCompra()` depois da TASK-034. Demais rodadas
  aprovadas de primeira.

## Notas operacionais

- Durante a sessão, outra sessão/painel esteve trabalhando em paralelo no
  mesmo working directory (feature de super-admin multi-empresa,
  `tenant-service.ts`/`functions/`) — Kira isolou toda a investigação e
  commits pra tocar só nos arquivos do escopo desta entrega, nunca a
  branch/arquivos da outra sessão. Fix de CI (abaixo) foi feito num `git
  worktree` separado por causa disso.
- Deploy automático pra produção (GitHub Actions) estava quebrado desde
  2026-08-15 por conflito de peer dependency (`firebase-tools@^15.26.0`
  incompatível com `@angular/fire@20.0.1`, que exige `^14.0.0`) — não
  relacionado a este módulo, mas bloqueava o merge desta entrega. Corrigido
  via PR separado (`fix/ci-deps` → `main`), downgrade pra
  `firebase-tools@^14.27.0`.
