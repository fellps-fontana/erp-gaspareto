# Regras de Negócio — ERP Gaspareto

> Fonte da verdade do domínio. Extraído do código existente (services e models
> em `src/`). Regras marcadas **[CRÍTICA]** envolvem estoque, dinheiro ou
> transição de estado — qualquer mudança nelas passa por executor especializado
> + revisão (`style`), nunca decidida sozinha por quem orquestra. Pontos que o
> código não deixa claro estão marcados com ⚠️ e precisam confirmação do usuário.

## 1. Visão geral do domínio

ERP para um negócio de venda de produtos com controle de estoque, atendimento
via comandas (balcão/mesa), pedidos com entrega, contas a pagar/receber e
cadastro de clientes. Módulos podem ser ligados/desligados por empresa via
`ConfigService` (`company-config.ts`).

Módulos existentes: **PDV**, **Pedidos**, **Gestão** (estoque + relatórios,
com sub-abas Clientes e Compras), **Rotas** (entrega), **Contas** (a pagar/receber).

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

## 3. Vendas (`sales`) — [CRÍTICA]

- Toda venda tem `sale_type`: `'pdv'` (balcão) ou `'order'` (originada de um
  pedido). A venda `'order'` **nasce na entrega do pedido**
  (`OrderService.markAsDelivered`, valor cheio, data da entrega — seção 5.3),
  não mais na finalização; pedidos já `delivered` antes do deploy da seção
  5.3 seguem a regra antiga (nasce na conclusão). `customerId` só é
  preenchido em vendas do tipo `order` com cliente vinculado — vendas de PDV
  nunca têm `customerId`.
- `paymentMethod`: `'dinheiro' | 'pix' | 'cartao' | 'cheque' | 'boleto' |
  'misto'` (enum `PaymentMethod`, em `src/models/sell-model.ts`), com
  `PAYMENT_METHOD_LABELS: Record<PaymentMethod, string>` mapeando cada valor
  pro rótulo pt-BR. `'misto'` NUNCA é escolhido pelo usuário: é o valor que
  `Sale.paymentMethod`/`Order.paymentMethod` recebem na conclusão de um
  pedido quando houve mais de uma forma de pagamento distinta entre os
  pagamentos `pago` (seção 5.3); label `'Misto'`. `Sale.paymentMethod` passa
  a ser **opcional**: a venda de pedido nasce SEM forma (a forma só é
  conhecida quando o saldo zera) e é preenchida na conclusão. PDV e Comandas
  não mudaram — PDV continua sempre gravando `'dinheiro'`/`'pix'`.
- `installments?: number` (novo campo em `Sale`): metadado de parcelamento —
  `1`/ausente = à vista, `N` = parcelado em N vezes. **Não** gera controle de
  parcela individual nem lançamento em `bills`/Contas a Receber, é só
  informação de exibição/filtro. Normalizado para inteiro `>= 1` em qualquer
  forma. A antiga trava "Pix não parcela" foi **removida** pelo usuário
  (commit `333d386`, 2026-08-28): Pix aceita N parcelas igual às demais formas.
  Na conclusão de pedido, `Sale.installments` recebe o `installments` do
  último pagamento (ou `1` se `paymentMethod === 'misto'`).
- Cada item de venda guarda `priceAtSale` **e** `priceAtCost` no momento da
  venda (snapshot) — o lucro é calculado sobre esses valores congelados, não
  sobre o preço atual do produto. Isso preserva o histórico de margem mesmo
  se o preço do produto mudar depois.
- Cancelamento de venda (`cancelSale`) devolve todo o estoque dos itens e
  marca a venda como `status: 'canceled'` (não apaga o documento).
- **Venda cancelada não conta em relatório.** Toda agregação de vendas
  (Relatório/Balanço/Dashboard/Vendedores) ignora `status === 'canceled'`.
  Cancelar um pedido já `delivered` cancela também a `Sale` dele
  (`status: 'canceled'`, sem devolver estoque de novo — o estoque é devolvido
  uma única vez, pelo cancelamento do pedido), na mesma transação (seção 5.3).

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
  `delivered → finished` deixou de ser um clique: o pedido vira `finished`
  automaticamente quando está `delivered` E o saldo é `0` (seção 5.3).
