# Clean Code — ERP Gaspareto

> Convenções observadas no código já existente no repositório. O objetivo é
> manter consistência com o que já está escrito, não impor um padrão externo.
> Onde há inconsistência real no código atual, está marcado com ⚠️ — seguir a
> convenção majoritária ao escrever código novo.

## Formatação

- Indentação: 2 espaços (`.editorconfig`).
- Aspas simples em `.ts` (`.editorconfig` + Prettier).
- `printWidth: 100` (Prettier).
- UTF-8, LF, newline final, sem trailing whitespace (exceto `.md`).
- HTML formatado com o parser `angular` do Prettier.

## Estrutura de pastas

```
src/
  app/            -> shell da aplicação (app.routes.ts, app.config.ts, app.ts)
  components/     -> um diretório por feature/tela, kebab-case
  services/       -> um diretório por service, kebab-case
  models/         -> um arquivo por entidade, kebab-case, sufixo -model.ts
  guards/         -> guards funcionais (CanActivateFn)
  enviroments/    -> config de ambiente (nome com typo, ver stack.md)
```

- Componente = pasta com `nome.ts` + `nome.html` + `nome.css` (+ variantes
  como `nome-mobile.css` quando há CSS específico para mobile). **Sem** sufixo
  `.component.` no nome do arquivo.
- Service = pasta própria (`src/services/<dominio>-service/`) contendo um
  único arquivo. ⚠️ Nome do arquivo é inconsistente: às vezes
  `<dominio>-service.ts` (ex.: `bill-service.ts`), às vezes
  `<dominio>.service.ts` (ex.: `notification.service.ts`,
  `config.service.ts`). Ao criar service novo, seguir o padrão
  `<dominio>-service.ts` (é o mais comum) salvo indicação em contrário.

## Componentes Angular

- Todos `standalone: true` — não criar NgModules.
- Imports explícitos por componente (`CommonModule`, `FormsModule`,
  `RouterLink` conforme necessidade) — não criar um "SharedModule".
- Injeção de dependência mista no código atual: componentes mais antigos usam
  `constructor(private xService: XService)`; código mais novo usa
  `private xService = inject(XService)` / `readonly xService = inject(XService)`.
  ⚠️ Preferir `inject()` em código novo (é o padrão mais recente no repo,
  usado em `ConfigComponent`, `guards`, `ThemeService`).
- Estado local: `signal()` para valores que a UI precisa reagir de forma
  simples e isolada (ex.: `saving`, `isDarkTheme`, `modules`); propriedades de
  classe simples (`activeTab: 'a' | 'b' = 'a'`) para o resto — não há uso de
  `computed()`/`effect()` no código revisado.
- Tipos de união literal (`'open' | 'pending' | ...`) direto na interface do
  model para representar estado/enum, em vez de `enum` do TypeScript — exceção
  é `PaymentMethod`, que usa `enum`. Preferir union literal para novos campos
  de status.

## Nomenclatura

- **Domínio/negócio em português, técnico em inglês.** Nomes de
  métodos/variáveis ligados a UI e fluxo de negócio ficam em português
  (`salvarProduto`, `abrirEdicao`, `confirmarCompra`, `gastosPeriodo`); nomes
  de infraestrutura, models, services e campos de dados ficam em inglês
  (`ProductService`, `Bill.status`, `getSalesByDate`). Não misturar os dois
  dentro do mesmo tipo de artefato — um método de service novo é inglês, um
  método de componente que trata interação do usuário é português.
- Prefixo de estado local por entidade: `novo<Entidade>` para o objeto do
  formulário de criação (`novoProduto`, `novoCliente`), `<entidade>EmEdicao`
  para o item sendo editado, `exibirFormulario<Entidade>` para toggle de
  visibilidade, `is<Entidade>DeleteModalOpen` + `<entidade>ToDelete` para o
  fluxo de confirmação de exclusão. Seguir esse padrão ao adicionar um novo
  CRUD dentro de um componente existente.
- Campos calculados/derivados usam getter (`get campoDerivado()`), não método
  (`getCampoDerivado()`).

## Services / dados

- Toda leitura em tempo real do Firestore passa por
  `collectionDataObservable<T>` (definido em `FirestoreBaseService`, herdado
  pelos services) — encapsula `onSnapshot` + `NgZone.run` para disparar change
  detection corretamente. ⚠️ `PurchaseService` duplica essa lógica local em
  vez de estender `FirestoreBaseService` — ao tocar nesse service, considerar
  alinhar com o padrão (mas não é bloqueante corrigir isso fora de escopo).
- Qualquer operação que leia e depois escreva estoque (venda, comanda, compra,
  pedido) usa `runTransaction` — nunca `getDoc` + `updateDoc` separados fora
  de transação quando envolve estoque.
- Métodos assíncronos retornam `Promise<void>` ou `Promise<string>` (id
  criado); erros são deixados subir (`throw`) para quem chamou tratar — não
  engolir erro silenciosamente dentro do service.
- Campos numéricos vindos de formulário são normalizados com `Number(...)`
  antes de persistir (proteção contra string vinda de input) — manter esse
  hábito em código novo que grava valores monetários/quantidades.

## Feedback ao usuário

- Toda ação de escrita no componente (salvar, excluir, atualizar) é envolvida
  em `try/catch`, chamando `this.notif.success(...)`,
  `this.notif.warning(...)` ou `this.notif.error(...)` (via
  `NotificationService`, toast global). Mensagens de sucesso/erro voltadas ao
  usuário final são em português, curtas, e frequentemente terminam com um
  emoji (`✅`, `❌`, `⚠️`, `🗑️`) — manter o tom ao escrever mensagens novas.
- Validação de formulário é feita no início do método de salvar (early
  return com `notif.warning`), não em validators reativos.

## O que evitar (com base no que já existe)

- Não criar novo NgModule — o projeto é 100% standalone.
- Não usar Reactive Forms — o padrão do projeto é template-driven
  (`ngModel`).
- Não decrementar/incrementar estoque fora de `runTransaction`.
- Não misturar idioma dentro do mesmo tipo de artefato (ver seção
  Nomenclatura).
