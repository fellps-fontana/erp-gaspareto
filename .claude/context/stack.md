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
  - `provideAuth` — Auth está registrado no `app.config.ts` mas ⚠️ nenhum guard/
    componente usa `getAuth()`/login hoje. Não há tela de login nem checagem de
    usuário autenticado no código atual.
- **Regras do Firestore (`firestore.rules`):** ⚠️ liberado geral —
  `allow read, write: if true;` para qualquer documento. Sem autenticação nem
  validação de schema no servidor. Todo o controle de acesso hoje é só via UI
  (módulos habilitados/desabilitados em `ConfigService`).
- **Hosting:** Firebase Hosting, `dist/erp-gaspareto/browser` como pasta pública,
  rewrite total para `index.html` (SPA).
- **Coleções Firestore identificadas no código:**
  `products`, `sales`, `orders`, `purchases`, `purchaseProducts`, `bills`,
  `customers`, `comandas`, `config` (doc único `company`).

## Ferramentas / qualidade

- **Testes:** Karma + Jasmine (setup padrão do Angular CLI). ⚠️ Não foi encontrado
  nenhum arquivo `*.spec.ts` além do `app.spec.ts` gerado pelo scaffold — cobertura
  de teste real parece inexistente hoje.
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
