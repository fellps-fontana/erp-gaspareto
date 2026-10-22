# Regras de Negócio — ERP Gaspareto

> Fonte da verdade do domínio. Extraído do código existente (services e models
> em `src/`). Regras marcadas **[CRÍTICA]** envolvem estoque, dinheiro ou
> transição de estado — qualquer mudança nelas passa por executor especializado
> + revisão (`style`), nunca decidida sozinha por quem orquestra. Pontos que o
> código não deixa claro estão marcados com ⚠️ e precisam confirmação do usuário.

## 1. Visão geral do domínio

ERP para um negócio de venda de produtos com controle de estoque, atendimento
via comandas (balcão/mesa), pedidos com entrega, despesas (contas a pagar) e
cadastro de clientes. Módulos podem ser ligados/desligados por empresa via
`ConfigService` (`company-config.ts`).

Módulos existentes: **PDV**, **Pedidos**, **Gestão** (estoque + relatórios,
com sub-aba Clientes), **Rotas** (entrega), **Despesas** (rota `/contas`,
chave de módulo `contas`).

## 2. Estoque (`products`) — [CRÍTICA]

- Todo produto tem `stock` (quantidade), `buyPrice` (custo) e `sellPrice` (venda).
- **Baixa de estoque é sempre transacional** (`runTransaction`): lê o estoque
  atual, valida se é suficiente, só então decrementa. Nunca decrementa sem
  checar disponibilidade antes, dentro da mesma transação.
- **Estoque insuficiente bloqueia a operação** — a transação lança erro e
  reverte tudo (venda, comanda ou pedido não é criado/avançado).
- Pontos que decrementam estoque: `SaleService.processSale` (quando
  `updateStock=true`), `ComandaService.addComanda`,
  `ComandaService.addToExistingComanda`, `OrderService.markAsDelivered`.
- Pontos que devolvem estoque (estorno): `SaleService.cancelSale`,
  `ComandaService.deleteComanda`, `OrderService.cancelOrder` (só se o pedido
  já estava `delivered`), `PurchaseService.deletePurchase`.
- **Compra de produto (entrada de estoque)** (`PurchaseService.addPurchase`):
  incrementa `stock` e **sobrescreve `buyPrice`** do produto com o valor
  unitário da nova compra — ou seja, o preço de custo do produto é sempre o
  da última compra registrada, não uma média ponderada. Confirmado com o
  usuário (2026-08-11): comportamento é intencional, mantém-se como está —
  não usar FIFO/média ponderada.
- Estorno de compra (`deletePurchase`) é negado se o estoque atual for menor
  que a quantidade da compra a estornar (não deixa estoque negativo).
- **Entrada de estoque não gera conta a pagar.** Decidido com o usuário
  (2026-10-20): a opção "gerar conta a pagar" da entrada de estoque
  (Gestão > Estoque > 📦, `confirmarCompra`) foi removida. Motivo: a `bill`
  gerada, quando paga, entrava em **Gastos** no Balanço, e o custo do mesmo
  produto entrava de novo no **CMV** ao ser vendido — o Resultado Final
  descontava a compra de mercadoria duas vezes. A entrada só soma
  quantidade e atualiza o custo (`addPurchase`). Contas antigas geradas
  por essa opção foram tratadas na migração para Despesas (§14).

## 3. Vendas (`sales`) — [CRÍTICA]

- Toda venda tem `sale_type`: `'pdv'` (balcão) ou `'order'` (originada de um
  pedido finalizado). `customerId` só é preenchido em vendas do tipo `order`
  com cliente vinculado — vendas de PDV nunca têm `customerId`.
- `paymentMethod`: `'dinheiro' | 'pix' | 'cartao' | 'cheque'` (enum
  `PaymentMethod`, em `src/models/sell-model.ts`), com
  `PAYMENT_METHOD_LABELS: Record<PaymentMethod, string>` mapeando cada valor
  pro rótulo pt-BR de exibição. Escopo real hoje: só `Sale`s originadas de
  Pedidos (`sale_type: 'order'`, via `OrderService.finalizeOrder` — seção 5)
  usam os 4 valores. PDV e Comandas não mudaram — continuam gerando venda só
  com `'dinheiro'`/`'pix'` na prática (o enum é compartilhado e mais largo,
  mas a UI deles não expõe as opções novas).
- `installments?: number` (novo campo em `Sale`): metadado de parcelamento —
  `1`/ausente = à vista, `N` = parcelado em N vezes. **Não** gera controle de
  parcela individual nem lançamento em `bills`/Contas a Receber, é só
  informação de exibição/filtro. Sempre forçado a `1` quando
  `paymentMethod === PaymentMethod.PIX` (Pix não parcela) — trava aplicada na
  camada de serviço, não só na UI (ver seção 5).
- Cada item de venda guarda `priceAtSale` **e** `priceAtCost` no momento da
  venda (snapshot) — o lucro é calculado sobre esses valores congelados, não
  sobre o preço atual do produto. Isso preserva o histórico de margem mesmo
  se o preço do produto mudar depois.
- Cancelamento de venda (`cancelSale`) devolve todo o estoque dos itens e
  marca a venda como `status: 'canceled'` (não apaga o documento).

## 4. Comandas (`comandas`) — [CRÍTICA]

- Fluxo de atendimento tipo bar/restaurante: uma comanda é aberta
  (`status: 'open'`), recebe itens (com baixa de estoque imediata), e é
  fechada (`status: 'closed'`) ao finalizar.
