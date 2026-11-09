# Notificações

Painel de notificações da Home (ícone de sino). Hoje tem dois tipos:
aniversariantes do dia (opcional por empresa) e mensalidade da plataforma
(obrigatório, não desligável). Regras: `context/regra-de-negocio.md` seções 9
(Clientes), 10 (Multi-tenant), 11 (Configuração por empresa) e 14
(Mensalidade).

## Fontes de dados

| Tipo | Origem | Liga/desliga |
|---|---|---|
| Aniversário | `CustomerService.getAniversariantesDoDia()` — compõe sobre `getCustomers()` (já filtrado por `companyId`), filtro mês/dia em memória | `ModuleConfig.notificacoes.aniversario` |
| Mensalidade | `SubscriptionService.getOpenChargesOfCompany(companyId efetivo)` + `cobrancasComAviso` (5 dias antes, atraso; paga some) | não desligável (fora de `modules.notificacoes`) |

Detalhes da mensalidade: `docs/backend/mensalidade.md`.

## Regras aplicadas

- Sino aparece se o aniversário estiver ligado **ou** houver aviso de
  mensalidade; badge soma os dois.
- Mensalidade: "Mensalidade vence em N dias" / "vence hoje" / "em atraso há X
  dias", com valor e vencimento, sem chave Pix; atraso destacado.
- Super-admin em override de empresa vê os avisos da empresa selecionada.

## Decisões técnicas vigentes

- `Customer.dataAniversario` é string `'YYYY-MM-DD'` (não `Timestamp`) para
  evitar off-by-one de fuso na comparação mês/dia.
- `ModuleConfig.notificacoes` é objeto com sub-flags (extensível); por isso o
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
- Próximos tipos (estoque baixo, conta a vencer) seguem o padrão de
  `NotificationConfig`.
