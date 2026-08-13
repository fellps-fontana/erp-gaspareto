# Módulo: Notificações

## Visão geral

Módulo novo, pensado desde o início para crescer além do escopo v1. A v1
entrega um único tipo de notificação — aviso de aniversário de cliente —
mas a estrutura de dados (`ModuleConfig.notificacoes`) já nasce como objeto
com sub-flags, não como booleano único, justamente para comportar novos
tipos (ex.: estoque baixo, conta a vencer) sem quebrar configuração já
salva de empresas existentes.

## Regras de negócio implementadas

Ver `.claude/context/regra-de-negocio.md` seção 9 (Clientes), seção 10
(Multi-tenant, CRÍTICA) e seção 11 (Configuração por empresa). Resumo:

- `Customer.dataAniversario` é campo opcional, string `'YYYY-MM-DD'`
  (date-only, sem hora/timezone) — decisão deliberada contra usar
  `Timestamp`: comparação de mês/dia entre fusos horários diferentes com
  `Timestamp` teria bug de off-by-one silencioso; string ISO elimina essa
  classe de bug e mapeia 1:1 com `<input type="date">`.
- `ModuleConfig.notificacoes: { aniversario: boolean }` — único campo não
  booleano de `ModuleConfig` hoje. Isso exigiu dois ajustes que quebravam
  silenciosamente se não fossem tratados: merge do `ConfigService`
  (spread raso perderia chaves novas de notificação no futuro) e o toggle
  da tela de Configurações (o loop genérico faz `!config.modules()[key]`,
  que substituiria o objeto inteiro por um booleano — corrompe o dado).
- `CustomerService.getAniversariantesDoDia()` reaproveita o filtro de
  `companyId` já existente em `getCustomers()` — nenhuma query Firestore
  nova foi criada. Filtragem por mês/dia acontece em memória, sobre dado
  já isolado por empresa (sem risco de vazamento novo).
- Painel na Home só aparece quando o módulo está ativo **e** há
  aniversariante no dia — não usa `moduleGuard` (que protege navegação de
  rota); é leitura condicional de config direto no template, mesmo padrão
  já usado pelos cards de menu da Home.

## Modelo de dados / telas entregues

- **Model:** `Customer.dataAniversario?: string` (`src/models/customer-model.ts`).
- **Model:** `NotificationConfig` e `ModuleConfig.notificacoes`
  (`src/models/company-config.ts`), com `DEFAULT_NOTIFICATIONS = { aniversario: true }`.
- **Service:** `ConfigService.loadCompanyModules` (`src/services/config/config.service.ts`)
  — merge profundo dedicado para `notificacoes`, além do spread raso usado
  pro resto do `ModuleConfig`.
- **Service:** `CustomerService.getAniversariantesDoDia(referencia?: Date)`
  (`src/services/customer-service/customer-service.ts`) — compõe sobre
  `getCustomers()`, filtra em memória por `dataAniversario.slice(5,10)`
  igual ao mês/dia de referência (seguro em 29/02 sem lançar erro em ano
  não bissexto, já que a comparação é puramente textual).
- **Tela:** formulário de cliente (`product-inventory.html`/`.ts`, aba
  Clientes dentro de Gestão) — campo `<input type="date">` opcional.
- **Tela:** Configurações (`config.ts`/`.html`) — item "Notificações" com
  sub-item "Aniversário", toggle dedicado `toggleNotificacaoAniversario()`
  que monta o objeto `notificacoes` completo via spread antes de gravar
  (nunca passa pelo `toggleModule` genérico).
- **Tela:** Home (`home.ts`/`.html`/`.css`) — painel condicional listando
  aniversariantes do dia (`toSignal(getAniversariantesDoDia())`).

## Lacunas conhecidas / pendências

- Nenhuma pendência aberta desta entrega v1.
- Achado do `style`, fora do escopo desta entrega, registrado para virar
  task separada: `ConfigService.updateModules` não protege `gestao`/
  `clientes` contra desativação na camada de escrita (só a UI trava hoje,
  via feature de badge "Obrigatório" mergeada em paralelo no mesmo PR) —
  a seção 11.2 do `regra-de-negocio.md` pede correção silenciosa também
  no service.
- Próximos tipos de notificação (estoque baixo, conta a vencer, etc.) já
  têm o padrão de extensão pronto em `NotificationConfig` — não modelado
  ainda porque não havia segunda instância real no momento da entrega.

## O que cada agent entregou

- **killua**: modelagem completa do contrato — decisão de `dataAniversario`
  como string date-only (não `Timestamp`), estrutura extensível de
  `NotificationConfig`, identificação antecipada de que o merge raso do
  `ConfigService` e o toggle genérico da tela de Configurações quebrariam
  com um campo `ModuleConfig` não booleano, com a correção de cada um já
  desenhada antes de codar.
- **levi**: `customer-model.ts`, `company-config.ts`,
  `config.service.ts` (merge profundo), `customer-service.ts`
  (`getAniversariantesDoDia`) — implementação em paralelo com hanzo, sem
  conflito de arquivo.
- **hanzo**: campo de aniversário no formulário de cliente, toggle
  dedicado em Configurações, painel de aniversariantes na Home.
- **style**: gate único, aprovado sem rodada de correção. Validou
  isolamento multi-tenant na query, merge profundo do config, ausência de
  corrupção de dado no toggle, campo realmente opcional, separação de
  camada (cálculo de data no service, não no componente). Dois achados
  leves sem bloqueio: comentário sem acento em `customer-service.ts`, e a
  lacuna pré-existente de `updateModules` citada acima.

## Notas operacionais

- **PR #4** — entrega única, sem rodada de correção do style.
- Durante a implementação, outra sessão alterou `config.ts`/`config.html`/
  `config.css` em paralelo (feature não relacionada de badge "Obrigatório"
  travando `gestão`/`clientes`), no mesmo working tree sem isolamento de
  worktree. As mudanças ficaram entrelaçadas linha a linha com a feature
  de notificações nesses três arquivos — não foi possível separar por
  hunk do git. Por decisão do usuário, o PR #4 incluiu as duas mudanças
  juntas.
- Merge fast-forward, sem conflito. Análise pós-merge sem divergência
  entre o que foi revisado e o que foi mergeado (diff vazio entre o commit
  do PR e o commit de merge para os 12 arquivos da entrega). Branch local
  apagada; branch remota pendente de deleção (permissão negada na sessão —
  usuário pode rodar `git push origin --delete feature/notificacoes-aniversario-cliente`).
