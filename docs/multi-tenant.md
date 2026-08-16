# Módulo: Multi-tenant (Multi-empresa)

## Visão geral

Transforma o ERP Gaspareto de single-tenant (uma empresa por deploy, Firestore
aberto) em multi-tenant: várias empresas na mesma base, cada uma com seus
próprios usuários, produtos, vendas, clientes etc., sem que uma empresa veja
dado de outra. Isolamento por campo `companyId` em cada documento (não
subcoleção), autenticação por email/senha (fase 1, sem custom claims), e
`firestore.rules` como gate real de segurança — o filtro client-side sozinho
não bastava.

## Regras de negócio implementadas

Ver `.claude/context/regra-de-negocio.md` seção 10 (Multi-tenant /
Autenticação, **[CRÍTICA]**) para o racional completo. Resumo:

- Isolamento por `companyId: string` nas 8 coleções operacionais (`products`,
  `sales`, `comandas`, `orders`, `bills`, `customers`, `purchases`,
  `purchaseProducts`), `companies/{id}` e `users/{uid}`.
- Autenticação email/senha via Firebase Auth; sessão expõe `companyId`/`role`
  via `TenantService`/`AuthService`.
- Cadastro de empresa (self-service): `AuthService.signup` cria
  `companies/{uid}` + `users/{uid}` (role `owner`) na mesma transaction.
- `firestore.rules` valida `companyId` via lookup em `users/{uid}` (fase 1,
  sem Cloud Function de custom claims — essa é a TASK-023, opcional/fase 2,
  não implementada).
- Configuração por empresa (`ModuleConfig`) migrou do doc único
  `config/company` para `companies/{companyId}.modules`.

## Super-admin da plataforma

Extensão do multi-tenant: um flag global `isSuperAdmin: boolean` em
`users/{uid}` (independente do `role` por empresa) dá a quem o tem acesso
cross-tenant controlado. Ver `.claude/context/regra-de-negocio.md` seção 13
(**[CRÍTICA]**) para o racional completo. Resumo:

- **Troca de empresa ativa:** a home ganha um seletor (só visível pra
  super-admin) que troca o `companyId` efetivo da sessão via
  `TenantService.setActiveCompanyOverride()`, dentre empresas já cadastradas
  — nunca cria `companyId` novo. Decisão deliberada: libera leitura **e**
  escrita na empresa selecionada (super-admin opera a empresa, não só
  visualiza) — exceção mais arriscada que qualquer outra do sistema, aceita
  conscientemente.
- **Sem custom claims:** leitura direta de `users/{uid}` nas rules (mesmo
  padrão do resto do multi-tenant) — revogar o flag tem efeito imediato no
  próximo request, ao contrário de um claim, que ficaria preso ao JWT até
  1h de refresh.
- **Tela `/admin`:** lista todos os usuários da plataforma, permite resetar
  senha de terceiros e conceder/revogar `isSuperAdmin`. As duas ações
  passam por Cloud Functions (`resetUserPassword`, `setSuperAdmin` —
  primeira infra de Cloud Functions do projeto, plano Blaze,
  `us-central1`), que revalidam autorização no servidor via Admin SDK e
  nunca confiam em claim/dado do client. `setSuperAdmin` bloqueia
  `targetUid === uid do chamador` incondicionalmente, pra nunca ficar sem
  nenhum super-admin ativo por engano.
- **`firestore.rules`:** `isSuperAdminUser()` entra em `OR` aditivo com a
  checagem de `companyId` em `read`/`create`/`update`/`delete` das 8
  coleções operacionais e em `read` de `users`/`companies`. A trava
  `request.resource.data.companyId == resource.data.companyId` no `update`
  fica **fora** do `OR` — nem super-admin consegue migrar um documento de
  uma empresa pra outra.
- **Bootstrap:** ninguém nasce super-admin — o primeiro precisa ser setado
  manualmente (console do Firestore ou script avulso com Admin SDK), fora
  do fluxo do app. Passo operacional pendente após o merge desta feature.

