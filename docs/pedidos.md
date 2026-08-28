# Módulo: Pedidos (forma de pagamento detalhada)

## Visão geral

Ao finalizar um pedido (`OrderService.finalizeOrder`), o operador agora
escolhe a forma de pagamento entre Dinheiro, Pix, Cartão, Cheque ou Boleto,
com número de parcelas quando aplicável — inclusive Pix, que deixou de ser
sempre à vista (ver "Atualização 2026-08-28" abaixo). Esse dado passa
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
- ~~Pix é sempre à vista, garantido na camada de serviço~~ — **revertido em
  2026-08-28** (ver "Atualização" abaixo): Pix passou a aceitar parcelas
  igual Cartão/Cheque/Boleto. `finalizeOrder` normaliza `installments`
  (`Number(...)`, mínimo 1) igual pra qualquer forma de pagamento, sem
  exceção de Pix.
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

## Atualização 2026-08-18 — Boleto + edição de quantidade no carrinho

Duas melhorias independentes na tela de Pedidos, publicadas direto na
`main` (sem branch/PR — decisão explícita do usuário).

**Boleto como forma de pagamento** ([CRÍTICA], regra-de-negocio.md seções
3/5): `PaymentMethod` ganhou `BOLETO = 'boleto'` em `sell-model.ts`, com
label `'Boleto'` em `PAYMENT_METHOD_LABELS`. Boleto se comporta como
Cartão/Cheque — aceita parcelas normalmente, sem a trava de "Pix é sempre à
vista" (`requiresInstallments`/`finalizeOrder` não foram tocados, a lógica
já era genérica por `!== PaymentMethod.PIX`). Opção adicionada em 3
selects: modal "Finalizar Pedido" (`order.html`), filtro do Relatório de
Vendas e filtro do Histórico Geral (ambos em `product-inventory.html`).
`levi` implementou, `style` aprovou sem ressalvas na primeira rodada.

**Edição de quantidade no carrinho**: a lista "Itens do Pedido" (dentro do
overlay Nova Encomenda/Editar Pedido) trocou de chips inline
(`.cart-tag`, removido) para linhas (`.cart-row`) com controle `- [input] +`
por item — mesmo padrão já usado no PDV. Aditivo: o clique de adicionar
+1 na grade de produtos (`addToCart`) continua idêntico. Quantidade mínima
é 1 pelo controle editável; cair para 0 ou menos remove a linha
(`decreaseQuantity`/`onQuantityInputChange` reaproveitam `removeFromCart`).
Não é regra crítica (não persiste nada sozinho, só edita o carrinho antes
de `saveOrder`) — `hanzo` implementou, revisão inline do Kira.

Commits: `a03ea16` (Boleto), merge de `docs/bills.md` vindo do origin,
`c584365` (quantidade no carrinho) — push confirmado em `2882f55`.

## Atualização 2026-08-28 — Bug de quantidade no carrinho + Pix parcelado

Duas correções relatadas pelo usuário na mesma sessão, publicadas juntas via
PR #13 (`main`), validadas antes em staging (hologaerp).

**Bug: quantidade some ao editar no carrinho.** A implementação de
2026-08-18 (`onQuantityInputChange` reaproveitando `removeFromCart` "cair
para 0 ou menos remove a linha") tinha um efeito colateral não previsto: o
input usa `(ngModelChange)`, que dispara a cada tecla — ao apagar o "1" pra
digitar outro número, o campo passa por um estado vazio transitório,
`Number('') = 0`, e o handler removia o item da lista antes do usuário
terminar de digitar. Corrigido para: valor transitório inválido (vazio, "0",
negativo) não faz mais nada — não atualiza `item.quantity`, não remove o
item; só um valor final válido (inteiro ≥ 1) atualiza a quantidade. Novo
handler `onQuantityInputBlur` restaura o input pro último valor válido se o
campo for deixado inválido ao perder o foco. Remoção do item continua só via
ação explícita (botão "-" em quantity=1, botão "x") — comportamento dos
botões não mudou. `hanzo` implementou, `style` aprovou.

**Regra: "Pix é sempre à vista" removida.** Pedido explícito do usuário —
Pix passa a aceitar N parcelas igual Cartão/Cheque/Boleto. Trava removida em
2 pontos: `OrderService.finalizeOrder` (bloco que forçava
`installments = 1` quando `paymentMethod === PaymentMethod.PIX`) e
`OrdersComponent` (getter/setter customizado de `selectedPaymentMethod` que
resetava `selectedInstallments` pra 1 ao trocar pra Pix, e getter
`requiresInstallments` que escondia o campo Parcelas — ambos removidos,
viraram propriedades diretas; o campo Parcelas renderiza sempre). `killua`
arquitetou, `mike` reescreveu os testes RED, `levi` implementou GREEN,
`style` aprovou após uma rodada de correção (achado: `Order.installments`
tinha ficado forçado a 1 enquanto `Sale.installments` preservava o valor
real — inconsistência corrigida antes do merge).

**Pendência:** `.claude/context/regra-de-negocio/03-vendas.md` e
`05-pedidos.md` (formato modular, em migração não commitada em outra sessão
no momento desta entrega) ainda documentam a regra antiga "Pix não parcela"
— precisa sincronizar separadamente quando a modularização fechar.

**Nota operacional — colisão entre sessões:** durante esta entrega, duas
sessões Kira rodaram na mesma working directory sem isolamento (esta sessão
não usa worktree por padrão). Um commit desta entrega acabou preso no meio
do histórico da branch de outra sessão (`fix/cliente-endereco-opcional`) por
um checkout concorrente, e um subagent (`levi`) reverteu silenciosamente
arquivos de teste de outro subagent ao tentar respeitar a instrução "não
edite specs", deixando o build quebrado sem perceber (relatou "GREEN" que
não existia). Recuperado migrando pra um worktree isolado (`git worktree`)
e reconstruindo os testes manualmente, com verificação direta (não confiada
a relatório de subagent) antes do commit final. Ver memória de sessão
"parallel subagent git risk" para o padrão geral.

Commits: `c0e7e92`/`c8b36c1` (mesmo conteúdo, commits distintos em
`main`/`homologacao`) — PR #13.