- `deliveryType`: `'pickup'` (retirada, sem endereço obrigatório) ou
  `'delivery'` (entrega, usa `address`/`addressLat`/`addressLng`).
- `total = itemsTotal + shippingCost`. Recalculado automaticamente sempre que
  os `items` do pedido são atualizados (`OrderService.updateOrder`).
- **Baixa de estoque só acontece no status `delivered`** (`markAsDelivered`),
  não na criação do pedido. Pedido sem itens não pode ser marcado como
  entregue. `markAsDelivered` só é permitido a partir de `open|pending|
  preparing|ready|delivering` (guarda no service contra entrega dupla).
  Também cria a `Sale` do pedido, na mesma transação (seção 5.3).
- **Cancelamento** (`cancelOrder(orderId, { estornar })`): só devolve estoque
  se o pedido já estava `delivered` no momento do cancelamento (senão o
  estoque nunca foi baixado). Só é permitido a partir de status diferente de
  `finished`/`canceled` (guarda no service). Efeitos sobre pagamentos, `Sale`
  e parcelas: seção 5.3.
- **Finalização financeira — regra ANTERIOR (histórico / regra de transição)**:
  `OrderService.finalizeOrder(order, paymentMethod, installments = 1)` gerava
  a `Sale` (`processSale(saleData, false)`) e depois marcava o pedido
  `finished` com `paymentDate`/`closingDate`/`paymentMethod`/`installments`,
  em DUAS escritas sem transação (bug: se a segunda falhasse, a venda ficava
  duplicada). Esta forma foi **substituída** pelos pagamentos da seção 5.3 e
  `finalizeOrder` é removido. A regra antiga continua valendo só como regra de
  transição: pedidos que já estavam `delivered` no momento do deploy (status
  `delivered` e sem `saleId`) têm a `Sale` criada na CONCLUSÃO (quando o
  saldo zera), com `date` = data da conclusão, em vez de na entrega. Pedidos
  `finished` antigos (sem `payments`) são lidos como UM pagamento pago de
  valor cheio (derivado, sem migração) — ver 5.3. Continuam valendo: a
  redundância deliberada `Order.paymentMethod`/`installments` espelhando a
  `Sale` (Histórico filtra por forma sem join, seção 5.1) e a normalização
  de `installments` para inteiro `>= 1` (Pix parcela normalmente desde
  `333d386` — não existe mais trava de Pix à vista).
- Datas do ciclo de vida: `createdAt`, `scheduledDate` (previsão),
  `actualDeliveryDate` (preenchida em `delivered`), `paymentDate` (data do
  ÚLTIMO pagamento que zerou o saldo) e `closingDate` (instante da
  conclusão), ambas preenchidas em `finished`. Datas por pagamento
  (`dueDate`, `paidDate`) vivem em `Order.payments` (seção 5.3).

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
  `'misto'` entra como opção do filtro de forma de pagamento. Venda/pedido
  entregue e ainda não concluído não tem forma gravada e só aparece com o
  filtro em "todas".
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
  `gestao`, no mesmo nível de `compras`/`clientes` quanto à ligação/
  desligamento — mas **não obrigatório** (ao contrário de `clientes`), pode
  ser desativado livremente em Configurações, mesmo padrão de `compras`.
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
  Com a seção 5.3, `status === 'finished'` passa a significar "entregue E
  saldo = 0": a comissão só entra quando o pedido está totalmente pago.
  Pedido `delivered` com saldo > 0 e pedido `canceled` (mesmo com sinal
  retido) nunca geram comissão. Nenhuma mudança de fórmula.
- **UI**: cadastro de vendedor e sub-aba "Vendedores" vivem dentro de
  `product-inventory.ts`/`.html` (mesmo componente de Gestão, não um
  componente novo) — uma aba de CRUD (`activeTab`) e uma sub-aba de
  relatório (`reportTab`) exibindo `totalVendido`/`totalComissao` por
  vendedor no período filtrado.

## 5.3 Pagamentos, parcelas e A receber de Pedidos — [CRÍTICA]

> Escopo: só Pedidos. PDV e Comandas não mudam. Sem coleção nova no Firestore:
> pagamentos e parcelas vivem no próprio documento `orders/{id}`. Decisões do
> usuário de 2026-10-20 incorporadas abaixo.