- `addToExistingComanda`: se o produto adicionado já existe na comanda, soma
  a quantidade ao item existente em vez de duplicar a linha.
- Excluir uma comanda aberta devolve o estoque de todos os itens antes de
  apagar o documento.
- ⚠️ Não há, no código revisado, o passo que transforma uma comanda fechada em
  registro de `Sale` — confirmar com o usuário se esse vínculo existe em
  algum componente não lido ou se é uma lacuna.

## 5. Pedidos (`orders`) — [CRÍTICA]

- **Numeração sequencial por empresa** (`orderNumber`): gerada em
  `OrderService.addOrder` via `runTransaction` sobre `counters/{companyId}`
  (lê `nextOrderNumber`, usa no pedido novo, grava `nextOrderNumber + 1`) —
  atômico mesmo com dois pedidos criados ao mesmo tempo. Começa em `#1` por
  empresa (multi-tenant não compartilha sequência). Só existe em Pedidos —
  PDV e Comandas não têm numeração própria. É controle humano/exibição
  (`#1`, `#2`...), nunca usado como chave/id do documento.
- Na prática, hoje só 4 status são de fato atribuídos pela UI: `pending`
  ("Pendente"), `delivered` ("Entregue"), `finished` ("Concluído") e
  `canceled` ("Cancelado"). `open`, `preparing`, `ready`, `delivering` estão
  definidos no tipo mas não são setados em nenhum lugar do código atual.
- A tela de Pedidos (`order.ts`) **sempre exclui** pedidos `finished`/
  `canceled` de qualquer filtro (inclusive o filtro "Ativos"/padrão) — esses
  status só ficam visíveis na aba Histórico Geral (seção 5.1), não mais em
  Pedidos.
- Ciclo de status: `open → pending → preparing → ready → delivering →
  delivered → finished` (ou `canceled` a qualquer momento antes de `finished`).
- `deliveryType`: `'pickup'` (retirada, sem endereço obrigatório) ou
  `'delivery'` (entrega, usa `address`/`addressLat`/`addressLng`).
- `total = itemsTotal + shippingCost`. Recalculado automaticamente sempre que
  os `items` do pedido são atualizados (`OrderService.updateOrder`).
- **Baixa de estoque só acontece no status `delivered`**
  (`markAsDelivered`), não na criação do pedido. Pedido sem itens não pode
  ser marcado como entregue.
- **Cancelamento** (`cancelOrder`): só devolve estoque se o pedido já estava
  `delivered` no momento do cancelamento (senão o estoque nunca foi baixado,
  então não há o que devolver).
- **Finalização financeira**
  (`OrderService.finalizeOrder(order, paymentMethod, installments = 1)`):
  gera um registro em `sales` (`sale_type: 'order'`, com `paymentMethod` e
  `installments` escolhidos), sem baixar estoque de novo
  (`processSale(saleData, false)` — o estoque já saiu em `markAsDelivered`), e
  marca o pedido como `finished` com `paymentDate` e `closingDate` — no mesmo
  `updateDoc` o pedido também grava `paymentMethod`/`installments`
  (redundante com o `Sale` de propósito: permite filtrar por forma de
  pagamento tanto no Relatório/Dash, que lê de `Sale`, quanto no Histórico
  Geral, que lê `Order` direto na branch "pedido" — seção 5.1 — sem precisar
  de join). `installments` é sempre normalizado (`Number(...)`, mínimo `1`) e
  forçado a `1` sempre que `paymentMethod === PaymentMethod.PIX` — trava de
  "Pix é sempre à vista" garantida na camada de serviço, não só na UI (mesma
  regra da seção 3). Escopo: só a finalização de Pedidos. PDV e Comandas não
  passaram por essa mudança.
- Datas do ciclo de vida: `createdAt`, `scheduledDate` (previsão),
  `actualDeliveryDate` (preenchida em `delivered`), `paymentDate` e
  `closingDate` (preenchidas em `finished`).

## 5.1 Histórico Geral (Gestão > aba Histórico)

- View agregada, sem coleção própria — junta em tempo real (`combineLatest`)
  `sales` (só `sale_type: 'pdv'`, pra não duplicar com `orders`), `orders` e
  `comandas` (via `ComandaService.getAllComandas()`, sem filtro de status) num
  único feed ordenado por data.
- Filtros combináveis: origem (PDV/Pedido/Comanda), cliente, produto, forma
  de pagamento (`filtroHistoricoFormaPagamento`, mesmos valores de
  `PaymentMethod` — seção 3) e busca livre (por id do documento ou por
  `orderNumber`). O filtro de forma de pagamento só encontra correspondência
  em itens de `orders` (únicos que gravam `paymentMethod` hoje, via
  `finalizeOrder` — seção 5) — itens de PDV/Comanda no feed não têm esse
  campo.
- **Limitação conhecida**: vendas de PDV e Comandas não têm `customerId`
  vinculado (só `orders` tem cliente cadastrado) — ao filtrar por cliente,
  itens de PDV/Comanda simplesmente não aparecem, mesmo que sejam do mesmo
  cliente na prática (comanda guarda só `customerName` livre, sem `id`).

## 5.2 Vendedores (`vendedores`) — [CRÍTICA]

