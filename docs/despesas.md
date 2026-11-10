# Módulo: Despesas (`expenses`, `expenseCategories`, `expenseSeries`)

## Visão geral

Substitui Contas a Pagar (`bills`) e Produtos de Compra (`purchaseProducts`).
Toda saída de dinheiro da empresa vira uma **despesa** com vencimento
obrigatório e categoria. A categoria tem tipo `custo_producao` (já entra no
CMV) ou `despesa_operacional` (desconta do Resultado). A tela `/contas`
("Despesas") navega por mês. O Balanço passa a calcular
**Resultado = Faturamento − CMV − Despesas operacionais**, por competência
(data de vencimento). Entregue no PR #39 (base `homologacao`), em 2026-10-22.

## Regras de negócio implementadas

Fonte: `.claude/context/regra-de-negocio.md` §7 (Despesas), §8 (Categorias e
Resultado), §11 (módulo `compras` removido) e §14 (Migração). Resumo:

- **Status** `a_pagar` → `pago` só via "Paguei" (transação). "Vencida" é
  derivada (`a_pagar` com `dueDate` < hoje), nunca gravada. "Chegou" grava
  `goodsReceivedDate` e substitui o antigo status `recebido`.
- **Datas** sempre date-only `YYYY-MM-DD`, com ano entre 2000 e 2100.
- **Categorias**: as 12 padrão são criadas uma única vez (seed único). Uma
  padrão excluída não volta. O tipo é imutável. Categoria com vínculo só pode
  ser arquivada. Compra de mercadoria e Insumos/Embalagem são
  `custo_producao` (decisão D1).
- **Parcelamento**: N despesas calculadas em centavos, com o resto na última
  parcela. Os vencimentos são calculados a partir da 1ª data, não encadeados.
- **Recorrência** (`expenseSeries`): o catch-up gera todas as ocorrências
  perdidas até o fim do mês. A idempotência vem da marca-d'água
  `generatedThrough` e do id `${seriesId}_${dueDate}`, então ocorrência
  apagada não ressuscita. Limites (§7.3): âncora de no máximo 24 meses atrás,
  1 lote de 399 por série por carregamento, template revalidado e
  `companyId` só o da sessão.
- **Resultado** (§8.2): despesas operacionais por `dueDate` no período,
  pagas ou não. Custo de produção fica fora do Resultado e aparece só como
  informativo ("já incluso no CMV") no modal Gastos. "Pago no mês" continua
  como visão de caixa.
- **Validação no service** (as rules não validam campos): valor >= 1 centavo
  e finito, datas válidas e categoria da própria empresa (arquivada não
  entra em criação). Campos gerenciados pelo service (status, paidDate,
  origem, série, parcela) não aceitam patch nem input.

## Modelo de dados e telas

- **Coleções:** `expenses`, `expenseCategories`, `expenseSeries`, todas com
  `companyId` e em `isOperationalCollection`. Índice composto `expenses`
  (`companyId` ASC, `dueDate` DESC). Detalhe em `schema.dbml`.
- **Services:**
  - `ExpenseScheduleService` (puro): parcelas, datas, ocorrências.
  - `ExpenseReportService` (puro): `groupForMonth` é a fonte única de cards
    e grupos, `applyFilters`, somas e breakdown.
  - `ExpenseService`, `ExpenseCategoryService`, `ExpenseRecurrenceService`.
  - Módulos de apoio: `expense-validation` e `expense-firestore-guards`.
- **Telas:**
  - `ExpensesComponent` (`/contas`): navegação por mês; cards Vencidas, A
    pagar no mês e Pago no mês; lista agrupada; ações Paguei, Chegou,
    Editar, Encerrar recorrência e Excluir; filtros.
  - `ExpenseFormComponent`: despesa única, parcelada ou recorrente.
  - `ExpenseCategoryManagerComponent`.
  - Balanço (`product-inventory`): sub-aba Despesas (`ExpenseReportPanel`
    com pizza e barras de 12 meses) e card Gastos com
    `GastosBreakdownModal`.
- **Migração:** `scripts/migrate-bills-to-expenses.mjs` + núcleo puro
  `scripts/lib/expense-migration-core.mjs`.
  - Roda só no `hologaerp`.
  - Sem `--apply` não grava nada (dry-run padrão); `--rollback` desfaz.
  - Idempotente e nunca altera o legado.
  - Rodado em homolog em 2026-10-22: 3 empresas, 16 despesas, 8 séries, 36
    categorias, 21 itens `migracaoRevisar`. A 2ª passada criou 0.

## Lacunas e pendências

- **Validação com a cliente** (TASK-101) e os itens `[CONFIRMAR]` da regra:
  - desfazer pagamento;
  - boleto e transferência como forma de pagamento;
  - "Vencidas" global;
  - heurística de categoria na migração.
- **Escrita por qualquer papel da empresa:** qualquer usuário da empresa
  grava despesas e séries, igual às demais coleções. Restringir a
  owner/admin é decisão de produto em aberto.
- **Produção:** não migrada. O script recusa produção, e habilitar exige
  task nova. Depois do cutover, purgar `bills`/`purchaseProducts` das rules,
  dos índices e do banco.
- **Melhorias opcionais registradas pelo `style`:**
  - helper único de "categoria ativa da empresa";
  - renomear `expense-firestore-guards` (colide com `src/guards`);
  - `ConfigService` sem spec para o doc legado com `compras: true`;
  - subscriptions do `product-inventory` sem cleanup;
  - `hoje` fixo enquanto a tela está aberta.

## O que cada agent entregou

- **killua:** arquitetura (coleções novas em vez de migrar `bills`
  in-place, datas date-only, série com marca-d'água), texto do context,
  esqueletos e a fila de 30 tasks.
- **mike:** TDD em todas as regras críticas. Suítes finais:
  - Karma 914 (inclui 76 de despesas/categorias e 46 de recorrência);
  - `test:rules` 115;
  - `test:migration` 68.

  Pegou falsos positivos do tipo "`toBeRejected` aceita not implemented" e
  uma bomba-relógio de data nos fixtures.
- **levi:** services, migração, rules e índices, lógica do Balanço, remoção
  do legado, seed da demo e extração dos guards.
- **hanzo:** formulário, gerenciador de categorias, tela Despesas, painel do
  relatório e modal Gastos, template do Balanço e o ✕ padrão nos modais.
- **style** (várias rodadas): pagamento por fora do "Paguei"; categoria
  padrão ressuscitando; seed pulado por clique rápido; `confirm()` nativo;
  helpers duplicados; erro técnico vazando para o usuário.
- **gon:** NaN e data inválida gravados; input sujo na criação; categoria
  de outra empresa; DoS por âncora antiga (~100k docs por carregamento);
  guard de produção do script validado.

## Notas operacionais

- No merge com `homologacao`, as tasks deste módulo foram renumeradas de
  TASK-035..064 para **TASK-073..102** (colisão com Pedidos).
- `docs/bills.md` está obsoleto (o módulo foi substituído por este).
- O seed da demo (`npm run seed:demo:hml`) já grava no modelo novo, mas
  aborta se a conta demo já tiver produtos. A demo no hologa recebeu as
  despesas pela migração, não pelo seed.
