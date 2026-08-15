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