### Modelo
- `Order.payments?: OrderPayment[]` e `Order.saleId?: string`.
- `OrderPayment = { id, amount, method, installments, dueDate?, paidDate?,
  status }`. `status`: `'previsto'` (parcela agendada, ainda não paga), `'pago'`,
  `'cancelado'` (parcela prevista cancelada), `'estornado'` (pagamento
  devolvido). `amount > 0`, 2 casas (comparações em centavos inteiros).
  `method` nunca é `'misto'`. `installments` é só informativo (cartão/
  maquininha/Pix parcelado), `>= 1`, forçado a `1` só em `previsto`. `dueDate` só nas
  parcelas da agenda; `paidDate` só em `pago` (default hoje, editável).
  Datas são `Timestamp.fromDate(...)` do cliente (serverTimestamp não vale
  dentro de array).
- Derivados (nunca gravados): `pago` = soma dos `pago`; `saldo` = `total - pago`;
  `previsto` = soma dos `previsto`; `saldoDescoberto` = `saldo - previsto`.
  `total` = `order.total` gravado (inclui frete).
- Leitura de pedido antigo (sem migração): `status === 'finished'` e sem
  `payments` = um pagamento `pago` de valor cheio (`method`=`order.paymentMethod`,
  `installments`, `paidDate`=`paymentDate`). Pedido `delivered` sem `saleId` =
  "entregue antes do deploy" (regra antiga de venda, ver seção 5).

### Registrar pagamento
- Permitido em qualquer status exceto `canceled` (e `finished`, onde o saldo já
  é 0). Pagamento antes da entrega é permitido.
- `0 < valor <= saldo`; acima do saldo é bloqueado NA CAMADA DE SERVIÇO.
- Cartão (decisão do usuário): um pagamento de qualquer valor `<= saldo`,
  sempre lançado `pago` na hora, nunca vira parcela prevista; `installments` é
  informativo. Pix não tem trava: `installments` informativo como qualquer
  forma (trava removida em `333d386`).
- Pagou diferente do previsto (pagamento de uma parcela específica): a
  diferença vai para a próxima parcela prevista; se não houver, cria-se nova
  parcela em `dueDate` da paga + 30 dias. Pagamento avulso com parcelas
  previstas existentes abate das mais antigas. Invariante: se existem
  `previsto`, `soma(previsto) == saldo` sempre; parcela que chega a 0 é removida.
  ⚠️ cascata e base de +30 dias: ver seção 12.
- Atomicidade: pagamento + eventual conclusão + atualização da `Sale` numa única
  `runTransaction`.

### Conclusão e competência
- Pedido vira `finished` quando `status === 'delivered'` E `saldo === 0`
  (automático; substitui o clique de finalizar). Se o saldo zerar ANTES da
  entrega, o pedido só conclui dentro de `markAsDelivered`.
- Competência: a `Sale` (`sale_type: 'order'`, `status: 'completed'`, valor
  cheio, itens com snapshot, `date` = data da entrega) nasce em `markAsDelivered`,
  na MESMA transação da baixa de estoque, sem `paymentMethod`; `Order.saleId`
  guarda o vínculo. Pagamentos são indicador separado (Recebido / A receber).
- Na conclusão (decisão do usuário): `Sale.paymentMethod`/`installments` e
  `Order.paymentMethod`/`installments` = forma e parcelas do último pagamento
  `pago` (por `paidDate`), ou `paymentMethod = 'misto'` e `installments = 1` se
  houve mais de uma forma distinta entre os `pago`. Também grava
  `paymentDate`/`closingDate`.
- Pedido já `delivered` no deploy: a `Sale` é criada na conclusão (regra antiga,
  data = conclusão). Sem script retroativo.
- Comissão (seção 5.2): só `finished`.

### Parcelas previstas (formas que não são cartão)
- "Montar parcelas" substitui TODAS as parcelas `previsto` do pedido (as `pago`
  são preservadas). Dois modos: N parcelas iguais mensais a partir da data X
  (centavos sobrantes na última; mês sem o dia usa o último dia do mês), ou
  lançamento livre. A soma TEM que ser igual ao saldo, cada parcela `> 0` e com
  `dueDate`, senão não salva (validação no serviço). Forma `cartao` não pode ser
  parcela prevista.
