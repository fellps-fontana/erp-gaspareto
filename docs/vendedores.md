# Módulo: Vendedores (`vendedores`)

## Visão geral

Feature nova: cadastro de vendedor (nome + comissão por produto) dentro de
Gestão, integração opcional com Pedidos, e um relatório de comissão a pagar
por vendedor dentro do Dashboard. Sub-módulo opcional — pode ser desligado
inteiro em Configurações sem afetar o resto do sistema.

## Regras de negócio implementadas

Ver `.claude/context/regra-de-negocio.md` seção 5.2 (Vendedores — CRÍTICA).
Resumo:

- Model `Vendedor`: nome + lista de comissão produto a produto
  (`VendedorComissaoItem { idProduct, percentual }`, 0-100). Produto do
  catálogo sem entrada correspondente = 0%/sem comissão. Sem soft-delete
  (mesmo precedente de `Product`).
- Vínculo no pedido é **opcional** (`Order.vendedorId?`/`vendedorName?`) —
  pedido pode ser criado/editado/finalizado sem vendedor.
- Cálculo de comissão a pagar (`VendedorService.calculateComissaoVendedor`,
  método estático e puro): filtra internamente por
  `status === 'finished'` e `vendedorId === vendedor.id` (não confia que o
  caller já filtrou, por ser cálculo de dinheiro a pagar). Base de cálculo
  **exclui frete** (`shippingCost`) — só soma `priceAtSale * quantity` dos
  itens. Decisão fechada com o usuário em 2026-08-19.
- Módulo `vendedores` em `ModuleConfig`: não obrigatório (like `compras`).
  Desligado, some da UI por completo — aba de cadastro em Gestão, sub-aba do
  Dashboard e o campo de seleção no Pedido, não apenas desabilitados.

## Modelo de dados / telas entregues

- **`src/models/vendedor-model.ts`**: `Vendedor`, `VendedorComissaoItem`,
  `ComissaoVendedorResultado`.
- **`src/services/vendedor-service/vendedor-service.ts`**: CRUD multi-tenant
  (espelha `CustomerService`) + `calculateComissaoVendedor` estático.
- **`src/models/order-model.ts`** / **`company-config.ts`**: campos
  `vendedorId?`/`vendedorName?` em `Order`; chave `vendedores: boolean` em
  `ModuleConfig`/`DEFAULT_MODULES`.
- **`src/components/product-inventory/`**: nova aba `activeTab === 'vendedores'`
  (CRUD: nome + tabela de % por produto ativo) no mesmo slot arquitetural de
  Clientes; nova sub-aba `reportTab === 'vendedores'` dentro do Dashboard,
  mostrando total vendido + comissão a pagar por vendedor no período
  filtrado (reusa `calculateComissaoVendedor`, sem duplicar lógica de
  cálculo no componente).
- **`src/components/order/`**: `<select>` opcional de vendedor, mesmo padrão
  de `selectedCustomerId`, gate por `config.modules().vendedores`.
- **`src/components/config/`**: entrada `vendedores` (sub-módulo) em
  `moduleOptions`.
- **`firestore.rules`**: `'vendedores'` adicionada em
  `isOperationalCollection` — sem essa entrada, toda leitura/escrita na
  coleção era negada em produção mesmo com o service funcionando nos testes
  unitários (achado do `style`, corrigido antes do fechamento).

## O que cada agent entregou

- **killua**: modelagem completa (model, contrato do service, assinatura
  exata de `calculateComissaoVendedor` pro TDD) e o texto da seção 5.2 da
  regra-de-negócio + entradas no `schema.dbml` — sem tool de escrita
  disponível no ambiente, Kira aplicou o texto mecanicamente.
- **mike**: 3 rodadas RED — 12 casos originais de `calculateComissaoVendedor`,
  1 caso de regressão pro guard de `vendedor.id`, e 5 casos de isolamento
  multi-tenant em `firestore.rules.spec.ts`. Confirmou GREEN de forma
  independente em cada rodada de correção.
- **levi**: implementação do CRUD + cálculo de comissão (GREEN nos 12 casos
  originais); 2 rodadas de correção depois do gate — guard de `vendedor.id`
  + nomenclatura, e a entrada faltante em `firestore.rules`.
- **hanzo**: toda a UI (config, cadastro em Gestão, sub-aba do Dashboard,
  campo no Pedido) em uma única rodada, build limpo.
- **style**: 2 achados reais na primeira rodada de gate — non-null assertion
  em `vendedor.id` permitindo pedido sem vendedor ser contado numa comissão
  fantasma (bug de dinheiro), e a coleção `vendedores` ausente de
  `isOperationalCollection` em `firestore.rules` (feature inteira falharia
  em produção apesar dos testes unitários verdes, já que eles não tocam
  Firestore de verdade). Ambos corrigidos e revalidados antes da aprovação
  final.

## Extensão: quebra por produto no relatório (2026-08-19)

Usuário pediu pra ver, no relatório de comissão, também o que cada
vendedor vendeu — não só o total agregado. `ComissaoVendedorResultado`
ganhou o campo `itens: VendedorItemVendidoResultado[]` (produto, quantidade,
valor vendido, comissão e percentual daquele item), agregado por
`idProduct` a partir dos mesmos pedidos já qualificados pelo cálculo
existente (mesma passada, sem duplicar lógica de filtro entre o total geral
e a quebra por item — ponto que `style` verificou explicitamente por ser
risco clássico de divergência). Ordenado por valor vendido desc. UI: card
de vendedor no Dashboard ganhou lista expansível dos itens (estado de UI
puro, sem recálculo de domínio no template — mesmo cuidado que motivou o
fix de travamento acima).

## Lacunas conhecidas / pendências

- Nenhuma pendência de escopo conhecida. Sem seletor de "vendedor ativo/
  inativo" — exclusão de vendedor é real (`deleteDoc`), sem soft-delete.
- Relatório de comissão no Dashboard usa o período já filtrado da tela
  (`filtroDataInicio`/`filtroDataFim`); não há exportação/fechamento formal
  de folha de comissão (fora do escopo pedido).

## Notas operacionais

- Durante a sessão, um subagent com acesso a Bash em paralelo (`hanzo`)
  executou um `git checkout` de branch que orfanou momentaneamente um commit
  do `levi` (histórico, não conteúdo — o arquivo em disco continuava
  correto). Sem perda de dado: Kira confirmou por `diff` que o working tree
  já tinha a versão final corrigida antes de commitar de novo. Trabalho
  fechado numa branch `feature/vendedores` dedicada, criada a partir do
  estado final, para não deixar o incidente no histórico de `main`.
- **Bug pós-deploy corrigido em 2026-08-19**: usuário reportou travamento
  total do sistema ao clicar em Vendedores. Causa: `comissoesPorVendedor`
  era um getter ligado direto no `*ngFor` do template, recalculado a cada
  ciclo de change detection do Angular — filtrava todos os pedidos
  carregados e rodava `calculateComissaoVendedor` por vendedor a cada tick,
  travando a thread de renderização com volume real de dados. Corrigido
  alinhando ao padrão já usado por vendas/contas/balanço: cálculo sob
  demanda (`atualizarComissoesVendedores()`), guardado em campo do
  componente, recalculado ao entrar na sub-aba ou mudar o filtro de data.
  Lógica de cálculo em si (`VendedorService.calculateComissaoVendedor`) não
  foi alterada — bug era de arquitetura de UI, não de regra de negócio.