- **Model `Vendedor`**: `{ id?, companyId, name, comissoes: VendedorComissaoItem[] }`,
  onde `VendedorComissaoItem = { idProduct, percentual }` (`percentual` entre
  0 e 100). Produto do catálogo sem entrada correspondente em `comissoes` =
  0%/sem comissão nesse produto. Sem campo de status/ativo — segue o
  precedente de `Product` (seção 2): exclusão é real via `deleteDoc`, não
  soft-delete.
- **Vínculo no pedido**: `Order.vendedorId?` e `Order.vendedorName?`
  (snapshot do nome no momento do vínculo), ambos **opcionais** — um pedido
  pode ser criado, editado e finalizado sem vendedor associado.
- **Módulo `vendedores` em `ModuleConfig`** (seção 11): sub-módulo de
  `gestao`, no mesmo nível de `clientes` quanto à ligação/
  desligamento — mas **não obrigatório** (ao contrário de `clientes`), pode
  ser desativado livremente em Configurações, como `pdv`/`rotas`.
  Quando desligado: a aba de cadastro de Vendedores some do Gestão, a
  sub-aba Vendedores some do Dashboard/Relatório, e o campo de seleção de
  vendedor **some** da tela de Pedido (não fica só desabilitado — não deve
  renderizar).
- **Cálculo de comissão a pagar**
  (`VendedorService.calculateComissaoVendedor(orders: Order[], vendedor:
  Vendedor): ComissaoVendedorResultado`, método estático): filtra
  internamente por `order.status === 'finished'` **e** `order.vendedorId
  === vendedor.id` — não confia que o caller já filtrou, por ser cálculo de
  dinheiro a pagar. Por item qualificado: `vendidoItem = item.priceAtSale *
  item.quantity`; `percentualItem` = percentual cadastrado para
  `item.idProduct` no vendedor, ou `0` se ausente; `comissaoItem =
  vendidoItem * percentualItem / 100`. `totalVendido` = soma de
  `vendidoItem` de todos os itens qualificados — **exclui `shippingCost`**
  (frete nunca entra na base de cálculo de comissão, decisão fechada com o
  usuário). `totalComissao` = soma de `comissaoItem`.
- **UI**: cadastro de vendedor e sub-aba "Vendedores" vivem dentro de
  `product-inventory.ts`/`.html` (mesmo componente de Gestão, não um
  componente novo) — uma aba de CRUD (`activeTab`) e uma sub-aba de
  relatório (`reportTab`) exibindo `totalVendido`/`totalComissao` por
  vendedor no período filtrado.

## 6. Rotas de entrega

- Consome pedidos pendentes/ativos (`OrderService.getPendingOrders`, status em
  `['open','pending','preparing','ready','delivering','delivered']`) para
  montar uma rota.
- Gera link do Google Maps com os endereços dos pedidos em sequência
  (`https://www.google.com/maps/dir/...`) — não calcula rota otimizada
  internamente, delega ao Google Maps.

## 7. Despesas (`expenses`, `expenseSeries`) — [CRÍTICA]

Substitui Contas a Pagar (`bills`) e Produtos de Compra (`purchaseProducts`).
Decidido com o usuário (2026-10-22). O módulo **não** tem "a receber" (D7):
só despesas. `bills` e `purchaseProducts` ficam no banco como legado
(rollback) até a purga em produção; nenhum código novo lê ou escreve neles
depois do cutover (ver §14).

### 7.1 Modelo `Expense`
- Campos: `id`, `companyId`, `description`, `value` (number, reais, 2 casas),
  `categoryId` (→ `expenseCategories`), `dueDate` (**obrigatório**),
  `status` (`'a_pagar' | 'pago'`), `paidDate?`, `paymentMethod?` (enum
  `PaymentMethod`, §3), `supplier?` (texto livre), `notes?` (observação),
  `goodsReceivedDate?` ("mercadoria recebida em"; substitui o antigo status
  `recebido`), `origin` (`'manual' | 'parcelamento' | 'recorrencia' |
  'migracao'`), `seriesId?`, `installmentGroupId?`, `installmentNumber?`,
  `installmentTotal?`, `legacyBillId?`, `migracaoRevisar?`, `migracaoMotivo?`,
  `createdAt`.
- **Datas são date-only `'YYYY-MM-DD'`** (`dueDate`, `paidDate`,
  `goodsReceivedDate`, `anchorDate`), nunca Timestamp. "Hoje" = data local do
  navegador. Conversão de Timestamp legado usa fuso `America/Sao_Paulo`
  explícito, nunca o fuso da máquina. Motivo: vencida/mês/competência não
  podem depender de fuso.
- **Vencida é derivada**, nunca gravada: `status === 'a_pagar' && dueDate <
  hoje`. Não existe status `vencida` no banco.
- Transição `a_pagar → pago` (botão "Paguei"): grava `paidDate` (default
  hoje, editável) e `paymentMethod` (opcional). Transacional (`runTransaction`):
  pagar uma despesa já `pago` lança erro. [CONFIRMAR] Reversão
  `pago → a_pagar` não está prevista; para corrigir, exclui e recria.
- "Chegou": grava `goodsReceivedDate`; independe do status de pagamento. O
  botão aparece quando a categoria é `custo_producao` e o campo está vazio; o
  badge aparece sempre que o campo existe. Filtro "a pagar e já recebida" =
  `status === 'a_pagar' && goodsReceivedDate`.
- Exclusão de despesa é real (`deleteDoc`), com confirmação na UI.
- Todas as escritas lançam erro se `TenantService.companyId()` for nulo
  (padrão da §12 / TASK-027).

