# Notificações

Painel de notificações da Home (ícone de sino). Tipos: aniversariantes do
dia, despesas a vencer e parcelas de clientes a vencer (opcionais por empresa)
e mensalidade da plataforma (obrigatório, não desligável). Regras: `context/regra-de-negocio.md` seções 9
(Clientes), 10 (Multi-tenant), 11 (Configuração por empresa) e 15
(Mensalidade).

## Fontes de dados

| Tipo | Origem | Liga/desliga |
|---|---|---|
| Aniversário | `CustomerService.getAniversariantesDoDia()` — compõe sobre `getCustomers()` (já filtrado por `companyId`), filtro mês/dia em memória | `ModuleConfig.notificacoes.aniversario` |
| Despesas a vencer | `notification-rules.ts` (janela `JANELA_AVISO_DIAS` = 3 dias, inclui vencidas) sobre despesas `a_pagar` | `notificacoes.despesasVencendo` e módulo `contas` |
| Parcelas a vencer | `notification-rules.ts` sobre parcelas previstas de pedidos | `notificacoes.parcelasVencendo` e módulo `pedidos` |
| Mensalidade | `SubscriptionService.getOpenChargesOfCompany(companyId efetivo)` + `cobrancasComAviso` (5 dias antes, atraso; paga some) | não desligável (fora de `modules.notificacoes`) |

Detalhes da mensalidade: `docs/backend/mensalidade.md`.

## Regras aplicadas

- Sino aparece se algum tipo estiver ativo ou houver aviso de mensalidade;
  badge (`totalAvisos`) soma todos os tipos ativos.
- Mensalidade: "Mensalidade vence em N dias" / "vence hoje" / "em atraso há X
  dias", com valor e vencimento, sem chave Pix; atraso destacado.
- Super-admin em override de empresa vê os avisos da empresa selecionada.

## Decisões técnicas vigentes

- `Customer.dataAniversario` é string `'YYYY-MM-DD'` (não `Timestamp`) para
  evitar off-by-one de fuso na comparação mês/dia.
- `ModuleConfig.notificacoes` é objeto com sub-flags (`aniversario`,
  `despesasVencendo`, `parcelasVencendo`); por isso o
  `ConfigService` faz merge profundo dessa chave e a tela de Configurações usa
  toggle dedicado (`toggleNotificacaoAniversario`), nunca o genérico.
- Painel não usa `moduleGuard`; é leitura condicional no template.
- Falha ao ler cobranças registra `console.error` e mostra lista vazia (a Home
  nunca quebra por isso).
- "Hoje" dos avisos de mensalidade é avaliado quando as cobranças mudam; com a
  aba aberta na virada do dia não recalcula (aceito na v1).

## Lacunas conhecidas / pendências

- `ConfigService.updateModules` não protege `gestao`/`clientes` contra
  desativação na camada de escrita (só a UI trava) — seção 11.
- Próximos tipos (ex.: estoque baixo) seguem o padrão de `NotificationConfig`.
- Janelas diferentes por tipo: despesas/parcelas 3 dias, mensalidade 5 dias
  (decisões de regra distintas).