- **Limite (decisão do usuário, 2026-10-20)**: no máximo **60** parcelas
  `previsto` por pedido, nos dois modos e no reajuste da edição; acima disso o
  serviço rejeita com `PARCELAS_ACIMA_DO_LIMITE`. No modo iguais, a quantidade
  também não pode deixar parcela abaixo de R$ 0,01 (quantidade > saldo em
  centavos → `VALOR_INVALIDO`), e a validação acontece ANTES de montar a lista.
- Atraso é só destaque visual ("vencida há X dias"; vencida = `dueDate` anterior
  ao início do dia de hoje); sem juros/multa.
- Editar itens/frete com pagamentos lançados: permitido só se `novoTotal >=
  pago`; se existem `previsto`, a soma deles tem que ser igual ao novo saldo,
  então a edição obriga reajustar as parcelas na mesma operação (atômica).

### Decisões de 2026-10-20 (pós-PR #35, confirmadas pelo usuário)
- **Pedido de total 0**: entregue sem nenhum pagamento conclui automaticamente
  na entrega (saldo 0), com forma final `dinheiro` e `installments = 1` (não há
  pagamento de onde derivar a forma).
- **Edição só de frete**: `updateOrder` recalcula `itemsTotal`/`total` sempre
  que `items` OU `shippingCost` mudam (`total = itens + frete`), usando os itens
  gravados quando só o frete vem; com pagamentos, a mesma validação de
  `novoTotal >= pago` e reajuste de parcelas vale.
- **Edição de pedido**: `updateOrder` só aceita pedido em
  `open|pending|preparing|ready|delivering` (antes da entrega). Pedido
  `delivered`/`finished`/`canceled` é rejeitado (a `Sale` e o estoque já
  refletem o pedido). Só campos editáveis entram (itens, frete, endereço e
  coordenadas, tipo de entrega, observações, cliente, vendedor, data
  agendada); `status`, `saleId`, `payments`, totais e datas de ciclo vindos de
  fora são ignorados/rejeitados — essas mudanças só acontecem pelos métodos
  próprios (pagamento, parcelas, entrega, cancelamento).
- **Validação de pagamento no serviço**: `method` tem que ser um valor do enum
  `PaymentMethod` (exceto `misto`), senão `FORMA_INVALIDA`; `installments`
  não finito (NaN/Infinity/não numérico) é rejeitado com `VALOR_INVALIDO`;
  finito é normalizado como antes (`Math.floor`, mínimo 1; ausente = 1).
- `OrderService.updateStatus` (sem uso, sem validação) foi removido: status só
  muda pelos métodos com regra.

### Cancelamento com pagamentos
- `cancelOrder(orderId, { estornar })`, uma transação: estoque (regra
  existente, só se `delivered`) + `status: 'canceled'` + parcelas `previsto` →
  `cancelado` + se tinha `saleId`, a `Sale` → `status: 'canceled'` (decisão do
  usuário; sem devolver estoque pela venda) + pagamentos `pago` conforme
  `estornar`: `true` → `estornado` (saem do Recebido); `false` → ficam `pago`
  (sinal retido).
- Sinal retido (decisão do usuário): conta só como Recebido; NÃO gera `Sale`;
  Vendas/lucro não mudam; sem comissão.

### Visões derivadas (funções puras únicas, sem coleção)
- Recebido (por período, base `paidDate`) = soma dos `pago` de todos os pedidos
  (inclui `finished`, sinal retido e antigos derivados). A receber = soma dos
  `previsto` de pedidos não cancelados. Vencido = `previsto` com `dueDate`
  anterior a hoje.
- Kanban: pedido `delivered` com `saldo > 0` e `saldoDescoberto == 0` sai de
  Pedidos > kanban e é acompanhado só na aba A receber. `finished`/`canceled`
  continuam fora (seção 5).
- Aba "A receber" em Pedidos (mobile incluso): cards Vencido / Vence este mês /
  Próximos; grupos VENCIDAS / ESTE MÊS / PRÓXIMOS MESES; linha com cliente,
  `#numero`, parcela k/n (posição entre os pagamentos com `dueDate` do pedido),
  valor, "venceu há X dias"/"vence dd/mm" e [Recebi], que abre Registrar
  pagamento com o valor da parcela preenchido e editável.
