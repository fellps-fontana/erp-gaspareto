# Mensalidade da plataforma

Controle da mensalidade que as empresas clientes pagam ao dono da plataforma.
Gerenciado só pelo super-admin (`isSuperAdmin`). v1 = controle + aviso: sem
gateway, pagamento fora do app (Pix), o super-admin marca como pago; atraso só
gera aviso, nada é bloqueado. Regra: `context/regra-de-negocio.md` seção 14
(e seções 10 e 13 para isolamento e super-admin).

## Coleções

- `subscriptions/{companyId}` — config por empresa (valor, dia de vencimento,
  ativa, início do contrato, `generateFrom`). Só super-admin lê/escreve.
- `subscriptionCharges/{companyId}_{yyyyMM}` — uma cobrança por empresa/mês.
  Empresa lê só as próprias; escrita só super-admin.
- Campos: `context/schema.dbml`.

## Serviço (`src/services/subscription-service/subscription-service.ts`)

| Método | Quem usa | Entrada → saída | Erros |
|---|---|---|---|
| `getConfigs()` | super-admin | → `Observable<SubscriptionConfig[]>` | — |
| `getCharges()` | super-admin | → `Observable<SubscriptionCharge[]>` | — |
| `getOpenChargesOfCompany(companyId)` | empresa (home) | → cobranças `a_pagar` da empresa | `permission-denied` se outra empresa |
| `saveConfig(companyId, input, hoje?)` | super-admin | valor, dia, ativa, início → grava config | `VALOR_INVALIDO`, `DIA_VENCIMENTO_INVALIDO`, `INICIO_INVALIDO` |
| `generateDueCharges(hoje?)` | tela Assinaturas | → nº de cobranças criadas | `GeracaoParcialError(criadas, empresasComFalha)` |
| `markAsPaid(chargeId, paidDate?)` | super-admin | `a_pagar` → `pago` | `JA_PAGA`, `DATA_PAGAMENTO_INVALIDA`, `COBRANCA_NAO_ENCONTRADA` |
| `undoPayment(chargeId)` | super-admin | `pago` → `a_pagar` | `NAO_PAGA`, `COBRANCA_NAO_ENCONTRADA` |

Erros de regra são `MensalidadeInvalidaError` com `codigo` estável.

## Regras aplicadas (seção 14)

- Geração idempotente por id determinístico + transação (lê, só grava se não
  existe); primeira cobrança no mês do início do contrato; antecipa a
  competência seguinte quando a janela de 5 dias abre; catch-up de meses.
- `amount` e `dueDate` congelados na cobrança; editar a config só afeta as
  próximas.
- "Vencida" é derivada (`avisoDaCobranca`), nunca gravada.
- Sem pagamento parcial (`paidAmount = amount`); desfazer limpa data e valor.

## Decisões técnicas vigentes

- Lógica pura em `subscription-rules.ts` (datas civis `yyyy-MM-dd`, sem fuso,
  reaproveitando helpers de `recurrence-rules.ts`); service só orquestra
  Firestore.
- Coleções próprias em vez de campos em `companies/{id}` (owner/admin têm
  update ali). Rules: `isSuperAdminUser()` avaliado antes de `resource.data`;
  `companyId == docId` em `subscriptions`; transições e imutabilidade de
  `companyId`/`competence`/`dueDate`/`amount` nas rules.
- Geração isola falha por empresa e identifica a falha pelo id do documento.
- Texto do aviso único em `textoDoAviso` (home e Assinaturas compõem prefixo).
- Geração roda no cliente quando o super-admin abre Assinaturas; Cloud
  Function agendada fica para produção, mesmo núcleo.

## Lacunas conhecidas / pendências

- Sem abrir Assinaturas no mês, a cobrança não nasce e a empresa não é avisada
  (aceito na v1 até a Function agendada).
- Rules não validam tipos de `amount`/`dueDate`/`dueDay`/`active`, mês 13 em
  `competence`, nem chaves extras no update (só super-admin escreve) —
  endurecimento sugerido pelo `gon`.
- `getConfigs`/`getCharges` sem teste próprio.
- Data de pagamento futura é aceita (sem regra definida).
