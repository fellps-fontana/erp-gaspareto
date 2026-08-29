# Produto por peso (kg)

> Feature transversal — toca cadastro de produto, Pedidos, PDV e Comandas.
> Entregue no PR #14 (branch `feat/produto-por-kilo`, merge `1ce2a1d`).

## O que faz

Um produto pode ser marcado como **vendido por peso** no cadastro
(`Product.soldByWeight`, checkbox "Vendido por peso (kg)", default
desmarcado). Quando marcado:

- `sellPrice` passa a significar **preço por kg** e `stock` **estoque em
  kg** — os rótulos do formulário de cadastro mudam junto
  ("Preço por kg (R$/kg)", "Estoque (kg)"). `buyPrice`/custo não muda.
- Ao adicionar o produto a um pedido / venda de PDV / comanda, entra
  **uma única linha** com quantidade semente `1` (= 1,000 kg). A
  "quantidade" da linha **é o peso em kg**.
- A linha é editada por um **input decimal** (`step=0.001`, até 3 casas,
  4ª casa arredonda), **sem os botões −/+**.
- **Não é possível adicionar o mesmo produto de novo** na mesma
  venda/pedido/comanda (regra de linha única). Em comanda aberta, além do
  aviso na UI, há backstop na transação do serviço.

Produto sem o campo (cadastro legado) = por unidade, comportamento
inalterado. Sem migração.

## Regras de negócio

Referências: `context/regra-de-negocio/02-estoque.md`,
`03-vendas.md`, `04-comandas.md`, `05-pedidos.md`.

- **Estoque (02)** — a baixa transacional (`increment(-quantity)`) e a
  checagem `currentStock < quantity` já toleram peso fracionado; o núcleo
  não foi reescrito. Só a guarda de merge de `ComandaService` mudou.
- **Vendas / Pedidos (03, 05)** — cada item guarda o snapshot
  `soldByWeight` junto de `priceAtSale`/`priceAtCost` (mesma lógica de
  congelar o histórico). `itemsTotal`/`total` do pedido são recalculados
  usando o total por peso quando a linha é por peso.
- **Comandas (04)** — `addToExistingComanda` **nunca soma** quantidade de
  produto por peso: se o produto (conforme o doc do produto, não o
  payload) já está na comanda, lança erro.
- **Arredondamento de dinheiro [CRÍTICA]** — o total da linha por peso é
  `preço/kg × peso` arredondado a 2 casas, "meio-pra-cima", imune a ruído
  de ponto flutuante (epsilon calibrado `1e-9`, sem requantização
  intermediária).

## Modelo de dados

- `Product.soldByWeight?: boolean` — ausente/`false` = por unidade.
- `OrderItem.soldByWeight?`, `ComandaItem.soldByWeight?`,
  `SaleItem.soldByWeight?` — snapshot booleano por linha, normalizado a
  boolean no write (Firestore rejeita `undefined`).

Regra pura isolada em **`src/services/product-service/product-weight-rules.ts`**:

| Função | Papel |
|---|---|
| `calcularTotalItemPorPeso(precoPorKg, pesoKg)` | total da linha, arredondado a centavo |
| `normalizarPeso(valor)` | converte input, arredonda a 3 casas, `NaN` se inválido |
| `validarPeso(valor)` | `{ valido, erro? }` — finito, `> 0`, ≤ 3 casas (checagem FP-safe) |
| `bloqueiaAdicaoPorPeso(itens, idProduct, soldByWeight)` | regra de linha única |

## Telas

- **Cadastro de produto** (`product-inventory`) — checkbox + rótulos
  condicionais + indicador `/kg` na listagem.
- **Pedido** (`order`) — guarda no `addToCart`, linha de peso, validação
  no salvar, `totalLinha(item)` delega às funções puras.
- **PDV** (`pdv`) — mesmo padrão + pré-checagem amigável antes de somar a
  uma comanda existente + validação nos 3 ramos de checkout (pagar / nova
  comanda / comanda existente).

## Lacunas conhecidas

- **Compras / entrada de estoque** (`PurchaseService`) não foi tocada: um
  produto por kg recebe estoque via compra como se fosse unidade e sai
  como peso. Aceito para esta entrega.
- **Relatórios / agregações** que somam `quantity` de todos os itens
  passam a misturar kg e unidade no mesmo número. Os valores em dinheiro
  (faturamento, lucro, comissão) seguem corretos. Fora de escopo.
- **`onPesoInputChange` no PDV** não pré-valida o peso contra o estoque
  (o caminho de unidade valida incrementalmente); o backstop transacional
  do serviço pega no checkout — só é aviso mais tardio.

## O que cada agente entregou

- **killua** — modelagem: campo no `Product`, peso no `quantity` da linha
  + snapshot `soldByWeight` no item (vs. campo `weight` separado), regra
  crítica isolável para TDD, backstop na comanda como ponto mais
  perigoso (`addToExistingComanda` somava).
- **mike** — RED/GREEN: 44 testes em `product-weight-rules.spec.ts`
  (halfway, ruído FP, linha única) + 3 no `comanda-service.spec.ts`
  (peso fracionado no estoque, trava de linha única no emulador). Também
  achou e corrigiu uma corrida de listener no próprio spec
  (`firstValueFrom(getOpenComandas())` → `getDoc` direto).
- **levi** — back: as 4 funções puras, a guarda de `addToExistingComanda`
  (decisão pelo doc do produto), propagação do snapshot em
  `processSale`/`finalizeOrder`.
- **hanzo** — UI nos 3 componentes; nenhum cálculo/validação inline
  (tudo via `product-weight-rules`); estilos em classe.
- **style** — gate fechado em 3 passadas. Pegou 2 bugs de arredondamento
  em regra de dinheiro: (1) `Number.EPSILON` pequeno demais na magnitude
  de centavos → halfway arredondava pra baixo (subfaturamento de 1¢);
  (2) `toFixed(4)` intermediário → double-rounding promovia valor abaixo
  do meio-centavo (`9,99 × 1,501` virava R$ 15,00). Também: reuso da
  função pura na guarda, estilos inline → classe.
- **gon** — não entrou (sem auth/dado sensível/input externo novo/
  dependência nova).

## Notas operacionais

- Deploy manual para `hologaerp` (`npm run deploy:hosting:staging`) — o
  auto-deploy via GitHub Actions segue quebrado (secret
  `FIREBASE_SERVICE_ACCOUNT_HOLOGAERP` ausente). Não houve mudança em
  `firestore.rules`, então `deploy:rules:staging` não foi necessário.
