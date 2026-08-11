# Stack — ERP Gaspareto

> Gerado a partir da análise do repositório (package.json, angular.json, app.config.ts,
> firebase.json). Nenhuma pergunta foi feita ao usuário — tudo aqui é o que já existe
> rodando no projeto. Pontos que exigem confirmação estão marcados com ⚠️.

## Visão geral

SPA Angular standalone, hospedada no Firebase Hosting, com Firestore como banco
principal (tempo real via `onSnapshot`). Sem backend próprio — toda a lógica de
negócio roda no cliente (services Angular) e escreve direto no Firestore, inclusive
transações (`runTransaction`) para operações que envolvem estoque.

## Frontend

- **Framework:** Angular 20.3 (standalone components, sem NgModules).
- **Linguagem:** TypeScript 5.9.
- **Roteamento:** `@angular/router`, rotas declaradas em `src/app/app.routes.ts`,
  proteção via `moduleGuard` (guard funcional `CanActivateFn`).
- **Reatividade:** RxJS (`Observable`) para streams do Firestore + Angular Signals
  (`signal`) para estado local simples (ex.: `ConfigService.modules`, `ThemeService.isDarkTheme`).
- **Formulários:** `FormsModule` (template-driven / ngModel), não usa Reactive Forms.
- **UI:** Bootstrap 5.3 (classes utilitárias) + design system CSS próprio em
  `src/styles.css` (tokens via CSS variables) — ver `identidade-visual.md`.
- **Gráficos:** Chart.js 4.5 (`Chart.register(...registerables)`), usado em
  `product-inventory` para relatórios de vendas/produtos.
- **PWA:** `@angular/service-worker`, configurado via `ngsw-config.json`,
  registrado só fora de dev mode (`registerWhenStable:30000`).
- **Build:** `@angular/build` (novo builder ESBuild-based do Angular CLI 20).

## Backend / dados

- **Firebase:** `@angular/fire` 20 + `firebase` 11.10.
  - `provideFirebaseApp` com config hardcoded em `app.config.ts` (projeto
    `projetosfelipe-9e458`). ⚠️ Chaves de API do Firebase client estão comitadas
    no código-fonte — normal para Firebase client SDK (não é secreto de servidor),
    mas vale confirmar se é intencional manter assim no repo.
  - `provideFirestore` — banco principal, todas as coleções abaixo.
  - `provideAuth` — Auth em uso: `AuthService` (`src/services/auth/`) faz
    login/logout por email+senha e expõe usuário atual; `TenantService`
    (`src/services/tenant/`) expõe o `companyId` da sessão como signal, usado
    por todos os services de dados pra filtrar/gravar `companyId`.
    `AuthGuard` (`src/guards/auth.guard.ts`) bloqueia rotas sem sessão —
    proteção de UX, não de segurança (quem garante isolamento real é
    `firestore.rules`). Telas: `src/components/login/`,
    `src/components/signup/` (cadastro self-service de empresa nova).
    Custom claims (`companyId`/`role` no token JWT) via Cloud Function é
    fase 2/opcional — fase 1 opera com leitura direta de `users/{uid}` na
    regra.
- **Regras do Firestore (`firestore.rules`):** isolamento multi-tenant —
  toda leitura/escrita nas coleções operacionais (`products`, `sales`,
  `orders`, `comandas`, `bills`, `customers`, `purchases`,
  `purchaseProducts`) exige `resource.data.companyId` (leitura) ou
  `request.resource.data.companyId` (escrita) igual ao `companyId` do
  usuário autenticado (token ou lookup em `users/{uid}`). `companies/{id}`
  só é legível/gravável pelo próprio tenant (escrita restrita a
  `owner`/`admin`); `users/{uid}` só é legível pelo próprio usuário e nunca
  gravável direto pelo cliente (só via Cloud Function/Admin SDK). Ver
  `regra-de-negocio.md` seção 10 para o racional de campo vs. subcoleção.
- **Hosting:** Firebase Hosting, `dist/erp-gaspareto/browser` como pasta pública,
  rewrite total para `index.html` (SPA).
