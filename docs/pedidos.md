# Módulo: Pedidos (forma de pagamento detalhada)

## Visão geral

Ao finalizar um pedido (`OrderService.finalizeOrder`), o operador agora
escolhe a forma de pagamento entre Dinheiro, Pix, Cartão ou Cheque, com
número de parcelas quando aplicável (Pix é sempre à vista). Esse dado passa
a ser filtrável na aba Histórico Geral e na aba Relatório/Dash (ambas dentro
de Gestão, `product-inventory.ts`). Escopo desta entrega é só a finalização
de Pedidos — PDV e Comandas não mudaram.

## Regras de negócio implementadas

Ver `.claude/context/regra-de-negocio.md` seções 3 (Vendas) e 5 (Pedidos).
Resumo:

- `PaymentMethod` (compartilhado com PDV/Comandas em `sell-model.ts`) ganhou
  `CARTAO` e `CHEQUE`, além de `DINHEIRO`/`PIX` já existentes. PDV e
  Comandas continuam só usando `DINHEIRO`/`PIX` na prática — o tipo é mais
  largo que o uso real, mesmo padrão já existente em `Order.status`.
- `installments` (novo campo em `Sale` e em `Order`) é **só metadado**: `1`
  ou ausente = à vista, `N` = parcelado. Não existe controle de parcela
  individual (datas de vencimento) nem integração com Contas a Receber —
  decisão confirmada com o usuário (2026-08-15), fora de escopo.
- **Pix é sempre à vista, garantido na camada de serviço**: `finalizeOrder`
  normaliza `installments` (`Number(...)`, mínimo 1) e força `installments
  = 1` sempre que `paymentMethod === PaymentMethod.PIX`, independente do
  valor recebido — não depende da UI esconder o campo de parcelas. Achado
  do `style` na primeira rodada de revisão: a UI sozinha (campo condicional
  que some pra Pix) deixava vazar um `selectedInstallments` desatualizado se
  o usuário trocasse de forma de pagamento depois de digitar parcelas.
- `finalizeOrder` grava `paymentMethod`+`installments` **nos dois lugares**:
  no `Sale` criado (`sale_type: 'order'`, alimenta o Relatório/Dash) e no
  próprio `Order` (junto do `status: 'finished'`/`paymentDate`/
  `closingDate`, alimenta o branch "pedido" do Histórico Geral). Decisão de
  arquitetura do `killua`: duplicar um campo pequeno e imutável pós-
  finalização é mais barato que inventar um join Histórico → `sales` por
  `orderId` (que não existe hoje).
- Histórico Geral e Relatório/Dash ganharam filtro combinável por forma de
  pagamento (`filtroHistoricoFormaPagamento` e `filtroFormaPagamento`),
  mesmo padrão dos filtros de origem/cliente/produto já existentes nas duas
  abas.

## Modelo de dados / telas entregues

- **`src/models/sell-model.ts`**: `PaymentMethod` (4 valores) +
  `PAYMENT_METHOD_LABELS: Record<PaymentMethod,string>` (rótulos pt-BR
  centralizados); `Sale.installments?: number`.
- **`src/models/order-model.ts`**: `Order.paymentMethod?: PaymentMethod`,
  `Order.installments?: number`.
- **`OrderService.finalizeOrder(order, paymentMethod, installments = 1)`**
  (`src/services/order-service/order-service.ts`): assinatura ganhou o 3º
  parâmetro; normaliza e grava nos dois documentos (ver regras acima).
- **`SaleService.processSale`** (`src/services/sale-service/sale-service.ts`):
  passou a persistir `installments` quando presente no payload.
- **`OrdersComponent`** (`src/components/order/order.ts` +
  `order.html`/`order.css`): modal de pagamento ganhou select de forma de
  pagamento (antes hardcoded pra Dinheiro, sem select nenhum) + campo de
  parcelas condicional (`*ngIf="requiresInstallments"`, some pra Pix).
  `selectedPaymentMethod` é getter/setter — o setter reseta
  `selectedInstallments` pra 1 sempre que o novo valor é Pix.
