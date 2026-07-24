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
  da última compra registrada, não uma média ponderada. ⚠️ Confirmar se esse
  é o comportamento desejado (FIFO/média não é usado).
- Estorno de compra (`deletePurchase`) é negado se o estoque atual for menor
  que a quantidade da compra a estornar (não deixa estoque negativo).

## 3. Vendas (`sales`) — [CRÍTICA]

- Toda venda tem `sale_type`: `'pdv'` (balcão) ou `'order'` (originada de um
  pedido finalizado). `customerId` só é preenchido em vendas do tipo `order`
  com cliente vinculado — vendas de PDV nunca têm `customerId`.
- `paymentMethod`: `'dinheiro' | 'pix'` (enum `PaymentMethod`).
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
- **Finalização financeira** (`finalizeOrder`): gera um registro em `sales`
  (`sale_type: 'order'`, com `paymentMethod` escolhido), sem baixar estoque de
  novo (`processSale(saleData, false)` — o estoque já saiu em `markAsDelivered`),
  e marca o pedido como `finished` com `paymentDate` e `closingDate`.
- Datas do ciclo de vida: `createdAt`, `scheduledDate` (previsão),
  `actualDeliveryDate` (preenchida em `delivered`), `paymentDate` e
  `closingDate` (preenchidas em `finished`).

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
  - ⚠️ Os rótulos de UI usam `'recebido'` como "A Pagar" (ver
    `billStatusLabel` em `product-inventory.ts`) — nome do status no banco
    (`recebido`) não bate com o rótulo mostrado ao usuário (`A Pagar`).
    Confirmar com o usuário se isso é intencional ou débito técnico de
    nomenclatura.
- `receivedAt` é preenchido ao entrar em `'recebido'`, `paidAt` ao entrar em
  `'pago'`.
- `recurring` + `recurrencePeriod` (`'semanal' | 'mensal'`) marca contas
  recorrentes — ⚠️ não foi encontrada, no código revisado, nenhuma rotina que
  gere automaticamente a próxima ocorrência de uma conta recorrente; parece
  ser só um campo informativo hoje.
- Uma conta pode nascer vinculada a uma compra (`purchaseProductId`), gerada
  automaticamente ao cadastrar um "produto de compra" recorrente
  (`gerarBillDeProdutoCompra`) ou ao confirmar uma entrada de estoque com a
  opção "gerar conta a pagar" marcada.

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
  (sub-módulo de gestão).
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
  de tasks — não bloqueia o resto do multi-tenant.
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