## Modelo de dados / telas entregues

- **Models novos:** `Company` (`src/models/company-model.ts`), `AppUser`
  (`src/models/user-model.ts`).
- **Models existentes:** ganharam `companyId: string` obrigatório (Product,
  Sale, Comanda, Order, Bill, Customer, Purchase, PurchaseProduct).
- **Services novos:** `AuthService`, `TenantService`.
- **Guard novo:** `authGuard` (`src/guards/auth.guard.ts`).
- **Telas novas:** `/login`, `/signup`.
- **8 services de dados:** cada um injeta `TenantService`, filtra leituras
  por `companyId` e estampa `companyId` nas escritas; guarda explícita
  lança erro se `companyId()` for `null` no momento da escrita.
- **`firestore.rules`:** reescrito do zero — isolamento real por `companyId`,
  `users/{uid}` imutável do lado do cliente, `companies/{id}` restrito a
  owner/admin do próprio tenant.
- **`firestore.indexes.json`:** novo, cobre os 3 índices compostos exigidos
  pelas queries que combinam `companyId` com `orderBy`/range em produção.
- **Super-admin da plataforma:** `AppUser.isSuperAdmin?: boolean`;
  `TenantService` ganhou override de `companyId` (signals
  `companyOverride`/`overrideOwnerUid`, sem `effect()` — 100% derivado,
  evita race condition entre troca de sessão e leitura do `companyId`
  efetivo); services novos `CompanyService`, `SuperAdminService`; guard
  novo `superAdminGuard`; tela nova `/admin`
  (`src/components/super-admin/`); seletor de empresa na home
  (`src/components/home/`); primeira infra de Cloud Functions do projeto
  (`functions/` — `resetUserPassword`, `setSuperAdmin`,
  `requireSuperAdmin`).

## Lacunas conhecidas / pendências

- **TASK-023 (Cloud Function de custom claims)** — opcional/fase 2, não
  implementada. Bloqueada por decisão do usuário; retomar quando quiser
  migrar de "lookup em `users/{uid}`" pra "custom claims no token".
- **TASK-024 (validação manual com duas empresas)** — não executada por
  decisão do usuário. Recomendado antes de considerar o módulo pronto pra
  produção: criar 2 empresas via signup, popular dado em cada uma, confirmar
  que uma não vê a outra (UI + tentativa direta via SDK).
- **Gap de infraestrutura de teste** (descoberto na TASK-027): os 17 testes
  de isolamento com `companyId` válido (`src/services/*/*.spec.ts`) não
  rodam mais no Karma desde que `firestore.rules` passou a exigir
  autenticação real — `@firebase/rules-unit-testing` depende de `process`,
  que não existe em browser, e o Karma roda os specs de service dentro de
  um Chrome real. Não é regressão funcional (a lógica já foi provada
  correta antes das regras travarem, e `test/firestore.rules.spec.ts`
  continua rodando normalmente via Jest/Node). Solução conhecida e não
  implementada: Firebase Auth Emulator + `signInAnonymously()` no
  `test-helpers.ts`.
- Sem dado de produção real hoje — se isso mudar antes de publicar
  `firestore.rules`/`firestore.indexes.json` de verdade, reavaliar
  necessidade de backfill de `companyId` em dados existentes.
- Deploy de `firestore.rules`/`firestore.indexes.json` pro Firebase real
  **não foi feito** — só validado contra o emulador local. É decisão do
  usuário, fora do escopo de agent.
- **Bootstrap do primeiro super-admin não foi feito** — pendência
  operacional pós-merge (ver seção "Super-admin da plataforma" acima).
  Sem isso, a tela `/admin` e o seletor de empresa ficam inacessíveis pra
  todo mundo.
- Deploy das Cloud Functions (`functions/`) pro Firebase real também não
  foi feito — só validado contra Jest com mocks do Admin SDK, sem emulador
  de Functions.