- Relatório > sub-aba "A receber" (panorama anual): 12 meses empilhados
  recebido / previsto / vencido não pago; cards Recebido no ano, A receber no
  ano, Vencido total; clique no mês abre as parcelas. Vendas/Balanço ganham
  cards Recebido no período e A receber. Todos usam as MESMAS funções de cálculo
  da aba de Pedidos.
- Valor estimado em Pedidos: total / pago / saldo sobre `filteredOrders$`
  (respeita filtros); pedidos que saíram do kanban não entram.

## 5.4 Pedido recorrente (`recurringOrders`) — [CRÍTICA]

Decisões do usuário (2026-10-20/21). Um **modelo** (`recurringOrders`, com
`companyId`) gera pedidos comuns em `orders` numa agenda.

### Onde vive
- Nasce no **detalhe do pedido**, ação "Repetir pedido" (frequência, dias da
  semana, 1ª data, fim opcional). Nenhum botão novo no card da lista.
- Pedido gerado cai no kanban como pedido normal (`pending`), com selo discreto
  de recorrente (`Order.recurringOrderId` preenchido).
- Gestão de todos: pill "Recorrentes" ao lado de "Pedidos | A receber", só
  aparece se existir algum modelo. Tela do cliente: só lista de leitura
  "Pedidos recorrentes deste cliente" com atalho pausar/editar.

### Agenda
- Frequências: `weekly` (a cada 7 dias de `startDate`), `biweekly` (14 dias),
  `monthly` (dia de `startDate`; mês sem o dia usa o último dia do mês; sempre
  ancorado em `startDate`, nunca no resultado anterior), `weekdays` (toda semana
  nos dias marcados, 0=domingo..6; sem "a cada N semanas").
- `endDate` opcional e **inclusivo**. Datas da agenda são strings civis
  `yyyy-MM-dd` no calendário local (BR), sem fuso.
- O pedido original **não** conta como ocorrência: a 1ª gerada é `startDate`
  (padrão no modal: a 1ª data da agenda depois da `scheduledDate` do original).
- Validação: frequência do enum; `weekdays` só em `weekdays`, não vazio, valores
  0..6; datas válidas; `endDate >= startDate`.

### Geração (automática, idempotente)
- **Mecanismo atual: no cliente**, ao abrir Pedidos (uma vez por sessão, com o
  módulo pedidos ligado). Funciona igual em homolog e prod. A **Cloud Function
  agendada** (gera sem ninguém abrir o app) entra **só em produção**, quando a
  feature for para prod (decisão do usuário) — homolog é Spark e não roda
  Functions. As duas usam o mesmo núcleo e a mesma idempotência.
- Gera ocorrências com data `<= hoje + 2 dias` (antecedência). Catch-up: só
  datas `>= hoje - 3 dias` (mais antigas são ignoradas), `>= generateFrom` e
  depois de `lastGeneratedDate`; no máximo 14 por modelo por execução.
  A janela é `[maior(generateFrom, lastGeneratedDate+1, hoje-3), menor(hoje+2,
  endDate)]`; vazia → nada a gerar. Logo, `endDate` recém-passado ainda gera o
  que ficou para trás dentro do catch-up (ex.: fim 09, hoje 10 → janela 07..09).
  O teto de 14 pega as 14 primeiras datas da janela, em ordem crescente.
  `weekdays` preenchido em frequência diferente de `weekdays` →
  `DIAS_DA_SEMANA_INVALIDOS`. Próxima ocorrência depois de uma data anterior a
  `startDate` é a própria `startDate`.
- Pausar → não gera; **retomar** grava `generateFrom = hoje` (nunca gera o
  período pausado). **Encerrar** é definitivo (não reabre). Sem próxima data
  (passou do `endDate`) → modelo vira `ended` automaticamente.
- Idempotência: id do pedido gerado = `rec_{recurringOrderId}_{yyyyMMdd}`;
  criação em transação que lê o contador e o modelo e usa o **cursor**
  (`lastGeneratedDate`, monotônico) como trava: data `<=` cursor → já gerada
  (não escreve). Grava pedido + contador (`orderNumber`) + cursor
  (`lastGeneratedDate`, `generatedCount`) juntos; corrida entre dispositivos
  colide no doc do modelo e o perdedor relê o cursor. Não se lê doc
  inexistente (as rules negam leitura sem `companyId`, e isso NÃO é afrouxado);
  produtos atuais vêm de consulta filtrada por `companyId` antes da transação
  (produto excluído simplesmente não volta → ocorrência pulada). Pedido gerado que
  foi cancelado/excluído **não** é regenerado.