- **`ProductInventoryComponent`** (`src/components/product-inventory/
  product-inventory.ts` + `.html`): `paymentMethodLabel()`, campo
  `paymentMethod` em `HistoricoItem` (populado em `itensPdv`/`itensPedido`,
  ausente em `itensComanda`), filtros novos aplicados em
  `historicoFiltrado`, `atualizarRelatorio` e nos 2 métodos de gráfico.

## Lacunas conhecidas / pendências

- Filtro por forma de pagamento em `product-inventory.ts` é aplicado de
  forma repetida em 3 lugares (`atualizarRelatorio`, gráfico de top-produtos,
  `historicoFiltrado`) — dívida técnica pré-existente (mesmo padrão já usado
  pros filtros de origem/cliente), não introduzida por esta entrega. Vale um
  refactor futuro pra extrair um método único de predicado de filtro.
- Comandas não têm forma de pagamento — nunca tiveram vínculo com `Sale`
  (lacuna já documentada na seção 4 da regra-de-negocio.md), então o filtro
  de forma de pagamento simplesmente não afeta itens de origem "comanda" no
  Histórico.
- Registros de `Sale`/`Order` anteriores a esta entrega não têm
  `installments` — campo optional, sem backfill necessário.

## O que cada agent entregou

- **killua**: modelagem — decidiu estender o enum `PaymentMethod`
  compartilhado (em vez de um tipo isolado só pra Order) e duplicar
  `installments`/`paymentMethod` em `Sale` e `Order` em vez de criar join;
  entregou os esqueletos de assinatura pro TDD.
- **mike**: 24 testes novos no total (RED → GREEN em duas rodadas). Rodada
  1: 19 testes cobrindo `finalizeOrder`, `requiresInstallments`,
  `paymentMethodLabel`, filtro de Histórico. Rodada 2 (pós-achado do
  style): 5 testes cobrindo o vazamento de parcelas pro Pix e normalização
  de `installments` inválido (0/negativo). Também resolveu 2 obstáculos de
  testabilidade no caminho: mock de `ActivatedRoute` no TestBed do
  `ProductInventoryComponent` (nenhum precedente no repo) e simplificação
  do setup de `finalizeOrder` (seed direto de `Order` via `setDoc` em vez de
  encadear `addOrder`+`markAsDelivered`, que causava `PERMISSION_DENIED`
  instável no emulador por transações Firestore encadeadas).
- **levi**: implementação GREEN das duas rodadas — `finalizeOrder`,
  `requiresInstallments`, filtros/labels do Histórico/Relatório na rodada 1;
  normalização defensiva de `installments` + getter/setter de
  `selectedPaymentMethod` com reset automático pra Pix na rodada 2.
- **hanzo**: UI do zero no modal de pagamento (`order.html` não tinha select
  nenhum antes — era hardcoded pra Dinheiro), filtros novos nas duas abas de
  `product-inventory.html`, coluna de forma de pagamento no card de
  Histórico — sem cor crua, só tokens de identidade visual.
- **style**: gate em duas rodadas. Achado real na rodada 1: `Pix` não era
  garantidamente à vista — trocar de forma de pagamento depois de digitar
  parcelas vazava o valor antigo pro Firestore, sem trava nenhuma na camada
  de serviço. Rodada 2: aprovado, confirmando testes rodados de verdade
  contra o emulador (não só lendo código).

## Notas operacionais

- Durante a implementação, um agent (`levi`) fez um commit intermediário
  (`b0bc68b`) sem autorização explícita — commit ficou incompleto (não
  inclui os models/specs que o resto do fluxo ainda dependia). Kira não
  amendou; decisão sobre organizar o histórico de commits fica com o
  usuário no fechamento desta entrega.
- Há mudanças não relacionadas a este módulo (`src/components/login/
  login.html`/`login.ts`) sentadas no mesmo working tree, sinalizadas pelo
  `style` — não fazem parte desta entrega e não devem ir no mesmo commit
  sem confirmação separada do usuário.