## O que cada agent entregou

- **killua:** modelagem inicial (Company/AppUser, decomposição em 25+ tasks
  a partir da especificação do usuário).
- **levi:** toda a implementação — models, AuthService/TenantService,
  AuthGuard, ConfigService, os 8 services com isolamento, `firestore.rules`,
  `firestore.indexes.json`, guarda de `companyId` nulo, correção do filtro
  de pedidos.
- **hanzo:** telas de login e signup.
- **mike:** ciclo TDD completo — testes RED/GREEN dos 8 services (18 casos)
  e de `firestore.rules` (27 casos), ambos contra Firestore Emulator real.
- **style:** gate de revisão em todo código crítico. Achados de maior
  impacto: (1) regressão de tempo real no `ConfigService` (trocou listener
  `onSnapshot` por fetch único); (2) 3 buracos reais em `firestore.rules` —
  `update` permitia trocar `companyId` e "doar" documento pra outro tenant,
  deadlock no cadastro de empresa nova (transaction não enxerga seus
  próprios writes pendentes), e um sequestro completo de tenant que a
  correção do deadlock introduziu (create de `users/{uid}` sem validar
  conteúdo); (3) falta de índices compostos e ausência de guarda contra
  `companyId` nulo.

### Rodada "Super-admin da plataforma"

- **killua:** modelagem do flag `isSuperAdmin`, decisão de não usar custom
  claims, desenho do override de `companyId`, desenho final do bypass em
  `firestore.rules` (leitura + escrita, trava de `companyId` imutável fora
  do `OR`), contratos das duas Cloud Functions, e redação da seção 13 da
  `regra-de-negocio.md`.
- **levi:** `TenantService` (override sem `effect()`), `firestore.rules`,
  as 3 Cloud Functions, `CompanyService`, `SuperAdminService`,
  `superAdminGuard`, rota `/admin`.
- **hanzo:** seletor de empresa na home, tela `/admin` completa (lista de
  usuários, reset de senha, checkbox de super-admin), seguindo
  `identidade-visual.md`.
- **mike:** ciclo TDD da parte crítica — testes RED/GREEN de
  `TenantService` (13 casos), `firestore.rules` (16 casos novos de bypass
  cross-tenant) e das 3 Cloud Functions.
- **style:** revisão final — **aprovado sem rodada de correção**, após
  rodar as 3 suítes de teste e o build de verdade (não só leitura
  estática).
- **Kira:** achou e corrigiu diretamente (fora do ciclo formal, por serem
  mecânicos): dependência `firebase-functions` na seção errada do
  `package.json`, uso da API antiga (`admin.firestore()`) em vez da API
  modular do `firebase-admin` v14, `provideFunctions` faltando em
  `app.config.ts`, emojis inconsistentes com o resto do app. Também
  restaurou 4 arquivos (`firestore.rules`, `auth-service.ts`,
  `test/firestore.rules.spec.ts`, `firebase.json`) depois que um agent
  rodou um comando git destrutivo (`checkout`/`restore`) no meio de uma
  execução paralela, revertendo trabalho já validado — e reescreveu os
  testes das Cloud Functions, que ficaram tautológicos (`expect(true).toBe(true)`)
  em duas tentativas seguidas do `mike`.

## Notas operacionais

- Infraestrutura de teste local exigiu: Java (Temurin 21, via winget),
  correção de uma instalação corrompida do `firebase-tools`, e configuração
  do Firestore Emulator (`firebase.json` → `emulators.firestore`, porta
  8080). Ver histórico de commits desta sessão para detalhes caso o
  ambiente precise ser reconfigurado.
- Durante o trabalho, o processo do emulador caiu/ficou órfão múltiplas
  vezes (interrupções de sessão) — se testes começarem a falhar de forma
  inconsistente, verificar primeiro se o emulador está respondendo
  (`curl 127.0.0.1:8080`) antes de suspeitar do código.