### Conteúdo do pedido gerado
- Itens do modelo (sem preço); **preço e custo atuais** do produto no momento da
  geração. Produto por peso: kg fixo no modelo, preço por kg atual; total pela
  mesma fórmula de Pedidos (`calcularTotalDoPedido`).
- Produto do item excluído, de outra empresa ou com preço inválido → a
  ocorrência inteira é **pulada** (cursor avança, `lastIssue` grava o motivo e a
  UI avisa); sem consumir `orderNumber`. Falta de estoque **não** impede: o
  estoque segue validado/baixado só na entrega (seção 5).
- Detalhes (Kira, derivados de "dados atuais do produto", 2026-10-21; o
  usuário pode revisar): nome do item = título **atual** do produto; se o
  produto mudou entre unidade e peso desde o modelo (`soldByWeight` diverge), a
  ocorrência é **pulada** (`PRODUTO_INDISPONIVEL`), porque a quantidade do
  modelo perde o sentido; preço **ou custo** inválido = não finito (inclui
  ausente) ou **negativo** (zero é aceito, como no cadastro manual) — custo
  quebrado contaminaria lucro e comissão. Modelo exige itens não vazios com
  `quantity` finita > 0 (senão `ITENS_INVALIDOS` na criação). `sourceOrderId`
  só é gravado se o pedido tiver id. O `detail` do problema cita o nome do
  produto.
- Cliente, endereço, coordenadas, frete, tipo de entrega, observações e
  vendedor vêm do modelo (snapshot; cliente excluído não impede). Comissão pela
  regra normal (5.2).
- Cada pedido gerado é independente: pagamentos/parcelas pela seção 5.3, por
  pedido (sem mensalidade). Editar um gerado não muda o modelo; editar o modelo
  só afeta ocorrências ainda não geradas.

## 6. Rotas de entrega

- Consome pedidos pendentes/ativos (`OrderService.getPendingOrders`, status em
  `['open','pending','preparing','ready','delivering','delivered']`) para
  montar uma rota.
- Gera link do Google Maps com os endereços dos pedidos em sequência
  (`https://www.google.com/maps/dir/...`) — não calcula rota otimizada
  internamente, delega ao Google Maps.

## 7. Contas a pagar/receber (`bills`) — [CRÍTICA]

- `status`: `'pendente' → 'recebido' → 'pago'` (avanço sequencial, uma etapa
  por vez — `avancarStatusBill` no componente de estoque só avança para o
  próximo estado, nunca pula etapa nem regride).
  - Confirmado com o usuário (2026-08-11): o rótulo de UI do status
    `'recebido'` mostrava "A Pagar" (`billStatusLabel`/`statusLabel` em
    `product-inventory.ts`/`bills.ts`), confundindo com o título geral da
    tela "Contas a Pagar". Corrigido só o texto de exibição pra "Recebido"
    (TASK-028) — o valor `'recebido'` salvo no banco não mudou.
- `receivedAt` é preenchido ao entrar em `'recebido'`, `paidAt` ao entrar em
  `'pago'`.
- `recurring` + `recurrencePeriod` (`'semanal' | 'mensal'`) marca contas
  recorrentes. Decisão confirmada com o usuário (2026-08-11) sobre geração
  automática da próxima ocorrência (TASK-029/030): abordagem client-side
  (checagem ao carregar a tela de Contas, sem Cloud Function — o projeto
  não tem infra de Functions hoje); escopo só para bills vinculadas a
  `purchaseProductId` (conta recorrente manual sem produto não entra);
  catch-up gera só a ocorrência mais recente (não recria as intermediárias
  perdidas se o app ficar muito tempo sem abrir); próxima data de
  vencimento é âncora (última data conhecida) + período, nunca "hoje +
  período" — preserva o dia do calendário mesmo com atraso na checagem.
- Uma conta pode nascer vinculada a uma compra (`purchaseProductId`), gerada
  automaticamente ao cadastrar um "produto de compra" recorrente
  (`gerarBillDeProdutoCompra`) ou ao confirmar uma entrada de estoque com a
  opção "gerar conta a pagar" marcada.