- **Coleções Firestore identificadas no código:**
  `products`, `sales`, `orders`, `purchases`, `purchaseProducts`, `bills`,
  `customers`, `comandas`, `companies` (substitui o antigo doc único
  `config/company`), `users`.

## Ferramentas / qualidade

- **Testes:** dois runners, propósitos diferentes.
  - **Karma + Jasmine** (`npm test` / `ng test`, setup padrão do Angular CLI):
    testes de componentes/services Angular, incluindo os 8 services de dados
    (`src/services/*/*.spec.ts`), que rodam contra um Firestore Emulator real
    (ver abaixo), não contra Firestore de produção nem mock.
  - **Jest + ts-jest** (`npm run test:rules`, devDependency adicionada junto
    com `@firebase/rules-unit-testing`): só para `test/firestore.rules.spec.ts`
    — testa as regras de segurança do Firestore isoladamente, também contra o
    emulador. Runner separado porque `@firebase/rules-unit-testing` roda em
    Node (não em browser/Karma) e é o padrão oficial da Firebase para esse
    tipo de teste.
  - **Firestore Emulator:** `firebase.json` tem `emulators.firestore` (porta
    8080, `firebase emulators:start --only firestore`) — pré-requisito: Java
    (JRE/JDK 11+) instalado. Sem o emulador rodando, nenhum dos dois runners
    consegue testar código que toca Firestore de verdade.
- **Lint/format:** Prettier configurado no `package.json` (printWidth 100,
  singleQuote, parser `angular` para `.html`). Não há ESLint configurado.
- **Estilo de código:** `.editorconfig` — indent 2 espaços, aspas simples em `.ts`,
  UTF-8, LF final.

## Convenções de nomenclatura de arquivo

- Componentes: pasta `kebab-case` com `nome.ts` / `nome.html` / `nome.css`
  (sem sufixo `.component.` no nome do arquivo, ex.: `product-inventory.ts`,
  não `product-inventory.component.ts`).
- Services: pasta própria por serviço em `src/services/<nome>-service/`,
  arquivo `nome-service.ts` ou `nome.service.ts` (⚠️ inconsistente — ver
  `clean-code.md`).
- Models: `src/models/<nome>-model.ts`, interfaces simples (sem classes).

## Ambiente

- `src/enviroments/enviroments.ts` ⚠️ nome com typo (`enviroments` em vez de
  `environments`) — mantido assim por já estar em uso nos imports
  (`app.config.ts` importa de `'../enviroments/enviroments'`). Não corrigir
  sem avaliar impacto em todos os imports.
- **Dois ambientes reais, dois projetos Firebase separados:**
  - **Produção**: branch `main`, projeto `projetosfelipe-9e458`, config em
    `enviroments.ts` (`useEmulator: true` só em dev local — build de prod usa
    Firebase real). Onde o cliente Gasparetto roda hoje.
  - **Homologação/staging**: branch `homologacao`, projeto Firebase próprio
    `hologaerp` (alias `hml` no `.firebaserc`), config em
    `enviroments.staging.ts` (`useEmulator: false`, Firestore/Auth reais do
    `hologaerp`, isolado de produção). Usado pra validar multi-tenant e
    features novas antes de ir pra produção — TASK-024 (isolamento entre
    empresas) validada manualmente aqui.
  - `angular.json` tem configuration `staging` (`fileReplacements` troca
    `enviroments.ts` por `enviroments.staging.ts`). Scripts: `npm run
    start:staging`, `npm run build:staging`, `npm run deploy:rules:staging`
    (`firestore.rules` + `firestore.indexes.json` pro projeto `hml`), `npm
    run deploy:hosting:staging` (build + deploy Hosting pro `hml`).
- **CI/CD:** GitHub Actions. `.github/workflows/firebase-hosting-merge.yml`
  builda/deploya produção em push pra `main`; `.github/workflows/
  firebase-hosting-homolog.yml` builda com `--configuration staging` e
  deploya em push pra `homologacao`, usando o secret
  `FIREBASE_SERVICE_ACCOUNT_HOLOGAERP`.
