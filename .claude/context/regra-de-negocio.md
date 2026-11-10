# Regras de Negócio — ERP Gaspareto (sumário)

> Fonte da verdade do domínio. Extraído do código existente (services e models
> em `src/`). Regras marcadas **[CRÍTICA]** envolvem estoque, dinheiro ou
> transição de estado — qualquer mudança nelas passa por executor especializado
> + revisão (`style`), nunca decidida sozinha por quem orquestra. Pontos que o
> código não deixa claro estão marcados com ⚠️ e precisam confirmação do usuário.

> Formato modular — cada seção vive em `regra-de-negocio/`. Ler só o(s)
> arquivo(s) resolvido(s) para a tarefa + fechamento de dependência via a
> coluna "Depende de" abaixo (ver "Resolução de CONTEXTO A LER" no `CLAUDE.md`
> do orquestrador). Exceção: `killua` sempre lê este sumário inteiro.

## Índice de seções

| Arquivo | Título | Depende de |
|---|---|---|
| 01-visao-geral.md | Visão geral do domínio | — |
| 02-estoque.md | Estoque (`products`) [CRÍTICA] | — |
| 03-vendas.md | Vendas (`sales`) [CRÍTICA] | 02-estoque.md, 05-pedidos.md |
| 04-comandas.md | Comandas (`comandas`) [CRÍTICA] | 02-estoque.md |
| 05-pedidos.md | Pedidos (`orders`), Histórico Geral, Vendedores [CRÍTICA] | 02-estoque.md, 03-vendas.md, 11-configuracao-empresa.md |
| 06-rotas.md | Rotas de entrega | 05-pedidos.md |
| 07-contas.md | Contas a pagar/receber (`bills`) [CRÍTICA] | — |
| 08-produtos-compra.md | Produtos de compra (`purchaseProducts`) | 02-estoque.md, 07-contas.md |
| 09-clientes.md | Clientes (`customers`) | — |
| 10-multi-tenant-autenticacao.md | Multi-tenant / Autenticação [CRÍTICA] | 02-estoque.md, 03-vendas.md, 04-comandas.md, 05-pedidos.md, 07-contas.md, 08-produtos-compra.md, 09-clientes.md |
| 11-configuracao-empresa.md | Configuração por empresa (`companies/{companyId}`) | 10-multi-tenant-autenticacao.md |
| 12-lacunas.md | Lacunas / pontos sem regra definida no código | 10-multi-tenant-autenticacao.md, 13-super-admin.md |
| 13-super-admin.md | Super-admin da plataforma [CRÍTICA] | 10-multi-tenant-autenticacao.md, 11-configuracao-empresa.md |

Mantido por `killua` via skill `alterar-context`: toda edição que cria, remove
ou muda uma referência cruzada entre seções atualiza a linha correspondente
aqui.

## Pendências a definir

- ⚠️ Seção 4 (Comandas): não há, no código revisado, o passo que transforma
  uma comanda fechada em registro de `Sale` — confirmar com o usuário se esse
  vínculo existe em algum componente não lido ou se é uma lacuna real.
- Ver `12-lacunas.md` para a lista completa de pontos em aberto (auth,
  cobertura de teste, índices compostos, backfill de `companyId`).

## Nota de migração (2026-08-21)

Este arquivo era monolítico (~30 KB, 13 seções) até esta data. Migrado para o
formato modular seguindo a decisão registrada em
`~/.claude/agents/CHANGELOG.md` (entrada "Context modular"). Conteúdo
transcrito verbatim para os 13 arquivos de `regra-de-negocio/` — nenhuma
regra foi alterada nesta migração, só reorganizada. A tabela "Depende de"
acima foi auditada manualmente (não por script) a partir das referências
explícitas "seção X" no texto original, mais acoplamentos funcionais óbvios
(ex.: toda seção que decrementa/devolve estoque depende de 02; isolamento
multi-tenant em 10 cobre as coleções operacionais das seções 02–09, exceto
06 que não tem coleção própria).