- Escopo temporal da listagem em `bills.ts` (tela Contas a Pagar) — regra de
  exibição, não crítica (não altera a máquina de estado descrita acima).
  Decidido com o usuário (2026-08-16): a tela não tem seletor de mês, o
  escopo é sempre "mês atual", fixo. Conta com `status === 'pendente'`
  sempre aparece na listagem, independente de qualquer data — não tem
  prazo, precisa ficar visível até ser resolvida. Conta com
  `status === 'recebido'` só aparece se `receivedAt` cair no mês corrente.
  Conta com `status === 'pago'` só aparece se `paidAt` cair no mês
  corrente. Contas recebidas/pagas em meses anteriores saem da tela (ficam
  só no histórico do Firestore, não na listagem). O filtro `filtroStatus`
  (todos/pendente/recebido/pago) já existente continua funcionando por
  cima desse escopo mensal — é um AND, não substitui o escopo temporal.

## 8. Produtos de compra (`purchaseProducts`)

- Representa insumos/despesas recorrentes (ex.: aluguel, fornecedor fixo) que
  não são produtos de estoque revendáveis — ao cadastrar um novo, gera
  automaticamente uma `bill` (conta a pagar) correspondente.
- Diferença de nomenclatura de período: aqui `'weekly'|'monthly'` (inglês);
  em `bills.recurrencePeriod` é `'semanal'|'mensal'` (português) — o
  service faz o mapeamento entre os dois (`recPeriodMap`).

## 9. Clientes (`customers`)

- Endereço estruturado: `cep, rua, numero, complemento, bairro, cidade, uf`
  (mais `lat`/`lng` para geolocalização), além de um campo `address` livre
  (texto formatado, usado como fallback/exibição).
- Busca de CEP integrada via API pública ViaCEP (`viacep.com.br`) para
  autopreencher endereço.

## 10. Multi-tenant / Autenticação — [CRÍTICA]

- Isolamento entre empresas é feito por campo `companyId: string` em cada
  documento das coleções operacionais (`products`, `sales`, `orders`,
  `comandas`, `bills`, `customers`, `purchases`, `purchaseProducts`) — não por
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
  `gestao`, `rotas`, `contas`, `clientes` (sub-módulo de gestão), `compras`
  (sub-módulo de gestão, opcional — pode ser desativado independentemente).
- `gestao` e `clientes` são módulos **obrigatórios**: nunca podem ser
  desativados pela tela de Configurações, ao contrário dos demais módulos
  — incluindo `compras`, que segue opcional mesmo sendo sub-módulo de
  `gestao`. Essa garantia se aplica em três pontos, e falha em qualquer um
  deles quebra a regra:
  1. UI — `gestao` e `clientes` nem aparecem em `moduleOptions`
     (`ConfigComponent`/`config.html`): a tela de Configurações só lista
     módulos que de fato podem ser desligados (os outros 5, incluindo
     `compras`, continuam com toggle livre).
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
- 3 queries (`BillService.getBills`, `PurchaseProductService.
  getPurchaseProducts`, `SaleService.getSalesByDate`) combinam `where
  ('companyId',...)` com `orderBy`/range em outro campo — exigem índice
  composto no Firestore de produção real (o emulador não cobra isso). Sem
  `firestore.indexes.json` (ver TASK-026), essas telas quebram no primeiro
  uso após o deploy.
- **Pagamentos/parcelas de Pedidos (seção 5.3) — pontos assumidos, confirmar:**
  (1) pagamento avulso com parcelas existentes abate das mais antigas; (2) pagar
  mais que a parcela reduz as próximas em cascata; (3) nova parcela "+30 dias" é
  contada a partir da `dueDate` da parcela paga; (4) pedido com saldo sem parcelas
  NÃO entra em "A receber" (fica no kanban); (5) "A receber no ano" = parcelas
  previstas não vencidas com `dueDate` no ano, e "Vencido total" soma todos os
  anos; (6) pedido `finished` antigo sem `paymentMethod` é derivado como
  `dinheiro`; (7) `paidDate` futura não é bloqueada; (8) estorno só tira o valor
  do Recebido, sem lançamento de saída em Contas.
- ~~Fechar Sale de pedido cancelado após entrega~~ — resolvido pela seção 5.3
  (decisão do usuário de 2026-10-20: a `Sale` é cancelada junto).

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