### 7.2 Parcelamento
- Compra em N vezes (1 ≤ N ≤ 120) gera N despesas independentes com
  `installmentGroupId` comum, `installmentNumber` 1..N, `installmentTotal` N,
  `origin='parcelamento'`, todas `a_pagar`.
- Valores: calculados em **centavos inteiros**; parcelas 1..N-1 =
  `floor(totalCentavos / N)`; a **última** recebe o resto. Soma das parcelas =
  total exato. Ex.: 100,00 / 3 → 33,33 / 33,33 / 33,34.
- Vencimentos: mensais sequenciais a partir da 1ª data, **calculados da 1ª
  data** (não encadeados): mantém o dia; se o mês não tem o dia, usa o último
  dia do mês (31/jan → 28/fev → 31/mar).
- Parcelamento e recorrência são excludentes na mesma despesa.

### 7.3 Recorrência (`expenseSeries`)
- Série: `id`, `companyId`, `active`, `period` (`'semanal' | 'mensal'`),
  `anchorDate`, `generatedThrough?` (data da última ocorrência já
  materializada), `template` (`description`, `value`, `categoryId`,
  `supplier?`, `paymentMethod?`, `notes?`), `legacyPurchaseProductId?`,
  `migracaoRevisar?`, `createdAt`, `endedAt?`.
- Criar despesa recorrente cria a série e a 1ª ocorrência. A recorrência é
  da própria despesa, **sem** depender de produto de compra.
- **Catch-up (D2)**: ao carregar Despesas e Balanço (client-side, sem Cloud
  Functions), para cada série `active`, gera **todas** as ocorrências com
  data > `generatedThrough` (ou ≥ `anchorDate` se ausente) até o **fim do mês
  corrente**. Não gera só a última.
- Ocorrência k: `semanal` = âncora + 7k dias; `mensal` = âncora + k meses
  **calculado da âncora** (preserva o dia; dia 31 cai no último dia do mês
  mais curto).
- **Idempotência**: (a) o catch-up roda em `runTransaction` sobre o doc da
  série (lê `generatedThrough`, grava ocorrências + avança a marca-d'água), então
  abas concorrentes não duplicam e ocorrência apagada pelo usuário não
  ressuscita; (b) ID da ocorrência determinístico `${seriesId}_${dueDate}`.
- Ocorrência nasce `a_pagar`, `origin='recorrencia'`, com o template da
  série. Editar uma ocorrência afeta só ela; editar a série afeta as futuras.
- **Encerrar recorrência** = `active=false` (+ `endedAt`); ocorrências já
  geradas ficam.
- **Limites (decididos 2026-10-22, achado de segurança do gon)**:
  - Toda data de despesa/série (`dueDate`, `paidDate`, `goodsReceivedDate`,
    `anchorDate`) tem ano entre 2000 e 2100.
  - `createSeries` rejeita âncora mais de 24 meses no passado (mesmo limite
    do aviso do formulário, que vira erro).
  - Catch-up gera no máximo 1 lote (399 ocorrências) por série por
    carregamento; o restante sai nos carregamentos seguintes.
  - O catch-up revalida `template.value` e a categoria do template (existe,
    é da empresa) antes de gerar; série inválida entra nas falhas agregadas
    e não bloqueia as demais.
  - `generateDueOccurrences` só aceita o `companyId` da sessão.

### 7.4 Tela Despesas (`/contas`)
- Navegação por mês (◀ out/2026 ▶). Três cards e três grupos usam **a mesma
  função de agrupamento** (`ExpenseReportService.groupForMonth`), então não
  podem divergir:
  - **Vencidas**: `a_pagar` com `dueDate < hoje`, de qualquer mês
    (pendência não some ao trocar de mês). [CONFIRMAR]
  - **A pagar no mês / A vencer**: `a_pagar` com `dueDate` no mês e `>= hoje`.
  - **Pago no mês / Pagas**: `pago` com `paidDate` no mês (visão de caixa).
- Cards ignoram os filtros; a lista aplica: categoria, status, "a pagar e já
  recebida", "revisar migração".
- Ações: "Paguei", "Chegou", editar, excluir, encerrar recorrência.
  Mobile incluso.
- O formulário oferece lançamento único, parcelado (N) ou recorrente
  (semanal/mensal).

### 7.5 Escopo de dados
- `companyId` em `expenses`, `expenseCategories` e `expenseSeries`; entram
  em `isOperationalCollection` (§10). Vazamento entre empresas segue a
  classificação [CRÍTICA] da §10.

### 7.6 Decisões registradas (2026-10-22)
- D1: o custo do produto (`buyPrice`/`priceAtCost`) já cobre a mercadoria;
  "Compra de mercadoria" e "Insumos/Embalagem" são `custo_producao` (fora do
  Resultado, já estão no CMV). Demais padrão = `despesa_operacional`.
- D2: recorrência conforme 7.3.
- D3: migração de bill sem `dueDate` (§14).
- D4: `purchaseProducts` → série recorrente (§14).
- D5: card Gastos = soma das despesas **operacionais**; modal detalha (§8).
- D6: Resultado de meses passados muda (competência). Aceito.
- D7: sem "a receber".

## 8. Categorias de despesa e Resultado no Balanço — [CRÍTICA]

### 8.1 Categorias (`expenseCategories`)
- Campos: `id`, `companyId`, `name`, `type` (`'custo_producao' |
  'despesa_operacional'`), `archived` (boolean), `systemKey?` (só nas
  padrão), `createdAt`.
- Padrão (criadas por empresa, ID determinístico `${companyId}_${systemKey}`,
  idempotente):

| systemKey | Nome | Tipo |
|---|---|---|
| compra_mercadoria | Compra de mercadoria | custo_producao |
| insumos_embalagem | Insumos/Embalagem | custo_producao |
| aluguel | Aluguel | despesa_operacional |
| energia_agua_gas | Energia/Água/Gás | despesa_operacional |
| internet_telefone | Internet/Telefone | despesa_operacional |
| transporte_combustivel | Transporte/Combustível | despesa_operacional |
| pessoal | Pessoal | despesa_operacional |
| impostos_taxas | Impostos/Taxas | despesa_operacional |
| taxas_cartao | Taxas de cartão | despesa_operacional |
| marketing | Marketing | despesa_operacional |
| manutencao_equipamentos | Manutenção/Equipamentos | despesa_operacional |
| outros | Outros | despesa_operacional |

- A empresa cadastra categorias novas e **escolhe o tipo** na criação.
  [CONFIRMAR] O tipo é imutável depois (mudá-lo reclassificaria o Resultado
  retroativamente).
- **Categoria com despesa (ou série) vinculada só pode ser ARQUIVADA, nunca
  excluída.** Categoria sem vínculo pode ser excluída. Garantia na camada de
  serviço (checagem antes do delete). Arquivada não aparece no seletor de
  nova despesa, mas segue valendo nas despesas existentes e nos relatórios.
- Categoria nunca é apagada por migração.

### 8.2 Resultado (Balanço)
- `Resultado = Faturamento − CMV − Despesas operacionais`.
  - Faturamento e CMV vêm do relatório de vendas (inalterados).
  - **Despesas operacionais** = soma de `value` das despesas cuja categoria é
    `despesa_operacional` e cujo `dueDate` está no período
    (`filtroDataInicio..filtroDataFim`, comparação de strings),
    **independente de status** (competência: paga ou não).
  - Despesas `custo_producao` **não entram** no Resultado (já estão no CMV, D1).
- "Pago no mês" (§7.4) continua como visão de **caixa**, separada do Resultado.
- Card **Gastos** = despesas operacionais do período (D5). O clique abre
  modal com (a) breakdown por categoria operacional e (b) separado, rotulado
  "já incluso no CMV", o total de custo de produção, **só informativo**.
- Sub-aba do Relatório "Contas a Pagar" vira **"Despesas"**: pizza por
  categoria no período (competência, dois tipos, com tag de tipo) + barras
  dos 12 meses (por `dueDate`).
- Cálculo em centavos inteiros; categoria órfã conta como operacional
  (conservador).
- Sem testes de integração de UI aqui: a regra mora em
  `ExpenseReportService` (puro) e é coberta por TDD.

## 9. Clientes (`customers`)

- Endereço estruturado: `cep, rua, numero, complemento, bairro, cidade, uf`
  (mais `lat`/`lng` para geolocalização), além de um campo `address` livre
  (texto formatado, usado como fallback/exibição).
- Busca de CEP integrada via API pública ViaCEP (`viacep.com.br`) para
  autopreencher endereço.

## 10. Multi-tenant / Autenticação — [CRÍTICA]

- Isolamento entre empresas é feito por campo `companyId: string` em cada
  documento das coleções operacionais (`products`, `sales`, `orders`,
  `comandas`, `customers`, `purchases`, `vendedores`, `expenses`,
  `expenseCategories`, `expenseSeries`; `bills` e `purchaseProducts`
  permanecem como legado até a purga, §14) — não por
  subcoleção `companies/{id}/...`. Motivo: mesmo nível de proteção contra
  vazamento entre empresas que subcoleção daria — o Firestore rejeita
  (erro de permissão, quebra a query) qualquer listagem cuja estrutura não
  bata com o `where('companyId', '==', ...)` exigido pela regra de segurança;
  esquecer o filtro quebra a leitura em vez de vazar dado de outra empresa.
  Subcoleção só valeria se fosse necessário isolamento físico (apagar/exportar
  tudo de uma empresa de uma vez) — não é requisito hoje.
- **Company** (`companies/{id}`): `id`, `name`, `document?`,
  `plan: 'trial'|'basic'|'pro'`, `status: 'active'|'suspended'|'canceled'`,
  `modules: ModuleConfig` (substitui o doc único `config/company` — ver seção
  11), `createdAt`.
- **AppUser** (`users/{uid}`): `uid` (= id, do Firebase Auth), `email`,
  `companyId`, `role: 'owner'|'admin'|'employee'`, `createdAt`.
- Autenticação por email/senha (Firebase Auth). Usuário autenticado carrega
  `companyId` e `role` como **custom claims** no token JWT
  (`request.auth.token.companyId`/`.role`), consumidos pelas regras do
  Firestore para autorizar leitura/escrita. Fase 1 pode operar sem Cloud
  Function de custom claims, lendo `users/{uid}.companyId` a cada request nas
  regras (1 leitura extra, sem backend adicional) — migração pra custom
  claims depois não quebra o cliente.
- Cadastro de empresa nova (self-service): `createUserWithEmailAndPassword`
  seguido da criação de `companies/{companyId}` (`modules: DEFAULT_MODULES`,
  `plan: 'trial'`, `status: 'active'`) e `users/{uid}` (`role: 'owner'`) no
  mesmo fluxo.
- Guard de rota (`authGuard`) é UX, não segurança — barra navegação pra quem
  não está logado, mas quem garante o isolamento de fato é `firestore.rules`.
  Um guard mal configurado no cliente não vaza dado sozinho, só permite
  chegar numa tela vazia/com erro de permissão.
- **Classificação [CRÍTICA]**: vazamento de dado entre empresas (ler ou
  gravar documento de uma empresa a partir da sessão de outra) é equiparado
  neste projeto a estoque/dinheiro/transição de estado, pelos mesmos motivos:
  (1) o dado exposto é justamente o que já é crítico aqui — custo, estoque,
  vendas, clientes — só que multiplicado por N empresas ao mesmo tempo, e
  vazar pra um concorrente é dano irreversível, não estornável como um ajuste
  de estoque; (2) diferente de um bug de estoque (contido a uma empresa), uma
  falha de isolamento é sistêmica — um `where('companyId',...)` esquecido em
  um service compromete todos os tenants de uma vez, não um caso isolado.
  Toda mudança em filtro `companyId` nos services e em `firestore.rules`
  segue o ciclo TDD da Seção 5 do `CLAUDE.md` (mike RED → levi → mike GREEN).

## 11. Configuração por empresa (`companies/{companyId}`)

- `ModuleConfig` liga/desliga módulos inteiros da aplicação: `pdv`, `pedidos`,
  `gestao`, `rotas`, `contas` (rótulo "Despesas", §7), `clientes` (sub-módulo
  de gestão), `vendedores` (sub-módulo de gestão, opcional). O sub-módulo
  `compras` **foi removido** (2026-10-22): a aba Gestão > Compras e o toggle
  em Configurações deixam de existir; a chave `compras` em documentos
  `companies/*` antigos é ignorada (campo legado inerte, merge com
  `DEFAULT_MODULES` não a recria).
- `gestao` e `clientes` são módulos **obrigatórios**: nunca podem ser
  desativados pela tela de Configurações, ao contrário dos demais módulos
  — garantia aplicada em três pontos, e falha em qualquer um deles quebra a
  regra:
  1. UI — `gestao` e `clientes` nem aparecem em `moduleOptions`
     (`ConfigComponent`/`config.html`): a tela de Configurações só lista
     módulos que de fato podem ser desligados (os demais, com toggle livre).
  2. Escrita — `ConfigService.updateModules` força `gestao: true` e
     `clientes: true` no documento salvo, independente do que for passado
     no `Partial<ModuleConfig>` (correção silenciosa, não lança erro — a UI
     já impede a tentativa).
  3. Leitura — `ConfigService.loadCompanyModules` corrige dado legado: o
     merge com `DEFAULT_MODULES` passa a também sobrescrever `gestao`/
     `clientes` para `true` quando já existirem no Firestore como `false`
     (config criada antes desta regra existir).
- Todas as rotas protegidas usam `moduleGuard`: se o módulo estiver desligado,
  redireciona para `/`. Módulos novos adicionados ao `DEFAULT_MODULES` nascem
  habilitados por padrão para configs já existentes no banco (merge com
  defaults).
- Com o multi-tenant (seção 10), o documento de configuração deixa de ser
  único (`config/company`) e passa a ser `companies/{companyId}`, com o
  campo `modules` dentro do próprio doc da empresa — `ConfigService` lê/grava
  usando o `companyId` da sessão atual (via `TenantService`), nunca mais um
  doc fixo.

## 12. Lacunas / pontos sem regra definida no código (perguntar ao usuário)

- ~~Não há autenticação/autorização de usuário implementada~~ — respondido
  pela seção 10. Ponto ainda em aberto dentro da própria especificação: a
  escolha entre Cloud Function de custom claims (mais rápido, exige
  `firebase init functions`) ou leitura direta de `users/{uid}` na regra
  (fase 1, sem backend adicional) fica marcada como opcional/fase 2 na fila
  de tasks — não bloqueia o resto do multi-tenant. (Decisão equivalente para
  o flag `isSuperAdmin` foi tratada e fechada separadamente — ver seção 13 —
  não depende nem espera esta.)
- Não há teste automatizado cobrindo as regras críticas (estoque, transições
  de status, cálculo de total) — e agora, também não há teste de regra de
  segurança do Firestore. Se a task de `firestore.rules` for executada, o
  ciclo TDD da seção 5 precisa de `@firebase/rules-unit-testing` (não
  presente no `stack.md` hoje) — ver task correspondente na fila.
- Sem regra explícita de estorno de comanda fechada (só comanda `open` tem
  fluxo de exclusão com devolução de estoque no código revisado).
- Sem dado de produção real hoje (confirmado na especificação), não é
  necessário script de backfill de `companyId` antes de publicar as regras
  novas. Se isso mudar (cliente-piloto com dado real) antes da task de
  `firestore.rules` ser executada, backfill é pré-requisito obrigatório —
  reavaliar com o usuário nesse momento, não assumir.
- ~~Isolamento por `companyId` (seção 10) é só client-side~~ — resolvido pela
  TASK-021: `firestore.rules` agora exige autenticação e valida `companyId`
  via lookup em `users/{uid}` (fase 1, sem custom claims) pras 8 coleções
  operacionais, `companies/{id}` e `users/{uid}`.
- ~~`TenantService.companyId()` pode ser `null` sem trava~~ — resolvido pela
  TASK-027: os 8 métodos de escrita lançam erro explícito antes de tocar o
  Firestore quando `companyId()` é `null`.
- **Gap de infraestrutura de teste (descoberto na TASK-027, não resolvido)**:
  os 17 testes de isolamento com `companyId` válido (`src/services/*/*.spec.ts`,
  TASK-009/018) não rodam mais no Karma desde que `firestore.rules` passou a
  exigir autenticação real (TASK-021) — `@firebase/rules-unit-testing`
  (usado pra simular auth sem precisar de Auth Emulator) depende de
  `process.env`, que não existe em browser, e o Karma roda esses specs
  dentro de um Chrome real. Não afeta `test/firestore.rules.spec.ts` (roda
  via Jest, em Node). A lógica de isolamento em si já foi provada correta
  antes das regras travarem — isso é uma lacuna de cobertura de regressão
  futura, não um bug funcional atual. Solução conhecida e não implementada:
  subir também um Firebase Auth Emulator e autenticar de verdade via
  `signInAnonymously()`/`connectAuthEmulator()` (client SDK, funciona em
  browser) no `test-helpers.ts` — decisão do usuário se/quando investir
  nisso.
- `SaleService.getSalesByDate` e `ExpenseService.getExpenses` combinam
  `where('companyId',...)` com `orderBy`/range em outro campo — exigem índice
  composto (`firestore.indexes.json`) no Firestore real (o emulador não
  cobra). Deploy de índices (`npm run deploy:rules:staging`) é pré-requisito
  de cada ambiente antes do hosting novo.

## 13. Super-admin da plataforma — [CRÍTICA]

- **Campo `isSuperAdmin: boolean`** em `users/{uid}` (default `false`, ausente =
  `false`). É um flag **global de plataforma**, separado do `role`
  (`owner|admin|employee`, que continua escopado a uma única empresa via
  `companyId`). Um usuário pode ser `employee` de uma empresa e `isSuperAdmin`
  ao mesmo tempo — os dois eixos não se relacionam. Nunca setado `true` no
  cadastro self-service (`AuthService.signup`); só concedido/revogado via
  Cloud Function `setSuperAdmin` (ver abaixo), nunca por escrita direta do
  cliente — `users/{uid}` continua com `allow update, delete: if false`.
- **Sem custom claims para este flag.** Fase 1 mantém leitura direta de
  `users/{uid}` em `firestore.rules` (mesmo padrão de `companyId`/`role`,
  seção 10), por decisão deliberada: revogar `isSuperAdmin` via leitura direta
  tem efeito no request seguinte; via custom claim, ficaria preso ao JWT até
  refresh (até 1h) — janela de acesso cross-tenant residual inaceitável pra
  esse flag. As duas Cloud Functions que dependem dele (abaixo) já
  revalidam contra o Firestore via Admin SDK de qualquer forma, então claim
  não seria consultado no ponto que decide a autorização. Fica de fora do
  item ainda aberto na seção 12 sobre migrar `companyId`/`role` pra claims —
  são decisões independentes.
- **Override de `companyId` na sessão** (`TenantService`): quando o usuário
  logado tem `isSuperAdmin === true`, a home exibe um seletor de empresa
  (dentre as já cadastradas em `companies/{id}` — não cria empresa nova) que
  troca o `companyId` efetivo da sessão. Usuário sem `isSuperAdmin` nunca é
  afetado por esse mecanismo, sem exceção — o override só produz efeito
  quando `TenantService.isSuperAdmin()` é verdadeiro, checagem repetida tanto
  no client (`TenantService.companyId`) quanto no servidor
  (`firestore.rules`, abaixo).
- **Exceção deliberadamente mais arriscada que as demais do sistema.** Ao
  contrário de toda outra proteção `companyId` no sistema (seção 10, sem
  exceção nenhuma), este override libera **leitura e escrita** (`create`,
  `update`, `delete`) nas 8 coleções operacionais para a empresa selecionada,
  não só leitura — o super-admin efetivamente opera a empresa selecionada
  como se fosse dela (criar pedido, dar baixa de estoque, editar cliente,
  etc.), não apenas visualiza. Decisão confirmada com o usuário: o risco de
  bug de seleção de empresa gravar dado na empresa errada é conhecido e
  aceito — não é tratado como bloqueante da feature. `update` mantém uma
  trava irrestrita mesmo com o bypass: `request.resource.data.companyId ==
  resource.data.companyId` — nenhuma sessão, nem super-admin, consegue mudar
  o `companyId` de um documento já existente por essa rule (migração de
  documento entre empresas continua impossível).
- **`firestore.rules`**: `isSuperAdminUser()` (leitura ao vivo de
  `users/{request.auth.uid}.isSuperAdmin`, via `get()`) entra em `OR` com a
  checagem de `companyId` original em `read`/`create`/`update`/`delete` das
  coleções operacionais, e em `read` de `users/{uid}` (permite o **client**
  listar todos os usuários da plataforma direto via listener Firestore —
  decisão confirmada: sem Cloud Function dedicada de listagem, o bypass de
  `read`/`list` em `users/{uid}` cobre a tela Administrador) e de
  `companies/{companyId}` em `read` e `update` (permite ver qualquer empresa
  no seletor e, via `ConfigService.updateModules`, ligar/desligar módulos da
  empresa selecionada mesmo sem pertencer a ela). Decisão confirmada com o
  usuário em 2026-08-19: o bypass em `companies/{companyId}` passa a cobrir
  `update` pelo mesmo motivo do override das coleções operacionais
  (parágrafo acima) — super-admin opera a empresa selecionada como se fosse
  dela, agora também pra configuração de módulos, não só leitura. `delete`
  continua **de fora**, deliberadamente — não existe hoje nenhuma
  tela/fluxo que apague uma empresa, então liberar delete seria superfície
  de risco sem uso real; se essa necessidade aparecer no futuro, é decisão
  nova, não extensão automática deste bypass. Pra usuário sem
  `isSuperAdmin`, o `OR` colapsa pra exatamente a mesma condição de hoje —
  o bypass é estritamente aditivo, avaliado a cada request contra o
  Firestore, não forjável client-side.
- **Cloud Functions** (`functions/`, primeira infra de Functions do projeto,
  região `us-central1`, plano Blaze): duas `onCall`, ambas exigem
  `request.auth` e revalidam `isSuperAdmin` do chamador direto no Firestore
  via Admin SDK antes de qualquer ação — nunca confiam em claim ou dado vindo
  do client.
  - **`resetUserPassword({ targetUid, newPassword })`**: super-admin digita a
    nova senha direto na tela (sem fluxo de e-mail/link — projeto não tem
    infra de envio de e-mail hoje); `admin.auth().updateUser(targetUid, {
    password: newPassword })`. Sem restrição de alvo — super-admin pode
    resetar a própria senha ou a de qualquer outro usuário, de qualquer
    empresa.
  - **`setSuperAdmin({ targetUid, value })`**: única forma legítima de
    alterar o campo (client nunca escreve `users/{uid}` direto).
    **`targetUid` não pode ser igual ao uid de quem chama** — bloqueio total,
    independente de `value` ser `true` ou `false`: um super-admin nunca
    altera o próprio flag por essa function, elimina o risco de
    autorrevogação acidental (ficar sem nenhum super-admin ativo) e mantém a
    regra simples (não distingue conceder de revogar).
- **Bootstrap do primeiro super-admin**: nenhum usuário nasce com
  `isSuperAdmin: true` — o primeiro precisa ser setado manualmente (console
  do Firestore ou script avulso com Admin SDK), fora do fluxo do app. Passo
  operacional único de implantação, não uma tela do sistema.

## 14. Migração Contas a Pagar → Despesas — [CRÍTICA]

Script `scripts/migrate-bills-to-expenses.mjs` (Admin SDK) + núcleo puro
`scripts/lib/expense-migration-core.mjs`. **Só roda em homolog (`hologaerp`)**;
recusa qualquer outro projeto. Habilitar produção exige task nova e explícita.

- **Idempotente e não destrutivo**: lê `bills`/`purchaseProducts`, nunca
  altera nem apaga legado. Cada doc novo usa ID determinístico (`mig_bill_<id>`,
  `mig_pp_<id>`, `${companyId}_${systemKey}`) com `create()`; se já existe,
  pula (nunca sobrescreve edição pós-migração). Dry-run por padrão; `--apply`
  grava; `--rollback` apaga só docs com `origin=='migracao'` / série
  `mig_pp_*` (dry-run por padrão).
- **Status**: `pendente` → `a_pagar`; `recebido` → `a_pagar` +
  `goodsReceivedDate=receivedAt`; `pago` → `pago` + `paidDate=paidAt` (e
  `goodsReceivedDate=receivedAt` se existir).
- **Vencimento (D3)**: `dueDate` do bill; se ausente, `paidAt` (se pago), senão
  `receivedAt`, senão `createdAt`; usado o fallback → `migracaoRevisar=true`.
  Conversão de Timestamp → date-only em `America/Sao_Paulo`.
- **Categoria**, por precedência: (1) nome começa com "Compra:" →
  Compra de mercadoria; (2) bill com `purchaseProductId` → casamento de nome
  do produto de compra (D4); (3) casamento simples do nome do próprio bill;
  (4) bill com `receivedAt` sem casamento → Compra de mercadoria +
  `migracaoRevisar`; (5) senão **Outros** + `migracaoRevisar`. Casamento =
  texto normalizado (minúsculo, sem acento) contendo palavra-chave de uma
  categoria padrão; "Taxas de cartão" tem precedência sobre "Impostos/Taxas".
  [CONFIRMAR] heurística (4).
- **`purchaseProducts` (D4)**: os com `recurring=true` viram `expenseSeries`
  (`mig_pp_<id>`): `anchorDate` = menor `dueDate` dos bills ligados (ou data
  de criação), `generatedThrough` = maior `dueDate` dos bills ligados (para o
  catch-up continuar dali), `template` do último bill, `period`
  `weekly→semanal`/`monthly→mensal`. Bills ligados recebem `seriesId`.
  Sem casamento de nome → "Outros" + `migracaoRevisar`. Os com
  `recurring=false` não viram série (só seus bills migram). Bill recorrente
  manual (sem `purchaseProductId`) migra como despesa simples +
  `migracaoRevisar` (o sistema antigo nunca o automatizou). [CONFIRMAR]
- Categorias padrão são criadas por empresa (idempotente) antes das despesas.
- Relatório final: contagem por status, por categoria, nº com
  `migracaoRevisar`, nº pulados (já existiam), nº sem `companyId` (ignorados).
- Depois do cutover validado em produção (task futura), `bills`,
  `purchaseProducts`, seus índices e entradas em `firestore.rules` são
  purgados em task própria.
