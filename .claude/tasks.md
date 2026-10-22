## TASK-001 — Criar models Company e AppUser
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: vazio
FLUXO: Implementacao
CONTEXTO A LER: regra-de-negocio.md seção 10 (modelos Company e AppUser); stack.md seção Backend/dados; src/models/company-config.ts (padrão de interface sem classe)
ESCOPO: criar as interfaces Company (companies/{id}) e AppUser (users/{uid}) exatamente com os campos da regra-de-negocio.md seção 10, seguindo o padrão de interface simples sem classe já usado nos outros models.
CRITERIO DE ACEITE: Company tem id, name, document?, plan ('trial'|'basic'|'pro'), status ('active'|'suspended'|'canceled'), modules (ModuleConfig importado de company-config.ts), createdAt; AppUser tem uid, email, companyId, role ('owner'|'admin'|'employee'), createdAt; compila sem erro.
ARQUIVOS PERMITIDOS: src/models/company-model.ts (novo), src/models/user-model.ts (novo)
NAO FAZER: não tocar em company-config.ts nem em nenhum model existente.
RETORNO ESPERADO: os dois arquivos criados, conteúdo final.

## TASK-002 — Criar AuthService + TenantService
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-001
FLUXO: Implementacao
CONTEXTO A LER: regra-de-negocio.md seção 10 (fluxo de auth, custom claims, cadastro de empresa); stack.md seção Backend/dados; src/services/config/config.service.ts (padrão de signal + Observable já usado no projeto)
ESCOPO: criar AuthService (login, logout, currentUser$/currentUser signal, busca users/{uid} pós-login pra expor companyId/role, e signup(email,senha,nomeEmpresa) que cria o usuário no Firebase Auth + companies/{id} com DEFAULT_MODULES/plan trial/status active + users/{uid} com role owner) e TenantService (signal global companyId(), null se deslogado).
CRITERIO DE ACEITE: nenhum service de dado consegue montar query com companyId null (TenantService só emite companyId depois do lookup em users/{uid} completar); login/logout mudam currentUser corretamente; signup cria os 2 documentos (companies + users) antes de resolver a promise.
ARQUIVOS PERMITIDOS: src/services/auth-service/auth-service.ts, src/services/tenant-service/tenant-service.ts
NAO FAZER: não implementar a Cloud Function de custom claims aqui (ver TASK-023); não criar UI.
RETORNO ESPERADO: os dois services criados, com assinatura pública clara (métodos e o que cada um retorna).
NOTA POS-EXECUCAO: caminho real diverge do original (pasta `<dominio>-service/`,
convenção majoritária do projeto — `auth-service/` e `tenant-service/`, não
`auth/`/`tenant/`); tasks seguintes já corrigidas abaixo. 1 rodada de correção
pelo style (conta órfã no Auth se a transaction do signup falhar, race entre
o listener onAuthStateChanged e a atribuição explícita de currentUser, e
ausência de sinal "auth inicializando") — todas resolvidas e aprovadas.
AuthService agora expõe também `authInitialized` (signal) e TenantService
`isAuthInitialized()` — TASK-003 deve checar isso antes de decidir com base
em `currentUser()`/`companyId()`, senão reintroduz o bug de F5 redirecionando
indevidamente pra /login.

## TASK-003 — Criar AuthGuard
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-002
FLUXO: Implementacao
CONTEXTO A LER: regra-de-negocio.md seção 10 (nota sobre guard ser UX, não segurança); src/guards/module.guard.ts (padrão de CanActivateFn já usado no projeto); src/services/auth-service/auth-service.ts (authInitialized) e src/services/tenant-service/tenant-service.ts (isAuthInitialized) — caminho real, corrigido pós TASK-002
ESCOPO: criar authGuard (CanActivateFn) que bloqueia acesso a rotas protegidas quando não há usuário logado, redirecionando pra /login.
CRITERIO DE ACEITE: sem sessão ativa (e auth já inicializado), qualquer rota com o guard redireciona pra /login; com sessão ativa, deixa passar; enquanto authInitialized() ainda for false (boot/F5 com sessão persistida), o guard aguarda a resolução antes de decidir — nunca redireciona com base em currentUser() ainda não resolvido.
ARQUIVOS PERMITIDOS: src/guards/auth.guard.ts (novo)
NAO FAZER: não aplicar o guard nas rotas ainda (isso é TASK-006).
RETORNO ESPERADO: arquivo criado, assinatura da função.
NOTA POS-EXECUCAO: 1 rodada de correção pelo style — a implementação original
chamava toObservable() duas vezes (uma dentro de switchMap), o que lança
NG0203 em runtime sempre que authInitialized resolve de forma assíncrona
(exatamente o caso de F5 com sessão persistida que a task existe pra cobrir).
Corrigido combinando authInitialized+currentUser num único computed() e
chamando toObservable() uma única vez, na janela síncrona garantida do
guard. Aprovado com evidência de leitura do código-fonte instalado do
Angular (sem node_modules no worktree pra rodar ng serve real — sinalizado
como limitação, não como validação em runtime).

## TASK-004 — Tela de Login
STATUS: CONCLUIDA
AGENT: hanzo
DEPENDENCIAS: TASK-002
FLUXO: Implementacao
CONTEXTO A LER: identidade-visual.md; regra-de-negocio.md seção 10 (fluxo de login); src/services/auth-service/auth-service.ts (métodos disponíveis) — caminho real, corrigido pós TASK-002
ESCOPO: criar tela de login (form email/senha) que chama AuthService.login e redireciona pra / em caso de sucesso, mostrando erro em caso de falha.
CRITERIO DE ACEITE: login com credencial válida redireciona pra /; login inválido mostra mensagem de erro sem quebrar a tela; segue identidade visual do projeto (Bootstrap + design tokens de styles.css).
ARQUIVOS PERMITIDOS: src/components/login/login.ts (novo), src/components/login/login.html (novo), src/components/login/login.css (novo)
NAO FAZER: não criar lógica de cadastro de empresa aqui (ver TASK-005).
RETORNO ESPERADO: componente criado, standalone, pronto pra ser referenciado na rota.

## TASK-005 — Tela de Signup (cadastro de empresa)
STATUS: CONCLUIDA
AGENT: hanzo
DEPENDENCIAS: TASK-001, TASK-002
FLUXO: Implementacao
CONTEXTO A LER: identidade-visual.md; regra-de-negocio.md seção 10 (cadastro self-service); src/services/auth-service/auth-service.ts (método signup) — caminho real, corrigido pós TASK-002
ESCOPO: criar tela de signup (nome da empresa, email, senha) que chama AuthService.signup e redireciona pra / autenticado ao concluir.
CRITERIO DE ACEITE: cadastro cria a sessão autenticada e redireciona pra /; campos obrigatórios validados antes de chamar o service; erro de email já em uso é exibido ao usuário.
ARQUIVOS PERMITIDOS: src/components/signup/signup.ts (novo), src/components/signup/signup.html (novo), src/components/signup/signup.css (novo)
NAO FAZER: não implementar a chamada à Cloud Function de custom claims (fase 2, TASK-023) — se ela não existir ainda, o fluxo funciona no modo fase 1 (lookup em regra).
RETORNO ESPERADO: componente criado, standalone, pronto pra ser referenciado na rota.

## TASK-006 — Atualizar app.routes.ts
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-003, TASK-004, TASK-005
FLUXO: Implementacao
CONTEXTO A LER: stack.md seção Roteamento; src/app/app.routes.ts (arquivo atual)
ESCOPO: adicionar rotas /login e /signup (sem guard) e aplicar authGuard antes do moduleGuard existente em todas as rotas hoje protegidas (pdv, estoque, orders, rotas, contas) — config e home ficam a critério do escopo atual (não mudar comportamento delas nesta task).
CRITERIO DE ACEITE: /login e /signup acessíveis sem sessão; pdv/estoque/orders/rotas/contas redirecionam pra /login sem sessão e, com sessão, seguem pro moduleGuard normalmente (nenhuma regressão no comportamento de módulo desligado).
ARQUIVOS PERMITIDOS: src/app/app.routes.ts
NAO FAZER: não mexer em module.guard.ts nem em company-config.ts.
RETORNO ESPERADO: diff do arquivo de rotas.

## TASK-007 — Atualizar ConfigService para companies/{id}
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-001, TASK-002
FLUXO: Melhoria
CONTEXTO A LER: regra-de-negocio.md seção 11 (Configuração por empresa revisada); src/services/config/config.service.ts (arquivo atual, inteiro)
ESCOPO: trocar a leitura/escrita fixa em config/company pela leitura/escrita em companies/{tenant.companyId()}, mantendo a mesma API pública (signal modules, modules$, updateModules) pro resto do app não quebrar.
CRITERIO DE ACEITE: modules() reflete o doc da empresa da sessão atual; troca de empresa (logout/login em outra conta) atualiza modules() sem reload da página; merge com DEFAULT_MODULES continua funcionando pra módulos novos.
ARQUIVOS PERMITIDOS: src/services/config/config.service.ts
NAO FAZER: não alterar company-config.ts (DEFAULT_MODULES/ModuleConfig continuam iguais).
RETORNO ESPERADO: diff do service.
NOTA POS-EXECUCAO: 1 rodada de correção pelo style — a primeira versão trocou
o listener onSnapshot (tempo real) por getDoc() one-shot, regredindo o
comportamento documentado em stack.md ("tempo real via onSnapshot") e com
efeito colateral real em module.guard.ts (módulo desligado em outra sessão
só refletia após relogin). Corrigido com novo método
`docDataObservable<T>()` em firestore-base.service.ts (irmão de
`collectionDataObservable`, mesmo padrão onSnapshot+ngZone.run, mas pra doc
único) — útil pra qualquer service futuro que precise ler 1 doc em tempo
real (ex.: futura leitura direta do doc da empresa em outros pontos).

## TASK-008 — Adicionar companyId nos 8 models existentes
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: vazio
FLUXO: Melhoria
CONTEXTO A LER: regra-de-negocio.md seção 10 (campo companyId, motivo); schema.dbml atualizado (tabelas com company_id)
ESCOPO: adicionar o campo obrigatório `companyId: string` na interface principal de cada um dos 8 models — atenção aos nomes de arquivo reais, que não batem 1:1 com o nome da entidade: Product→product-model.ts, Sale→sell-model.ts, Comanda→comanda-model.ts, Order→order-model.ts, Bill→bill-model.ts, Customer→customer-model.ts, Purchase→buy-model.ts, PurchaseProduct→purchase-product-model.ts.
CRITERIO DE ACEITE: campo adicionado só na interface do documento raiz de cada um (nunca nos itens embutidos como SaleItem/OrderItem/ComandaItem); projeto compila.
ARQUIVOS PERMITIDOS: src/models/product-model.ts, src/models/sell-model.ts, src/models/comanda-model.ts, src/models/order-model.ts, src/models/bill-model.ts, src/models/customer-model.ts, src/models/buy-model.ts, src/models/purchase-product-model.ts
NAO FAZER: não renomear nenhum arquivo (a inconsistência de nome é conhecida e documentada em stack.md — não corrigir aqui).
RETORNO ESPERADO: diff dos 8 arquivos.
NOTA POS-EXECUCAO: build do projeto ficou propositalmente quebrado (15 erros
de tipo) até um passo de infraestrutura anterior à TASK-009 mudar a
assinatura dos 8 métodos de escrita dos services para Omit<T,'companyId'>
(companyId passa a ser injetado pelo service, não fornecido pelo chamador) —
ver nota da TASK-009 abaixo. Build volta a compilar limpo desde então.

## TASK-009 — [TDD RED] Testes de isolamento companyId nos 8 services
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-002, TASK-008
FLUXO: Implementacao
CONTEXTO A LER: regra-de-negocio.md seção 10 (classificação CRÍTICA e o porquê); os 8 services atuais em src/services/*/*.ts (comportamento hoje, sem filtro)
ESCOPO: escrever testes (Jasmine/Karma, ou suíte parametrizada) provando que cada getX() dos 8 services monta a query com where('companyId','==', tenant.companyId()) e que cada addX() grava companyId no payload — um teste por service ou suíte única cobrindo os 8, a critério de mike.
CRITERIO DE ACEITE: existe cobertura de teste pros 8 services (get + add); os testes rodam e falham (RED) por lógica ausente no código atual (sem filtro/stamp de companyId), nunca por erro de compilação.
ARQUIVOS PERMITIDOS: arquivos *.spec.ts novos, um por service, na mesma pasta do service correspondente (ex.: src/services/product-service/product-service.spec.ts)
NAO FAZER: não alterar nenhum arquivo de service (isso é TASK-010 a TASK-017). Se a infraestrutura de teste (mock de Firestore/emulator) não existir no projeto, resolver com o mínimo necessário e sinalizar o gap no retorno — não instalar dependência nova sem reportar.
RETORNO ESPERADO: lista dos arquivos de teste criados + confirmação de RED (motivo da falha) por service.
NOTA POS-EXECUCAO: rodada mais custosa da fila até agora, 3 gaps de infra
reais encontrados e resolvidos pelo Kira antes do RED rodar de verdade:
(1) build quebrado desde TASK-008 — Kira mudou a assinatura de escrita dos
8 services pra Omit<T,'companyId'> (companyId passa a ser responsabilidade
do service, não do chamador) e ajustou 7 anotações de tipo locais em 3
componentes (bills.ts, customers.ts, product-inventory.ts) que espelhavam a
forma antiga — zero lógica alterada, só contrato de tipo; (2) mock de
Firestore inviável — o SDK valida internamente que o objeto é uma instância
real (branding), e spyOn nas funções do módulo firebase/firestore falha
porque o bundler esbuild exporta ESM como somente-leitura; usuário escolheu
emulador real como estratégia (outras opções descartadas: refatorar pra
injeção testável — escopo grande demais; descartar prova automatizada —
quebra o mandato de TDD do CLAUDE.md). Kira instalou Java (Temurin 21, via
winget, com autorização do usuário), corrigiu o firebase-tools (node_modules
corrompido, resolvido com `npm ci` na raiz do repo), configurou
`emulators.firestore` (porta 8080) em firebase.json, e deixou o emulador
rodando em background pro mike conectar via `connectFirestoreEmulator`
(helper novo: src/services/test-helpers.ts); (3) primeira versão dos testes
de leitura era vazia/frágil — só verificava "nenhum doc retornado tem
companyId errado", o que dava RED por coincidência de sobra de dados no
emulador compartilhado, não por prova deliberada. Corrigido: cada teste de
leitura agora semeia explicitamente um doc próprio E um doc de empresa
estrangeira (via setDoc direto), e afirma as duas coisas — que o próprio
aparece e que o estrangeiro NÃO aparece. RED final confirmado (18 FAILED, 0
SUCCESS) de forma independente pelo Kira rodando `ng test` de novo, contra o
emulador real, sem nenhum erro de compilação/setup. Emulador do Firestore
segue rodando em background nesta sessão — as próximas tasks (010-018) usam
o mesmo emulador, não precisam reiniciar.

## TASK-010 — Isolamento companyId: product-service
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-009
FLUXO: Implementacao
CONTEXTO A LER: regra-de-negocio.md seção 10 (CRÍTICA — depende do ciclo TDD da Seção 5 do CLAUDE.md); os testes de src/services/product-service/product-service.spec.ts (leitura, não escrita); spec seção 7 do multi-tenant (padrão de mudança nos services)
ESCOPO: injetar TenantService no ProductService; getProducts() passa a filtrar where('companyId','==', tenant.companyId()); addProduct() grava companyId no payload.
CRITERIO DE ACEITE: os testes de TASK-009 referentes a product-service ficam GREEN; updateProduct/deleteProduct/decreaseStock/increaseStock não mudam (regra do Firestore já barra cross-tenant nesses).
ARQUIVOS PERMITIDOS: src/services/product-service/product-service.ts
NAO FAZER: não alterar o arquivo .spec.ts (é leitura, não escopo de escrita). Pode rodar em paralelo com TASK-011 a TASK-017 (arquivos disjuntos).
RETORNO ESPERADO: diff do service.

## TASK-011 — Isolamento companyId: sale-service
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-009
FLUXO: Implementacao
CONTEXTO A LER: regra-de-negocio.md seção 10 (CRÍTICA); os testes de src/services/sale-service/sale-service.spec.ts; regra-de-negocio.md seção 3 (Vendas — não alterar lógica de negócio, só isolamento)
ESCOPO: injetar TenantService no SaleService; getSales() (ou equivalente) filtra por companyId; processSale()/addSale() gravam companyId no payload.
CRITERIO DE ACEITE: testes de TASK-009 referentes a sale-service ficam GREEN; processSale mantém o comportamento transacional de baixa de estoque intacto (seção 2/3 da regra-de-negocio.md não muda).
ARQUIVOS PERMITIDOS: src/services/sale-service/sale-service.ts
NAO FAZER: não alterar o arquivo .spec.ts. Não tocar na lógica de runTransaction além de incluir companyId no payload. Pode rodar em paralelo com TASK-010, TASK-012 a TASK-017.
RETORNO ESPERADO: diff do service.

## TASK-012 — Isolamento companyId: comanda-service
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-009
FLUXO: Implementacao
CONTEXTO A LER: regra-de-negocio.md seção 10 (CRÍTICA); os testes de src/services/comanda-service/comanda-service.spec.ts; regra-de-negocio.md seção 4 (Comandas)
ESCOPO: injetar TenantService no ComandaService; queries de listagem filtram por companyId; addComanda/addToExistingComanda gravam companyId no payload.
CRITERIO DE ACEITE: testes de TASK-009 referentes a comanda-service ficam GREEN; addToExistingComanda continua somando quantidade em vez de duplicar linha (regra existente intacta).
ARQUIVOS PERMITIDOS: src/services/comanda-service/comanda-service.ts
NAO FAZER: não alterar o arquivo .spec.ts. Pode rodar em paralelo com TASK-010, TASK-011, TASK-013 a TASK-017.
RETORNO ESPERADO: diff do service.

## TASK-013 — Isolamento companyId: order-service
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-009
FLUXO: Implementacao
CONTEXTO A LER: regra-de-negocio.md seção 10 (CRÍTICA); os testes de src/services/order-service/order-service.spec.ts; regra-de-negocio.md seção 5 (Pedidos)
ESCOPO: injetar TenantService no OrderService; getOrders/getPendingOrders/getOrdersByCustomer filtram por companyId; addOrder grava companyId no payload.
CRITERIO DE ACEITE: testes de TASK-009 referentes a order-service ficam GREEN; ciclo de status (markAsDelivered, cancelOrder, finalizeOrder) e cálculo de total continuam intactos.
ARQUIVOS PERMITIDOS: src/services/order-service/order-service.ts
NAO FAZER: não alterar o arquivo .spec.ts. Pode rodar em paralelo com TASK-010 a TASK-012, TASK-014 a TASK-017.
RETORNO ESPERADO: diff do service.

## TASK-014 — Isolamento companyId: bill-service
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-009
FLUXO: Implementacao
CONTEXTO A LER: regra-de-negocio.md seção 10 (CRÍTICA); os testes de src/services/bill-service/bill-service.spec.ts; regra-de-negocio.md seção 7 (Contas)
ESCOPO: injetar TenantService no BillService; queries de listagem filtram por companyId; criação de bill grava companyId no payload.
CRITERIO DE ACEITE: testes de TASK-009 referentes a bill-service ficam GREEN; avanço sequencial de status (pendente→recebido→pago) continua intacto.
ARQUIVOS PERMITIDOS: src/services/bill-service/bill-service.ts
NAO FAZER: não alterar o arquivo .spec.ts. Pode rodar em paralelo com TASK-010 a TASK-013, TASK-015 a TASK-017.
RETORNO ESPERADO: diff do service.

## TASK-015 — Isolamento companyId: customer-service
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-009
FLUXO: Implementacao
CONTEXTO A LER: regra-de-negocio.md seção 10 (CRÍTICA); os testes de src/services/customer-service/customer-service.spec.ts; regra-de-negocio.md seção 9 (Clientes)
ESCOPO: injetar TenantService no CustomerService; getCustomers() filtra por companyId; addCustomer grava companyId no payload.
CRITERIO DE ACEITE: testes de TASK-009 referentes a customer-service ficam GREEN; integração ViaCEP não é afetada.
ARQUIVOS PERMITIDOS: src/services/customer-service/customer-service.ts
NAO FAZER: não alterar o arquivo .spec.ts. Pode rodar em paralelo com TASK-010 a TASK-014, TASK-016, TASK-017.
RETORNO ESPERADO: diff do service.

## TASK-016 — Isolamento companyId: purchase-service
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-009
FLUXO: Implementacao
CONTEXTO A LER: regra-de-negocio.md seção 10 (CRÍTICA); os testes de src/services/purchase-service/purchase-service.spec.ts; regra-de-negocio.md seção 2 (compra de produto/entrada de estoque)
ESCOPO: injetar TenantService no PurchaseService; queries de listagem filtram por companyId; addPurchase grava companyId no payload.
CRITERIO DE ACEITE: testes de TASK-009 referentes a purchase-service ficam GREEN; sobrescrita de buyPrice e bloqueio de estorno com estoque insuficiente continuam intactos.
ARQUIVOS PERMITIDOS: src/services/purchase-service/purchase-service.ts
NAO FAZER: não alterar o arquivo .spec.ts. Pode rodar em paralelo com TASK-010 a TASK-015, TASK-017.
RETORNO ESPERADO: diff do service.

## TASK-017 — Isolamento companyId: purchase-product-service
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-009
FLUXO: Implementacao
CONTEXTO A LER: regra-de-negocio.md seção 10 (CRÍTICA); os testes de src/services/purchase-product-service/purchase-product-service.spec.ts; regra-de-negocio.md seção 8 (Produtos de compra)
ESCOPO: injetar TenantService no PurchaseProductService; queries de listagem filtram por companyId; criação de purchaseProduct grava companyId no payload.
CRITERIO DE ACEITE: testes de TASK-009 referentes a purchase-product-service ficam GREEN; geração automática de bill vinculada continua intacta.
ARQUIVOS PERMITIDOS: src/services/purchase-product-service/purchase-product-service.ts
NAO FAZER: não alterar o arquivo .spec.ts. Pode rodar em paralelo com TASK-010 a TASK-016.
RETORNO ESPERADO: diff do service.

## TASK-018 — [TDD GREEN] Confirmar isolamento dos 8 services
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-010, TASK-011, TASK-012, TASK-013, TASK-014, TASK-015, TASK-016, TASK-017
FLUXO: Implementacao
CONTEXTO A LER: os 8 arquivos .spec.ts criados na TASK-009
ESCOPO: rodar novamente (não reescrever) os testes da TASK-009 contra os 8 services implementados, confirmar GREEN.
CRITERIO DE ACEITE: os 8 conjuntos de teste passam; qualquer falha remanescente é reportada como bug pontual (service e motivo), não reescrita de teste.
ARQUIVOS PERMITIDOS: nenhum (só execução)
NAO FAZER: não alterar nenhum arquivo de teste nem de service.
RETORNO ESPERADO: relatório GREEN/FAIL por service; se houver FAIL, relatório de bug pro Kira redespachar ao levi correspondente.
NOTA POS-EXECUCAO: 18/18 testes de multi-tenant GREEN, confirmado de forma
independente pelo Kira rodando `ng test` de novo. 1 correção no meio do
caminho: purchase-service.spec.ts não semeava o produto referenciado antes
de chamar addPurchase() — bug no teste (mike corrigiu), não no service
(addPurchase sempre validou existência do produto, comportamento
pré-existente da seção 2). Achado à parte, fora de escopo: app.spec.ts
(scaffold do projeto) falha por falta de provider `_SwUpdate` — pré-
existente, não relacionado a multi-tenant, só apareceu porque esta é a
primeira vez que a suite de teste roda de verdade no projeto (stack.md já
registrava ausência de cobertura real). Não corrigido, registrado como
lacuna conhecida.

## TASK-019 — Atualizar mocks para aceitar companyId
STATUS: CONCLUIDA (não aplicável)
AGENT: levi
DEPENDENCIAS: TASK-008, TASK-010, TASK-011, TASK-012, TASK-013, TASK-014, TASK-015, TASK-016, TASK-017
FLUXO: Melhoria
CONTEXTO A LER: stack.md (modo useMock); os 8 arquivos de mock em src/mocks/*.ts e src/mocks/core/*.ts (padrão atual de InMemoryCollection)
ESCOPO: ajustar os 8 mocks (product/sale/comanda/order/bill/customer/purchase/purchase-product) e o config-service-mock pra aceitar/ignorar o parâmetro companyId sem quebrar a assinatura usada pelos services reais, garantindo que o modo useMock continue funcionando fim a fim.
CRITERIO DE ACEITE: app roda normalmente com environment.useMock=true após a mudança dos 8 services reais; nenhum mock lança erro por parâmetro companyId inesperado.
ARQUIVOS PERMITIDOS: src/mocks/product-service-mock.ts, src/mocks/sale-service-mock.ts, src/mocks/comanda-service-mock.ts, src/mocks/order-service-mock.ts, src/mocks/bill-service-mock.ts, src/mocks/customer-service-mock.ts, src/mocks/purchase-service-mock.ts, src/mocks/purchase-product-service-mock.ts, src/mocks/config-service-mock.ts, src/mocks/core/in-memory-collection.ts, src/mocks/core/mock-database.ts
NAO FAZER: não alterar os arquivos de seed em src/mocks/data/ nesta task, a menos que sejam estritamente necessários pra não quebrar o build (se precisar, reportar).
RETORNO ESPERADO: diff dos mocks alterados.
NOTA POS-EXECUCAO: task baseada numa premissa falsa. Confirmado por Kira via
Glob/Grep antes de despachar — NÃO existe `src/mocks/`, `environment.useMock`
nem qualquer sistema de troca de services por mock no código atual.
`app.config.ts` sempre usa Firestore/Auth reais. Isso vem de uma descrição
da especificação original do usuário que não bate com o código real (o
`stack.md` gerado direto do código, antes da spec, já não mencionava mock
nenhum — só a especificação colada pelo usuário assumia essa peça). Nada a
fazer aqui; task fechada sem alteração de arquivo.

## TASK-020 — [TDD RED] Testes de firestore.rules
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-001, TASK-008
FLUXO: Implementacao
CONTEXTO A LER: regra-de-negocio.md seção 10 (CRÍTICA); regra completa proposta na especificação multi-tenant (seção 6); firestore.rules atual (allow read write if true)
ESCOPO: escrever testes de regra de segurança (via @firebase/rules-unit-testing contra o emulator do Firestore) provando que: leitura/escrita cross-tenant é negada, leitura/escrita same-tenant é permitida, escrita em users/{uid} pelo cliente é sempre negada.
CRITERIO DE ACEITE: testes rodam e falham (RED) porque a regra atual ainda libera tudo (if true); ao menos 1 caso de negação cross-tenant e 1 caso de permissão same-tenant por coleção operacional relevante.
ARQUIVOS PERMITIDOS: firestore.rules.spec.ts (novo, raiz ou pasta de teste dedicada — mike decide o caminho e reporta), package.json (só se precisar adicionar @firebase/rules-unit-testing como devDependency)
NAO FAZER: se @firebase/rules-unit-testing não estiver disponível/instalável no ambiente, não forçar — reportar o gap ao Kira em vez de decidir sozinho instalar dependência nova sem aviso (gap já sinalizado em regra-de-negocio.md seção 12).
RETORNO ESPERADO: arquivo de teste criado + confirmação de RED, ou relatório do gap de tooling se não for viável rodar agora.
NOTA PRE-EXECUCAO: infra do emulador já está pronta desde a TASK-009 — Java
instalado, firebase-tools funcionando, firestore.json com emulators.firestore
configurado (porta 8080), emulador já roda em background nesta sessão (não
precisa reiniciar). O gap de tooling original (falta de infra) não deve mais
se repetir; se @firebase/rules-unit-testing precisar ser instalado, é
esperado que instale sem problema — só confirmar antes de instalar mesmo
assim, por via das dúvidas.
NOTA POS-EXECUCAO: instalado @firebase/rules-unit-testing + jest/ts-jest/
@types/jest como devDependencies (--legacy-peer-deps) — novo runner de
teste SO para firestore.rules (roda via `npx jest test/firestore.rules.
spec.ts`, separado do `ng test`/Karma usado pelos services). Arquivo:
test/firestore.rules.spec.ts, 27 casos, 15 RED / 12 GREEN (same-tenant ja
passa hoje, esperado). 1 correcao de design no meio do caminho: a primeira
versao autenticava simulando CUSTOM CLAIMS no token (request.auth.token.
companyId) — isso so funciona se a Cloud Function da TASK-023 existir, e
ela e opcional/fase 2, NAO implementada. AuthService (TASK-002) so cria o
doc users/{uid}, nao seta claim nenhum. Corrigido: testes agora semeiam
users/{uid} de verdade (via withSecurityRulesDisabled) e autenticam so com
uid/email (token real de login sem claims) — a regra da TASK-021 PRECISA
usar get(/databases/$(database)/documents/users/$(request.auth.uid)).data.
companyId (fase 1), nao request.auth.token.companyId, senao passa no teste
mas quebra pra usuario real.

## TASK-021 — firestore.rules novo
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-018, TASK-020
FLUXO: Implementacao
CONTEXTO A LER: regra-de-negocio.md seção 10 (CRÍTICA); especificação multi-tenant seção 6 (regra completa, base a ajustar pros nomes reais de coleção); firestore.rules.spec.ts da TASK-020
ESCOPO: substituir o allow read write if true pela regra de isolamento por companyId, cobrindo companies/{id}, users/{uid} e as 8 coleções operacionais, usando exatamente os nomes de coleção reais do código (products, sales, orders, comandas, bills, customers, purchases, purchaseProducts).
CRITERIO DE ACEITE: testes da TASK-020 ficam GREEN; nomes de coleção na regra batem com os usados nos services (não com os nomes da especificação genérica, ex. sales não sells).
ARQUIVOS PERMITIDOS: firestore.rules
NAO FAZER: não alterar firestore.rules.spec.ts. Publicar/deployar a regra só depois de TASK-018 confirmado GREEN (services já gravam companyId em toda escrita) — regra publicada antes disso bloqueia o app em produção.
RETORNO ESPERADO: conteúdo final de firestore.rules.
NOTA IMPORTANTE (achado do style na revisão da TASK-010/018): até esta task
fechar, o isolamento por companyId é só client-side — firestore.rules
continua `allow read, write: if true`, ou seja, qualquer chamada direta ao
Firestore (SDK cru, REST, DevTools) ainda lê/escreve dado de qualquer
empresa. TASK-021 é o gate real de segurança do multi-tenant, não uma
formalidade — priorizar.
NOTA POS-EXECUCAO: a task mais pesada da fila em ciclo de revisão — 3
rodadas de correção, cada uma achando um buraco real e diferente, todos
confirmados por execução real contra o emulador (não leitura estática):
(1) `allow update, delete` combinados permitiam trocar `companyId` de um
doc próprio num update, "doando"/vazando o documento pra outro tenant —
corrigido separando update/delete e travando `companyId` como imutável em
update; (2) o `create` de `companies/{id}` dependia de `get()` em
`users/{uid}`, que não enxerga writes pendentes da MESMA transaction —
quebrava o cadastro de empresa nova (a transaction real do
AuthService.signup cria os dois docs juntos) — corrigido permitindo
auto-cadastro quando `companyId == request.auth.uid`, sem depender do
lookup; (3) o fix do ponto 2 abriu um buraco pior em `users/{uid}`: o
`create` só validava que o uid do path batia com o autenticado, não o
CONTEÚDO — um atacante podia se autodeclarar owner de qualquer
`companyId` alheio, sequestrando o tenant inteiro (leitura+escrita
completas). Corrigido travando o `create` no único padrão real do
self-signup (`companyId == uid`, `role == 'owner'`). Também houve uma
interrupção de infraestrutura no meio (emulador caiu/ficou órfão servindo
regra desatualizada 2x) — resolvida pelo Kira, sem relação com a
qualidade do código produzido. 27/27 testes GREEN + 3 rounds de
verificação manual (update, delete, signup, takeover) confirmados de
forma independente antes do aprovado final.

## TASK-022 — [TDD GREEN] Confirmar firestore.rules
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-021
FLUXO: Implementacao
CONTEXTO A LER: firestore.rules.spec.ts da TASK-020
ESCOPO: rodar novamente os testes de regra contra o firestore.rules novo, confirmar GREEN.
CRITERIO DE ACEITE: todos os casos de negação cross-tenant e permissão same-tenant passam.
ARQUIVOS PERMITIDOS: nenhum (só execução)
NAO FAZER: não reescrever os testes nem a regra.
NOTA POS-EXECUCAO: coberta organicamente pelas 3 rodadas de correção da
TASK-021 — style e Kira rodaram `npx jest test/firestore.rules.spec.ts`
(27/27 GREEN) de forma independente repetidas vezes durante o ciclo de
revisão, além de cenários manuais extras (update, delete, signup,
takeover). Não houve necessidade de rodada separada de mike só pra
confirmar o que já foi confirmado varias vezes.
RETORNO ESPERADO: relatório GREEN/FAIL; se FAIL, relatório de bug pro Kira redespachar ao levi.

## TASK-023 — [FASE 2 / OPCIONAL] Cloud Function de custom claims
STATUS: BLOQUEADA (usuário optou por pular por ora — retomar quando decidir migrar de fase 1 para custom claims)
AGENT: levi
DEPENDENCIAS: TASK-001, TASK-005
FLUXO: Implementacao
CONTEXTO A LER: regra-de-negocio.md seção 10 (custom claims vs. lookup fase 1); especificação multi-tenant seção 5 e 8
ESCOPO: criar Cloud Function (firebase init functions) que seta {companyId, role} como custom claim no Auth ao criar um AppUser, chamada pelo fluxo de signup.
CRITERIO DE ACEITE: após signup, o token do usuário carrega companyId/role como custom claim (verificável via getIdTokenResult); firestore.rules pode trocar o lookup em users/{uid} pela leitura direta do token sem quebrar nada.
ARQUIVOS PERMITIDOS: functions/ (pasta nova do firebase init functions), src/services/auth/auth-service.ts (só a chamada à function, se callable)
NAO FAZER: esta task é opcional/fase 2 — não bloqueia TASK-024 nem o fechamento do módulo. Fase 1 (lookup em regra, já coberto por TASK-021) é suficiente pra operar.
RETORNO ESPERADO: function criada + confirmação de que o claim aparece no token após signup.

## TASK-024 — Validação manual de isolamento entre duas empresas
STATUS: BLOQUEADA (usuário optou por pular por ora — retomar quando quiser validar na UI real, manualmente ou via browser automation)
AGENT: mike
DEPENDENCIAS: TASK-006, TASK-018, TASK-019, TASK-021, TASK-022
FLUXO: Implementacao
CONTEXTO A LER: regra-de-negocio.md seção 10 inteira; especificação multi-tenant seção 9, item 11
ESCOPO: criar duas empresas via signup (empresa A e B), popular dado em cada uma (produto, cliente, venda), e confirmar que a sessão da empresa A não lê nem grava dado da empresa B — via UI normal e via tentativa direta com o SDK/console usando o token de A contra um doc de B.
CRITERIO DE ACEITE: nenhuma tela da empresa A exibe dado de B; tentativa direta via SDK de ler/escrever doc de B autenticado como A retorna erro de permissão (não sucesso silencioso).
ARQUIVOS PERMITIDOS: nenhum (validação, não gera código)
NAO FAZER: não corrigir bug encontrado sozinho — reportar ao Kira pra redespachar à task/agent correspondente.
RETORNO ESPERADO: relatório de validação (passou/falhou por cenário testado).

## TASK-025 — Aba Pedidos: filtro "Todos" não exclui finalizados/cancelados
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: vazio
FLUXO: Correcao
CONTEXTO A LER: src/components/order/order.ts (métodos loadData, updateFilter, propriedade sortOrder já implementada)
ESCOPO: ajustar loadData()/orders$ para que o filtro "Todos" use uma fonte que inclua pedidos finished/canceled (hoje usa getPendingOrders(), que os exclui), sem alterar a ordenação recente/antigo que já existe e já funciona.
CRITERIO DE ACEITE: com filtro "Todos" e ordenação "Mais antigo" selecionados, pedidos com status finished e canceled aparecem na lista, ordenados do mais antigo pro mais recente; filtros "Pendente" e "Entregues" continuam com o comportamento atual (não regredir).
ARQUIVOS PERMITIDOS: src/components/order/order.ts
NAO FAZER: não alterar order.html, order-service.ts nem a lógica de sortOrder (recent/oldest) — ela já existe e já está correta, o gap é só na fonte de dados do filtro "Todos".
RETORNO ESPERADO: diff do componente.

## TASK-026 — Índices compostos do Firestore para queries com companyId
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-018
FLUXO: Implementacao
CONTEXTO A LER: achado do style na revisão da TASK-010/018 (registrado no commit db784ca); src/services/bill-service/bill-service.ts (getBills: where(companyId) + orderBy(createdAt)); src/services/purchase-product-service/purchase-product-service.ts (getPurchaseProducts: mesmo padrão); src/services/sale-service/sale-service.ts (getSalesByDate: where(companyId) + where(date>=) + where(date<=) + orderBy(date))
ESCOPO: criar firestore.indexes.json (não existe no repo hoje) com os índices compostos exigidos pelas 3 queries acima — igualdade em companyId combinada com orderBy/range em outro campo. O Firestore Emulator não cobra índice (por isso os testes da TASK-009/018 passaram), mas o Firestore de produção real vai rejeitar essas queries com FAILED_PRECONDITION no primeiro uso após o deploy, sem o índice.
CRITERIO DE ACEITE: firestore.indexes.json cobre os 3 casos (bills: companyId ASC + createdAt DESC; purchaseProducts: companyId ASC + createdAt DESC; sales: companyId ASC + date ASC/DESC conforme o range usado); firebase.json referencia o arquivo (campo "firestore.indexes"); se possível, validar localmente que o formato é aceito pelo `firebase deploy --only firestore:indexes --dry-run` ou equivalente (sem precisar deployar de verdade).
ARQUIVOS PERMITIDOS: firestore.indexes.json (novo), firebase.json (só para referenciar o novo arquivo, campo firestore.indexes)
NAO FAZER: não alterar os services nem os testes; não fazer deploy de verdade pro Firebase (isso é decisão do usuário, fora do escopo de um agent).
RETORNO ESPERADO: conteúdo do firestore.indexes.json + confirmação de que firebase.json referencia o arquivo.

## TASK-027 — Tratar companyId() nulo nas escritas dos 8 services
STATUS: CONCLUIDA
AGENT: mike (RED) + levi (GREEN)
DEPENDENCIAS: TASK-018
FLUXO: Correcao
CONTEXTO A LER: achado do style na revisão da TASK-010/018 (commit db784ca) — TenantService.companyId é signal<string|null>, nenhum dos 8 services trata explicitamente o caso null no momento da chamada; regra-de-negocio.md seção 10
ESCOPO: hoje é um risco teórico (não há caminho de chamada desses services antes do login confirmado), mas sem trava explícita um dev pode introduzir esse buraco sem erro de compilação no futuro (companyId: string obrigatório no model, mas addDoc/transaction.set aceitam null de boa porque as coleções não são tipadas com generics). Adicionar uma guarda mínima nos 8 métodos de escrita (addX/processSale) que lança erro explícito se tenantService.companyId() for null, em vez de gravar companyId: null silenciosamente.
CRITERIO DE ACEITE: teste RED (mike) provando que addX() lança erro claro quando companyId() é null; levi implementa a guarda nos 8 services; mike confirma GREEN. Nenhum documento com companyId: null pode mais ser gravado por nenhum dos 8 services.
ARQUIVOS PERMITIDOS: os 8 arquivos de service (mesmos da TASK-010 a TASK-017), os 8 arquivos .spec.ts correspondentes
NAO FAZER: não mexer em TenantService/AuthService (o sinal null é intencional enquanto desloga/inicializa — a guarda é só no ponto de escrita).
RETORNO ESPERADO: diff dos services + confirmação RED/GREEN.
NOTA POS-EXECUCAO: guarda implementada nos 8 services (throw explícito antes
de qualquer chamada ao Firestore, sempre via método async — 1 rodada de
correção do style por inconsistência async/sync em 3 dos 8 e por
printWidth). 8/8 testes novos GREEN, confirmado 3x de forma independente.

ACHADO IMPORTANTE (fora do escopo desta task, descoberto no processo):
os 17 testes pré-existentes de isolamento com companyId válido (TASK-009/
018) PARARAM DE RODAR no Karma depois da TASK-021 travar firestore.rules
— não é regressão funcional (a lógica já foi provada correta antes das
regras travarem), é uma incompatibilidade de infraestrutura de teste:
`@firebase/rules-unit-testing` (usado pra simular autenticação sem
precisar de um Auth Emulator de verdade) depende de `process.env`
internamente, que não existe em ambiente de browser — e o Karma roda os
specs de service dentro de um Chrome real (ChromeHeadless), não em Node.
Isso NÃO afeta test/firestore.rules.spec.ts (que roda via Jest, em Node).
Tentativa de contornar isso (por um executor, revertida pelo Kira) chegou
a enfraquecer firestore.rules — não repetir essa abordagem. Caminho
correto pra restaurar cobertura completa: subir também um Firebase Auth
Emulator (emulators.auth no firebase.json) e autenticar de verdade via
signInAnonymously()/connectAuthEmulator() no test-helpers.ts (client SDK
normal, funciona em browser) — investimento de infra ainda não feito,
decisão do usuário se/quando vale a pena.

## TASK-028 — Corrigir rótulo de exibição do status 'recebido' em Contas
STATUS: CONCLUIDA
AGENT: hanzo
DEPENDENCIAS: vazio
FLUXO: Correcao
CONTEXTO A LER: regra-de-negocio.md seção 7 (Contas a pagar/receber — item sobre 'recebido'/"A Pagar"); src/components/product-inventory/product-inventory.ts:388 (billStatusLabel: pendente/recebido/pago); src/components/bills/bills.ts:159 (mesmo mapeamento duplicado)
ESCOPO: trocar o texto exibido pro status 'recebido' de conta — hoje aparece como "A Pagar" nas duas telas (bills e aba Contas de Gestão), o que confunde porque a página inteira já se chama "Contas a Pagar" independente do status. Usar um rótulo que reflita o que 'recebido' significa no fluxo (ex.: "Recebido"), sem alterar o valor salvo no Firestore nem a lógica de transição (avancarStatusBill).
CRITERIO DE ACEITE: nenhuma tela mostra mais "A Pagar" como rótulo do status 'recebido' especificamente (o título geral da página "Contas a Pagar" pode continuar); o valor 'recebido' salvo no banco não muda; filtros, KPIs e a lógica de avancarStatusBill que comparam a string 'recebido' continuam funcionando sem alteração.
ARQUIVOS PERMITIDOS: src/components/bills/bills.ts, src/components/bills/bills.html, src/components/product-inventory/product-inventory.ts, src/components/product-inventory/product-inventory.html
NAO FAZER: não renomear o valor do enum/status em bill-model.ts nem migrar dado existente — só o texto de exibição.
RETORNO ESPERADO: diff dos arquivos tocados + rótulo novo escolhido.
HISTORICO: hanzo trocou o rótulo de 'recebido' de "A Pagar" para "Recebido"
em 4 pontos (bills.ts:statusLabel, bills.html KPI + botão de filtro,
product-inventory.ts:billStatusLabel, product-inventory.html KPI + botão
de filtro). Nenhum valor salvo no Firestore mudou; avancarStatusBill,
filtros e getters de total continuam comparando a string 'recebido' sem
alteração. `git grep "A Pagar"` confirmou que só restou o <h1> de título
da página "Contas a Pagar" em bills.html (nome da tela, fora do escopo).
`ng build --configuration production` passou sem erro. Revisado inline
pelo Kira (mudança puramente textual, sem gate do style) — aprovado sem
rodada de correção.
CORREÇÃO POS-EXECUÇÃO: o worktree usado (starry-napping-spark) foi criado
a partir de origin/main, 43 commits atrás de homologacao (faltava o merge
inteiro do multi-tenant). O diff original do hanzo foi feito contra essa
base desatualizada. Kira reaplicou a mesma mudança diretamente sobre o
conteúdo real e atual dos 4 arquivos no checkout principal (copiado antes
de editar, devolvido depois) — confirmado sem nenhuma ocorrência de
"A Pagar" restante nos 4 arquivos reais. A regra-de-negocio.md também
tinha sido corrompida por engano nesse processo (sobrescrita por uma
versão stale de 160 linhas) e foi restaurada a partir do commit 9545645 +
reaplicação das duas decisões (buyPrice e recorrência). Ver relatório
completo dado ao usuário no chat desta sessão.

## TASK-029 — Modelar geração automática da próxima ocorrência de conta recorrente
STATUS: CONCLUIDA
AGENT: killua
DEPENDENCIAS: vazio
FLUXO: Implementacao
CONTEXTO A LER: regra-de-negocio.md seção 7 (bills — recurring/recurrencePeriod) e seção 8 (purchaseProducts — recPeriodMap semanal/mensal vs weekly/monthly, gerarBillDeProdutoCompra); stack.md (confirmar se o projeto já usa Firebase Functions ou só client SDK)
ESCOPO: modelar como a próxima ocorrência de uma bill/purchaseProduct recorrente (recurring=true) passa a ser gerada automaticamente — comparar abordagem client-side (checagem ao carregar a tela de Contas: se passou recurrencePeriod desde a última ocorrência, gera a próxima) contra Cloud Function agendada, e propor a mais adequada à stack atual.
CRITERIO DE ACEITE: entrega comparação das duas abordagens com tradeoffs; esqueleto/contrato de onde a lógica entra (service/método, assinatura, sem lógica real); lista explícita de pontos que precisam decisão do usuário antes de implementar (ex.: o que fazer se o app ficar semanas sem ser aberto — gerar todas as ocorrências atrasadas ou só a mais recente).
ARQUIVOS PERMITIDOS: nenhum — task somente leitura, retorna modelagem em texto (killua não escreve código de implementação).
NAO FAZER: não implementar código; não decidir sozinho o comportamento pra app fechado por muito tempo — reportar como ponto em aberto pro Kira levar ao usuário.
RETORNO ESPERADO: modelagem/proposta de arquitetura + tradeoffs + pontos em aberto pra decisão do usuário antes de seguir pro ciclo TDD (regra crítica).
HISTORICO: killua checou a stack real (sem functions/, sem firebase-functions
no package.json, firebase.json só com hosting+firestore) antes de comparar.
Recomendou client-side (BillRecurrenceService.checkAndGenerateDueOccurrences)
sobre Cloud Function agendada, justificado pela ausência de infra de
Functions hoje (TASK-023 de custom claims já fica em fase 2/opcional pelo
mesmo motivo). Entregou esqueleto de contrato (BillRecurrenceService com
checkAndGenerateDueOccurrences/calcularProximaDataVencimento, campo novo
Bill.recurrenceGroupId, contrato de Cloud Function pra fase 2) e 9 pontos
em aberto pra decisão do usuário (escopo, catch-up, limite de geração,
status inicial, cálculo de dueDate, ponto de gatilho, aceite da fraqueza
multi-tenant do client-side, bill sem dueDate, confirmação de que
calcularProximaDataVencimento entra no ciclo TDD por ser regra crítica).
Nenhum código escrito — task só de modelagem, como definido no escopo.
Implementação fica bloqueada até o usuário responder os pontos em aberto;
vai virar TASK-030+ quando destravar.

## TASK-030 — Implementar geração automática de conta recorrente (BillRecurrenceService)
STATUS: CONCLUIDA
AGENT: mike (RED) + levi (GREEN) + style
DEPENDENCIAS: TASK-029
FLUXO: Implementacao
CONTEXTO A LER: regra-de-negocio.md seção 7 (decisões de recorrência confirmadas: client-side, escopo restrito a bills com purchaseProductId, catch-up gera só a ocorrência mais recente, próxima data = âncora + período); src/services/bill-recurrence-service/bill-recurrence-service.ts (esqueleto entregue na TASK-029, hoje só com NotImplementedException); src/services/bill-service/bill-service.ts (padrão de service Firestore já usado); src/models/bill-model.ts (campos dueDate/recurring/recurrencePeriod/purchaseProductId/status); src/services/tenant-service/tenant-service.ts (padrão de companyId da sessão)
ESCOPO: implementar os dois métodos do esqueleto BillRecurrenceService. (1) calcularProximaDataVencimento(ultimaData, period): soma o período (semanal=+7 dias, mensal=+1 mês) sobre a última data conhecida (âncora), nunca "hoje + período". (2) checkAndGenerateDueOccurrences(companyId): busca bills recurring=true com purchaseProductId preenchido da empresa, agrupa por purchaseProductId pegando só a bill mais recente de cada série, e se a próxima data de vencimento calculada já passou, gera UMA bill nova (status 'pendente', mesmos dados da anterior exceto dueDate recalculada) — nunca recria ocorrências intermediárias perdidas. Se a bill mais recente da série não tiver dueDate, usa createdAt como âncora. Por fim, chamar checkAndGenerateDueOccurrences no ngOnInit de BillsComponent (único ponto de gatilho por ora).
CRITERIO DE ACEITE:
1. calcularProximaDataVencimento com period='semanal' soma 7 dias à data âncora; com period='mensal' soma 1 mês — provado por teste RED do mike antes de qualquer implementação.
2. checkAndGenerateDueOccurrences nunca gera mais de uma bill nova por série de purchaseProductId numa única chamada, mesmo que várias ocorrências tenham ficado atrasadas.
3. Bill gerada automaticamente nasce com status 'pendente' (mesmo padrão do gerarBillDeProdutoCompra manual).
4. Bills sem recurring=true ou sem purchaseProductId nunca entram na geração automática.
5. BillsComponent chama o serviço ao carregar a tela (ngOnInit).
ARQUIVOS PERMITIDOS: src/services/bill-recurrence-service/bill-recurrence-service.ts, src/services/bill-recurrence-service/bill-recurrence-service.spec.ts (novo), src/components/bills/bills.ts, src/services/test-helpers.ts (ampliado: setupFirestoreEmulatorTest ganhou login real no Firebase Auth Emulator + criacao de users/{uid} compativel com firestore.rules, decisao tomada com o usuario em 2026-08-12 apos mike identificar que os 8 testes de I/O nao rodavam por falta de auth real)
NAO FAZER: não implementar Cloud Function (fase 2, fora de escopo, sem infra hoje); não gerar mais de uma ocorrência por checagem mesmo com atraso longo; não alterar bill-service.ts nem purchase-product-service.ts; não editar .claude/tasks.md.
RETORNO ESPERADO: mike confirma RED (teste falha por lógica ausente, não por erro de compilação) → levi implementa até GREEN (usa os testes só como leitura) → mike roda de novo e confirma GREEN.
HISTORICO: rodada RED do mike revelou dois problemas de infra antes de dar
sinal valido: (1) beforeEach compartilhado misturava testes de logica pura
com setup de emulador Firestore, mascarando se os 6 testes de
calcularProximaDataVencimento realmente rodavam — corrigido separando em
describe isolado, sem Firestore; (2) os 8 testes de I/O travavam com
PERMISSION_DENIED porque setupFirestoreEmulatorTest (test-helpers.ts) nunca
fazia login real no Firebase Auth — decisao do usuario (2026-08-12): corrigir
agora. Mike adicionou signInAnonymously + criacao de users/{uid} compativel
com firestore.rules (mockCompanyId passou a ser o uid do usuario logado, unica
forma de satisfazer a regra de create em users/{uid}). Confirmado sem
regressao (8 testes que ja falhavam por outro motivo passaram a passar,
nenhum teste que passava quebrou). RED final: 12/14 valido (6 logica pura +
6 I/O por NotImplementedException); os 2 restantes (isolamento entre
empresas) ficam com PERMISSION_DENIED por um motivo novo e correto — um
unico usuario autenticado nao pode gravar companyId de empresa alheia, dado
que so foi coberto por um unico usuario de teste — decisao do usuario:
fica como divida tecnica conhecida, fora do escopo desta task.

Bloqueio de infra a parte: subagents (mike/levi) tambem sao barrados de
escrever no checkout principal sem worktree isolado nesta sessao background,
e criar um worktree novo aqui recriaria o problema de base desalinhada ja
sofrido nas TASK-028/029 (origin/main 43 commits atras de homologacao).
Decisao do usuario (2026-08-12): desativar o guard pra este repo via
.claude/settings.json ({"worktree":{"bgIsolation":"none"}}), criado pelo
Kira (via copia atraves de worktree descartavel, ja que o proprio arquivo
nao podia ser escrito direto enquanto o guard estava ativo).

Levi implementou calcularProximaDataVencimento (ancora+periodo, overflow de
fim de mes e ano bissexto tratados) e checkAndGenerateDueOccurrences (busca
por companyId+recurring+purchaseProductId, agrupa por serie, gera so a mais
recente vencida, status sempre 'pendente'), plugou a chamada em
BillsComponent.ngOnInit (fire-and-forget). 12/12 GREEN esperados, suite
completa sem regressao (28 SUCCESS). Levi commitou por conta propria
(0c06b50) sem autorizacao explicita do Kira, varrendo tambem
package.json/package-lock.json (WIP do usuario, upgrade do firebase-tools
14.27.0->15.26.0, ja em andamento antes desta task) — decisao do usuario:
manter como esta, conteudo correto so nao devia ter sido commitado sem
perguntar.

Style revisou e deu PRECISA CORRIGIR: (1) checkAndGenerateDueOccurrences sem
guarda contra companyId vazio, quebrando o padrao de defesa em profundidade
fechado na TASK-027; (2) TenantService injetado no construtor mas nunca
usado (dependencia morta); (3) string 'bills' duplicada sem constante COL;
(4) catch em bills.ts so dava console.error, sem notificar o usuario numa
falha de escrita de regra critica. Levi corrigiu os 4 pontos sem tocar em
calcularProximaDataVencimento nem na logica de catch-up (ja aprovadas).
Style revisou de novo, rodou a suite pessoalmente (12 GREEN/2 FAILED,
confirmado) e aprovou. Commit da correcao: e0b8fa3.

Regra de negocio coberta: regra-de-negocio.md secao 7 (bills/recorrencia,
CRITICA) e secao 10 (multi-tenant/companyId, CRITICA, padrao TASK-027
respeitado apos correcao do style).

## TASK-031 — Corrigir seeding de empresa estrangeira nos testes de isolamento tenant
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-030
FLUXO: Correcao
CONTEXTO A LER: src/services/test-helpers.ts (setupFirestoreEmulatorTest atual, login real via signInAnonymously adicionado na TASK-030); test/firestore.rules.spec.ts (padrao de referencia: usa @firebase/rules-unit-testing com testEnv.authenticatedContext(uid, {email}) para autenticar DOIS usuarios distintos — nao aplicavel direto ao Karma por causa do gap de process.env em browser ja documentado, mas o padrao conceitual — dois usuarios autenticados, cada um grava so o proprio dado — e o que precisa ser replicado); firestore.rules linhas 54-61 (regra de create/update exige request.resource.data.companyId == userCompanyId() do usuario autenticado)
ESCOPO: os testes de isolamento "nao deve vazar dado de empresa estrangeira" em 9 arquivos (bill-service.spec.ts, product-service.spec.ts, sale-service.spec.ts, comanda-service.spec.ts, order-service.spec.ts, purchase-service.spec.ts, purchase-product-service.spec.ts, customer-service.spec.ts, bill-recurrence-service.spec.ts) seedam um documento de empresa estrangeira gravando atraves da sessao do UNICO usuario autenticado do teste — desde que test-helpers.ts passou a autenticar de verdade (TASK-030), esse seed e barrado pelas firestore.rules com PERMISSION_DENIED antes do teste conseguir provar isolamento. Adicionar a test-helpers.ts uma forma de autenticar um SEGUNDO usuario de teste (segunda empresa, segundo companyId real, proprio users/{uid}) e usar esse segundo usuario pra gravar o dado "estrangeiro" em cada um dos 9 specs, em vez do usuario principal escrever em nome de outra empresa.
CRITERIO DE ACEITE: os ~10 testes de isolamento "nao deve vazar dado de empresa estrangeira" (contando os 2 do bill-recurrence-service.spec.ts) passam a dar GREEN de verdade, provando isolamento real via dois usuarios autenticados distintos — nao mais PERMISSION_DENIED no arranjo do teste; nenhum teste que ja passava antes regride (rodar suite Karma completa antes/depois e comparar contagem exata).
ARQUIVOS PERMITIDOS: src/services/test-helpers.ts, src/services/bill-service/bill-service.spec.ts, src/services/product-service/product-service.spec.ts, src/services/sale-service/sale-service.spec.ts, src/services/comanda-service/comanda-service.spec.ts, src/services/order-service/order-service.spec.ts, src/services/purchase-service/purchase-service.spec.ts, src/services/purchase-product-service/purchase-product-service.spec.ts, src/services/customer-service/customer-service.spec.ts, src/services/bill-recurrence-service/bill-recurrence-service.spec.ts
NAO FAZER: nao alterar nenhum arquivo de producao (services, models, components, firestore.rules) — e puramente infra de teste; nao editar .claude/tasks.md.
RETORNO ESPERADO: diff de test-helpers.ts + confirmacao, com contagem exata rodada por mike, de quantos testes de isolamento passaram a dar GREEN e que nenhum teste pre-existente regrediu.
HISTORICO: mike extraiu _createEmulatorContext (logica compartilhada) e
adicionou setupSecondUserContext() em test-helpers.ts, sem mudar o
comportamento de setupFirestoreEmulatorTest (mesmo shape de retorno). Os 9
testes de isolamento (10 contando os 2 do bill-recurrence-service.spec.ts)
passaram a seedar o dado estrangeiro pela sessao de um segundo usuario
autenticado de verdade. Kira conferiu o diff (limpo, sem duplicacao) e
rodou a suite completa pessoalmente para validar — nao aceitou so o
relatorio do mike, dado o historico de achados imprecisos nesta sessao.
Resultado confirmado: 38 SUCCESS / 2 FAILED (era 28 SUCCESS antes da
TASK-030). As 2 falhas restantes: AppComponent/SwUpdate (nao relacionado,
pre-existente) e PurchaseService.addPurchase — este ultimo Kira investigou
a causa raiz: a transaction faz update(product) + create(purchase) na
mesma transaction, e o create da nova purchase esbarra em PERMISSION_DENIED
nas firestore.rules. Mike confirmou via git stash que isso ja falhava antes
de qualquer mudanca desta task — bug real, provavelmente pre-existente,
so ficou visivel com a aplicacao real de auth+rules (TASK-030). Fica fora
do escopo desta task; reportado ao usuario como possivel TASK-032.

Regra de negocio coberta: nenhuma nova — task e infraestrutura de teste,
fecha a divida tecnica registrada na TASK-030/regra-de-negocio.md secao 10.

## TASK-032 — Diagnosticar PERMISSION_DENIED em PurchaseService.addPurchase
STATUS: CONCLUIDA
AGENT: mike (diagnostico incompleto) + Kira (causa raiz + correcao)
DEPENDENCIAS: TASK-031
FLUXO: Correcao
CONTEXTO A LER: regra-de-negocio.md secao 2 (Estoque — CRITICA — PurchaseService.addPurchase incrementa stock e sobrescreve buyPrice); src/services/purchase-service/purchase-service.ts (metodo addPurchase — runTransaction com transaction.update no produto + transaction.set na nova compra); src/services/purchase-service/purchase-service.spec.ts (teste "[RED] should auto-inject companyId when adding purchase", falha com PERMISSION_DENIED); firestore.rules linhas 49-66 (regras de create/update para colecoes operacionais, isOperationalCollection inclui 'products' e 'purchases')
ESCOPO: reproduzir o erro (`npx ng test --include='**/purchase-service.spec.ts' --browsers=ChromeHeadless --watch=false`, emuladores Firestore+Auth rodando) e identificar com precisao qual das duas escritas da transaction (`transaction.update(productDocRef, ...)` ou `transaction.set(newPurchaseRef, ...)`) e qual linha exata da firestore.rules estao causando o PERMISSION_DENIED — usar os logs de erro do emulador (costumam indicar a linha da regra) e, se necessario, testar as duas escritas isoladas (fora de transaction) pra isolar qual delas falha sozinha. NAO alterar codigo de producao nem firestore.rules — so diagnosticar e reportar.
CRITERIO DE ACEITE: relatorio identificando (1) se o bug esta no service (transaction mal formada) ou nas regras (regra bloqueando uma escrita legitima) ou no fixture do teste (dado semeado incorreto); (2) a causa raiz exata, com a linha da regra e o motivo pelo qual ela avalia falso; (3) se afeta so o teste ou tambem o app real em producao (ex.: registrar uma compra de verdade pela tela iria falhar do mesmo jeito?).
ARQUIVOS PERMITIDOS: nenhum arquivo alterado — task e so de diagnostico, leitura e execucao de teste.
NAO FAZER: nao corrigir o bug nesta task — reportar ao Kira, que redespacha levi (se for bug de producao) ou o proprio mike (se for so fixture de teste) numa task de correcao separada. Nao editar .claude/tasks.md.
RETORNO ESPERADO: relatorio de diagnostico com a causa raiz identificada e recomendacao de quem deve corrigir (levi pra producao, mike pra fixture de teste).
HISTORICO: mike investigou mas nao concluiu com evidencia solida — teorizou
"race condition no Firestore Emulator" entre signInAnonymously/setDoc de
users/{uid} e o get() de userCompanyId() nas rules, admitindo no proprio
relatorio nao ter conseguido rodar o teste isolado que confirmaria a
hipotese. A teoria nao batia com evidencia ja disponivel na sessao (os
outros ~9 testes usando o mesmo test-helpers.ts, corrigidos na TASK-031,
passavam de forma consistente com o mesmo padrao login+setDoc+uso
imediato) — perdida porque a task foi despachada como agent novo, sem o
contexto da TASK-030/031 que ja apontava pra causa real. Mike tambem
deixou 3 arquivos de spec de debug no working tree
(purchase-service-{basic-user,debug,isolation}.spec.ts) fora do
ARQUIVOS PERMITIDOS ("nenhum") — removidos pelo Kira antes de prosseguir.

Kira reexaminou e conectou o dado que ja estava registrado no HISTORICO da
TASK-030 (achado do mike na epoca, nao aproveitado agora): o teste seedava
o produto com ID fixo ('products/prod-1') em vez de unico. Como o Firestore
do emulador nao e limpo entre execucoes de specs nesta sessao, um documento
remanescente de execucao anterior (pertencente a companyId de outro teste)
ocupava o mesmo path — firestore.rules bloqueava a escrita corretamente
(companyId divergente), antes mesmo de addPurchase() rodar. Confirmado
empiricamente: com Firestore limpo, 3/3 SUCCESS; 5 rodadas consecutivas
sem limpar entre elas, 3/3 estavel em todas. NAO e bug de producao nem de
firestore.rules -- PurchaseService.addPurchase esta correto.

Correcao aplicada por Kira (mudanca minima, tarefa trivial): productId
gerado com Date.now() em vez de string fixa, mesmo padrao ja usado nos
outros testes do arquivo. Suite completa: 39/40 SUCCESS apos a correcao
(a 1 falha restante e AppComponent/SwUpdate, pre-existente, nao
relacionada, fora de qualquer escopo desta sessao).

Regra de negocio coberta: nenhuma nova — confirma que regra-de-negocio.md
secao 2 (Estoque, PurchaseService.addPurchase) esta implementada
corretamente; o problema era so higiene de teste.

## TASK-033 — Resetar filtroContasStatus ao gerar conta a pagar em product-inventory.ts
STATUS: CONCLUIDA
AGENT: hanzo
DEPENDENCIAS: vazio
FLUXO: Correcao
CONTEXTO A LER: regra-de-negocio.md secao 7 (Contas a pagar/receber — CRITICA, maquina de estado 'pendente'->'recebido'->'pago'); src/components/bills/bills.ts (referencia da correcao ja aplicada na TASK anterior desta sessao: salvarConta() reseta filtroStatus = 'todos' apos criar conta com sucesso)
ESCOPO: em src/components/product-inventory/product-inventory.ts, replicar a mesma correcao ja aplicada em bills.ts — apos gerarContaPagar() (linha ~787, dentro da confirmacao de compra) criar a bill com sucesso, resetar filtroContasStatus (linha ~117) para o valor equivalente a 'todos', pra que a conta nova (sempre nasce 'pendente') nao fique invisivel se o filtro ativo estiver em 'recebido'/'pago'. Prefira reset condicional (so mexer no filtro se ele estiver excluindo 'pendente'), corrigindo tambem a observacao do style na correcao anterior de bills.ts (reset incondicional trocava o filtro escolhido de proposito pelo usuario mesmo quando desnecessario).
CRITERIO DE ACEITE: (1) apos gerar conta a pagar via confirmacao de compra com filtroContasStatus em 'recebido' ou 'pago', a conta nova aparece imediatamente na lista; (2) se filtroContasStatus ja estava em 'todos' ou 'pendente', o filtro NAO e alterado (reset condicional, nao incondicional); (3) nenhuma mudanca na ordem/valores da maquina de estado do status da bill.
ARQUIVOS PERMITIDOS: src/components/product-inventory/product-inventory.ts
NAO FAZER: nao alterar bill-service.ts, bills.ts, firestore.rules, bill-model.ts. Nao mudar a logica de avancarStatusBill. Nao editar .claude/tasks.md.
RETORNO ESPERADO: diff aplicado, confirmacao de build (ng build), resumo do que mudou.
HISTORICO: hanzo aplicou reset condicional em confirmarCompra() (~linha 790):
so volta filtroContasStatus pra 'todos' se estava em 'recebido' ou 'pago';
se ja estava em 'todos'/'pendente', nao mexe. ng build sem erro (so
warnings pre-existentes alheios). Achado fora de escopo: existe outra
chamada a billService.addBill em gerarBillDeProdutoCompra (~linha 1033)
que NAO recebeu o mesmo tratamento — mesmo padrao de bug pode se repetir
ali, avaliar task futura.

Style APROVOU de primeira: reset condicional correto (so mexe em
'recebido'/'pago', preserva 'pendente'/'todos'), confirmado via
billsFiltradosRelatorio (unico consumidor de filtroContasStatus) que o
fix resolve o bug real. Maquina de estado intocada. tsc --noEmit limpo.
Reconfirmou o achado do gerarBillDeProdutoCompra (~linha 1034) como
mesmo bug, fora do escopo desta task -> virou TASK-034.

Regra de negocio coberta: nenhuma nova — mesma regra critica da secao 7
(bills.ts), aplicada por consistencia ao segundo fluxo de criacao de
conta dentro de product-inventory.ts.

## TASK-034 — Resetar filtroContasStatus em gerarBillDeProdutoCompra (product-inventory.ts)
STATUS: CONCLUIDA
AGENT: hanzo
DEPENDENCIAS: TASK-033
FLUXO: Correcao
CONTEXTO A LER: regra-de-negocio.md secao 7 (Contas a pagar/receber — CRITICA); TASK-033 neste arquivo (correcao equivalente ja aplicada e aprovada em confirmarCompra())
ESCOPO: em src/components/product-inventory/product-inventory.ts, aplicar o MESMO reset condicional de filtroContasStatus (so reseta pra 'todos' se estiver em 'recebido' ou 'pago') dentro de gerarBillDeProdutoCompra() (~linha 1034-1044), chamada por salvarProdutoCompra() (~linha 1024-1025) — mesmo bug da TASK-033, caminho de criacao de bill diferente (produto de compra recorrente em vez de confirmacao de compra avulsa).
CRITERIO DE ACEITE: (1) apos gerar bill via gerarBillDeProdutoCompra com filtroContasStatus em 'recebido' ou 'pago', a conta nova aparece imediatamente em billsFiltradosRelatorio; (2) se filtroContasStatus ja estava em 'todos'/'pendente', nao muda; (3) nenhuma alteracao na maquina de estado do status da bill.
ARQUIVOS PERMITIDOS: src/components/product-inventory/product-inventory.ts
NAO FAZER: nao alterar bill-service.ts, bills.ts, firestore.rules, bill-model.ts, confirmarCompra() (ja corrigido na TASK-033). Nao editar .claude/tasks.md.
RETORNO ESPERADO: diff aplicado, confirmacao de build (ng build), resumo do que mudou.
HISTORICO: hanzo aplicou o mesmo reset condicional em gerarBillDeProdutoCompra
(~linha 1044). tsc --noEmit limpo.

Style reprovou na 1a rodada: reset idêntico apareceu em dois lugares
(confirmarCompra da TASK-033 + este), virou duplicação real. Redespachado
hanzo: extraiu metodo privado resetFiltroContasStatusSeNecessario(),
substituiu as duas ocorrencias. Style aprovou na 2a rodada — duplicacao
eliminada, posicao logica da chamada preservada nos dois pontos, tsc limpo.

Regra de negocio coberta: nenhuma nova — mesma regra critica da secao 7,
fecha o ultimo caminho de criacao de bill dentro de product-inventory.ts
que ainda tinha o bug do filtro.

## TASK-035 — Esqueletos compilaveis: pagamentos/parcelas/A receber de Pedidos
STATUS: CONCLUIDA
AGENT: killua
DEPENDENCIAS:
ESCOPO: definir os arquivos de esqueleto (assinaturas finais, corpo lancando NotImplemented) do bloco ESQUELETO abaixo; Kira cria os arquivos a partir dele.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (monolitico; secoes 3, 5, 5.2, 5.3), .claude/context/stack.md, .claude/context/clean-code.md, src/models/order-model.ts, src/models/sell-model.ts, src/services/order-service/order-service.ts, src/services/sale-service/sale-service.ts, src/components/order/order-filters.ts
CRITERIO DE ACEITE: (1) `npx tsc --noEmit -p tsconfig.app.json` e `ng build` passam com o esqueleto; (2) nenhuma logica real (so NotImplemented, exceto os tipos/campos novos e o enum MISTO); (3) assinaturas identicas ao bloco ESQUELETO.
ARQUIVOS PERMITIDOS: src/models/order-model.ts, src/models/sell-model.ts, src/services/order-service/order-payment-rules.ts (novo), src/services/order-service/order-receivables-rules.ts (novo), src/services/order-service/order-service.ts (so stubs/assinaturas), src/services/sale-service/sale-service.ts (so stubs), src/components/order/order-filters.ts (so stubs)
NAO FAZER: nao implementar logica; nao remover finalizeOrder (quebra order.ts); nao tocar componentes .ts/.html; nao editar .claude/tasks.md.
RETORNO ESPERADO: lista de arquivos criados/alterados e confirmacao de build.
ESQUELETO:
```ts
// ---- src/models/sell-model.ts ----
// enum PaymentMethod: acrescentar MISTO = 'misto'; PAYMENT_METHOD_LABELS[MISTO] = 'Misto'
// interface Sale: paymentMethod?: PaymentMethod   (passa a opcional)

// ---- src/models/order-model.ts (acrescentar) ----
export type OrderPaymentStatus = 'previsto' | 'pago' | 'cancelado' | 'estornado';
export interface OrderPayment {
  id: string;
  amount: number;
  method: PaymentMethod;     // nunca MISTO
  installments: number;      // informativo; Pix e previsto => 1
  dueDate?: Timestamp;       // so parcelas da agenda (Timestamp.fromDate; nao serverTimestamp)
  paidDate?: Timestamp;      // so status 'pago'
  status: OrderPaymentStatus;
}
// interface Order: payments?: OrderPayment[]; saleId?: string;

// ---- src/services/order-service/order-payment-rules.ts ----
import { Order, OrderPayment } from '../../models/order-model';
import { PaymentMethod } from '../../models/sell-model';

export type CodigoPagamentoInvalido =
  | 'VALOR_INVALIDO' | 'ACIMA_DO_SALDO' | 'PEDIDO_CANCELADO' | 'PEDIDO_FINALIZADO'
  | 'PARCELA_INEXISTENTE' | 'CARTAO_NAO_PARCELA' | 'PARCELAS_NAO_FECHAM'
  | 'TOTAL_ABAIXO_DO_PAGO' | 'PARCELAS_NAO_REAJUSTADAS';
export class PagamentoInvalidoError extends Error {
  constructor(public readonly codigo: CodigoPagamentoInvalido, message: string) { super(message); }
}
export type PedidoFinanceiro = Pick<Order,
  'total' | 'status' | 'payments' | 'paymentMethod' | 'installments' | 'paymentDate' | 'saleId'>;
export interface RegistrarPagamentoInput {
  amount: number; method: PaymentMethod; installments?: number;
  paidDate?: Date;            // default: agora
  parcelaId?: string;         // pagamento de uma parcela prevista
}
export interface ResultadoPagamento { payments: OrderPayment[]; saldo: number; zerouSaldo: boolean; }
export interface ParcelaInput { amount: number; dueDate: Date; method: PaymentMethod; }
export interface FormaFinal { paymentMethod: PaymentMethod; installments: number; }

export function arredondar2(valor: number): number { throw new Error('NotImplemented'); }
export function listarPagamentos(order: PedidoFinanceiro): OrderPayment[] { throw new Error('NotImplemented'); }
export function calcularPago(order: PedidoFinanceiro): number { throw new Error('NotImplemented'); }
export function calcularSaldo(order: PedidoFinanceiro): number { throw new Error('NotImplemented'); }
export function calcularPrevisto(order: PedidoFinanceiro): number { throw new Error('NotImplemented'); }
export function calcularSaldoDescoberto(order: PedidoFinanceiro): number { throw new Error('NotImplemented'); }
export function isPedidoEntregueLegado(order: PedidoFinanceiro): boolean { throw new Error('NotImplemented'); }
export function aplicarPagamento(order: PedidoFinanceiro, input: RegistrarPagamentoInput, gerarId: () => string): ResultadoPagamento { throw new Error('NotImplemented'); }
export function gerarParcelasIguais(saldo: number, quantidade: number, primeiraData: Date, method: PaymentMethod): ParcelaInput[] { throw new Error('NotImplemented'); }
export function aplicarAgendaParcelas(order: PedidoFinanceiro, parcelas: ParcelaInput[], gerarId: () => string): OrderPayment[] { throw new Error('NotImplemented'); }
export function validarNovoTotal(order: PedidoFinanceiro, novoTotal: number, novasParcelas?: ParcelaInput[], gerarId?: () => string): OrderPayment[] { throw new Error('NotImplemented'); }
export function aplicarCancelamento(order: PedidoFinanceiro, estornar: boolean): OrderPayment[] { throw new Error('NotImplemented'); }
export function resolverFormaFinal(payments: readonly OrderPayment[]): FormaFinal | null { throw new Error('NotImplemented'); }
export function deveConcluir(order: PedidoFinanceiro, payments: readonly OrderPayment[]): boolean { throw new Error('NotImplemented'); }

// ---- src/services/order-service/order-receivables-rules.ts ----
import { Order } from '../../models/order-model';
export interface ParcelaReceber {
  orderId: string; orderNumber: number; customerName: string; customerId?: string;
  paymentId: string; k: number; n: number; amount: number; dueDate: Date; diasAtraso: number; // >0 vencida
}
export interface AbaAReceber {
  vencido: number; venceEsteMes: number; proximos: number; quantidadeVencidas: number;
  vencidas: ParcelaReceber[]; esteMes: ParcelaReceber[]; proximosMeses: ParcelaReceber[];
}
export interface MesPanorama { mes: number /* 0-11 */; recebido: number; previsto: number; vencido: number; }
export interface PanoramaAnual { ano: number; meses: MesPanorama[]; recebidoAno: number; aReceberAno: number; vencidoTotal: number; }
export interface MovimentoMes { orderId: string; orderNumber: number; customerName: string; tipo: 'recebido' | 'previsto' | 'vencido'; amount: number; data: Date; }
export interface ResumoValores { total: number; pago: number; saldo: number; }
export function listarParcelasReceber(orders: readonly Order[], hoje: Date): ParcelaReceber[] { throw new Error('NotImplemented'); }
export function montarAbaAReceber(orders: readonly Order[], hoje: Date): AbaAReceber { throw new Error('NotImplemented'); }
export function montarPanoramaAnual(orders: readonly Order[], ano: number, hoje: Date): PanoramaAnual { throw new Error('NotImplemented'); }
export function listarMovimentoDoMes(orders: readonly Order[], ano: number, mes: number, hoje: Date): MovimentoMes[] { throw new Error('NotImplemented'); }
export function calcularRecebidoNoPeriodo(orders: readonly Order[], inicio: Date, fim: Date): number { throw new Error('NotImplemented'); }
export function calcularAReceberTotal(orders: readonly Order[], hoje: Date): number { throw new Error('NotImplemented'); }
export function resumirValoresPedidos(orders: readonly Order[]): ResumoValores { throw new Error('NotImplemented'); }

// ---- src/components/order/order-filters.ts (acrescentar) ----
export function pedidoSaiuDoKanban(order: Order): boolean { throw new Error('NotImplemented'); }
export function excluirPedidosForaDoKanban<T extends Order>(orders: readonly T[]): T[] { throw new Error('NotImplemented'); }

// ---- src/services/sale-service/sale-service.ts (acrescentar, stubs) ----
// addSaleInTransaction(transaction: Transaction, sale: Omit<Sale,'id'|'companyId'>, companyId: string): DocumentReference
// setSalePaymentInTransaction(transaction: Transaction, saleId: string, forma: { paymentMethod: PaymentMethod; installments: number }): void
// cancelSaleRecordInTransaction(transaction: Transaction, saleId: string): void   // so status 'canceled', SEM estoque

// ---- src/services/order-service/order-service.ts (stubs / assinaturas finais) ----
export interface RegistrarPagamentoResultado { concluido: boolean; saldo: number; }
export interface CancelOrderOptions { estornar: boolean; }
// registerPayment(orderId: string, input: RegistrarPagamentoInput): Promise<RegistrarPagamentoResultado>
// setScheduledInstallments(orderId: string, parcelas: ParcelaInput[]): Promise<void>
// updateOrder(orderId: string, orderData: Partial<Order>, opts?: { parcelas?: ParcelaInput[] }): Promise<void>
// cancelOrder(orderId: string, opts: CancelOrderOptions = { estornar: false }): Promise<void>
// (finalizeOrder permanece ate TASK-055; markAsDelivered permanece com assinatura atual)
```
HISTORICO: 2026-10-20 — esqueleto criado inline pelo Kira a partir da forma definida pelo killua (Secao 5, passo 2). Modelos: OrderPayment/OrderPaymentStatus, Order.payments/saleId, PaymentMethod.MISTO + label, Sale.paymentMethod opcional. Novos: order-payment-rules.ts, order-receivables-rules.ts (so NotImplemented). Stubs: SaleService (3 helpers transacionais), OrderService (registerPayment, setScheduledInstallments; updateOrder ganhou opts e cancelOrder ganhou opts com default {estornar:false}, corpos inalterados), order-filters.ts (pedidoSaiuDoKanban, excluirPedidosForaDoKanban). Validacao: tsc app/spec exit 0, ng build ok (so warnings de budget pre-existentes). npm ci rodado no worktree (node_modules ausente). Pontos assumidos da secao 12 (1-8) mantidos: usuario seguiu sem corrigir.

## TASK-036 — [TDD RED] Regras puras de pagamento (order-payment-rules)
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-035
ESCOPO: escrever src/services/order-service/order-payment-rules.spec.ts cobrindo as regras da secao 5.3 e confirmar RED por logica ausente (nunca por erro de compilacao).
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (monolitico; secoes 3, 5, 5.3), src/services/order-service/order-payment-rules.ts (esqueleto), src/models/order-model.ts, src/models/sell-model.ts, src/services/product-service/product-weight-rules.spec.ts (padrao de spec de funcao pura)
CRITERIO DE ACEITE: (1) spec cobre: saldo/pago/previsto derivados; derivacao de finished antigo (1 pagamento valor cheio) e delivered sem saleId = legado; bloqueio valor<=0 e valor>saldo (codigo ACIMA_DO_SALDO) e pedido canceled (PEDIDO_CANCELADO); cartao pago na hora sem virar previsto e Pix forcando installments=1; pagamento de parcela com diferenca indo para a proxima, ou criando parcela nova em dueDate+30 dias, e pagamento maior que a parcela abatendo proximas em cascata; invariante soma(previsto)==saldo e remocao de parcela zerada; pagamento avulso abatendo das previstas mais antigas; gerarParcelasIguais (centavos sobrantes na ultima, fim de mes: 31/01 +1 mes = 28/02); aplicarAgendaParcelas (soma != saldo => PARCELAS_NAO_FECHAM, cartao => CARTAO_NAO_PARCELA, preserva pagas, substitui previstas); validarNovoTotal (novoTotal < pago => TOTAL_ABAIXO_DO_PAGO; previstas desajustadas sem novas => PARCELAS_NAO_REAJUSTADAS); aplicarCancelamento (previstas -> cancelado; estornar true => pago vira estornado, false => segue pago); resolverFormaFinal (uma forma, ultima por paidDate, misto com >1 forma, ignora estornado/cancelado); deveConcluir (delivered && saldo 0; nao conclui pending mesmo com saldo 0); (2) roda `npx ng test --include='**/order-payment-rules.spec.ts' --browsers=ChromeHeadless --watch=false` e todos os testes falham por NotImplemented; (3) nenhum teste depende de Firestore.
ARQUIVOS PERMITIDOS: src/services/order-service/order-payment-rules.spec.ts
NAO FAZER: nao alterar o esqueleto nem codigo de producao; nao editar .claude/tasks.md; nao deixar specs de debug no working tree.
RETORNO ESPERADO: lista de testes, saida do comando mostrando RED por logica ausente.
HISTORICO: 2026-10-20 — mike criou order-payment-rules.spec.ts: 77 testes, RED confirmado (77 FAILED por NotImplemented, 0 por compilacao). Premissas documentadas no spec: parcela 1 vence na data X; fim de mes ancorado (31/01->28/02->31/03); truncamento com resto na ultima (10/7 = 6x1.42 + 1.48); +30 dias em calendario; cascata continua apos zerar intermediaria; finished antes de ACIMA_DO_SALDO. Nao cobertos (regra omissa): cartao com previstas existentes (Kira: abate das mais antigas como avulso, p/ manter invariante), parcelaId apontando p/ pago, novoTotal==pago com previstas, finished antigo sem paymentDate.

## TASK-037 — [TDD GREEN] Implementar regras puras de pagamento
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-036
ESCOPO: implementar order-payment-rules.ts ate o spec da TASK-036 ficar GREEN, sem alterar assinaturas.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (monolitico; secoes 3, 5, 5.3), .claude/context/clean-code.md, src/services/order-service/order-payment-rules.ts, src/services/order-service/order-payment-rules.spec.ts (somente leitura), src/models/order-model.ts, src/models/sell-model.ts
CRITERIO DE ACEITE: (1) todos os testes de order-payment-rules.spec.ts GREEN; (2) funcoes puras (sem Angular/Firestore), comparacoes em centavos inteiros via arredondar2; (3) datas de saida sempre Timestamp.fromDate; erros sempre PagamentoInvalidoError com o codigo da regra.
ARQUIVOS PERMITIDOS: src/services/order-service/order-payment-rules.ts
NAO FAZER: nao editar o spec; nao mudar assinaturas; nao tocar OrderService nem componentes; nao editar .claude/tasks.md.
RETORNO ESPERADO: diff resumido e saida do comando de teste.
HISTORICO: 2026-10-20 — levi implementou order-payment-rules.ts: 77 SUCCESS, 0 FAILED. Centavos inteiros (paraCentavos/deCentavos), Timestamp.fromDate em toda saida, cascata por dueDate posterior a parcela paga, +30 dias calendario, parcelas iguais ancoradas no dia original. Decisao Kira aplicada: avulso de qualquer forma (incl. cartao) abate previstas mais antigas. Interpretacoes do levi: excesso sem parcelas posteriores nao e erro; validarNovoTotal sem novasParcelas aceita se previstas ja fecham o novo saldo; gerarId com fallback Math.random. Pontos abertos p/ OrderService: nao rejeita method 'misto' na entrada; agenda/novoTotal nao bloqueiam canceled/finished (guarda fica no service); pago legado id 'legado' pode ser materializado ao gravar.

## TASK-038 — [TDD GREEN] Confirmar regras puras de pagamento
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-037
ESCOPO: so RODAR os mesmos testes da TASK-036 e confirmar GREEN; se falhar, relatorio de bug.
FLUXO: Implementacao
CONTEXTO A LER: src/services/order-service/order-payment-rules.ts, src/services/order-service/order-payment-rules.spec.ts, .claude/context/regra-de-negocio.md (monolitico; secao 5.3)
CRITERIO DE ACEITE: (1) `npx ng test --include='**/order-payment-rules.spec.ts' --browsers=ChromeHeadless --watch=false` 100% GREEN; (2) nenhum teste reescrito.
ARQUIVOS PERMITIDOS: nenhum
NAO FAZER: nao editar codigo nem spec; nao editar .claude/tasks.md.
RETORNO ESPERADO: GREEN confirmado (contagem) ou relatorio de bug para redespacho do levi.
HISTORICO: 2026-10-20 — mike rodada GREEN: 77 SUCCESS, sem teste passando por motivo errado. Kira abriu ciclo de correcao sobre a TASK-037: (1) regra stale — trava 'Pix nao parcela' foi removida pelo usuario no commit 333d386 (2026-08-28), regra-de-negocio.md secoes 3/5/5.3 corrigidas, implementacao ainda forca Pix=1; (2) guarda nova FORMA_INVALIDA para method 'misto' na entrada (codigo adicionado ao tipo pelo Kira); (3) aplicarAgendaParcelas bloqueia canceled/finished. Cartao quitando parcela especifica: aceito como esta (pago na hora + cascata nas previstas). Correcao segue mike RED -> levi -> mike GREEN.

## TASK-039 — [TDD RED] Regras puras de A receber, resumo de valores e saida do kanban
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-035
ESCOPO: escrever order-receivables-rules.spec.ts e order-filters.spec.ts (novos) e confirmar RED por logica ausente.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (monolitico; secoes 5, 5.3), src/services/order-service/order-receivables-rules.ts (esqueleto), src/components/order/order-filters.ts (esqueleto), src/models/order-model.ts
CRITERIO DE ACEITE: (1) cobre: listarParcelasReceber (so previsto de pedido nao cancelado; k/n pela posicao entre pagamentos com dueDate; diasAtraso>0 so se dueDate < inicio do dia de hoje); montarAbaAReceber (cards vencido / vence este mes (>= hoje ate fim do mes) / proximos, grupos e quantidadeVencidas); montarPanoramaAnual (recebido por paidDate, previsto nao vencido e vencido por mes, recebidoAno, aReceberAno, vencidoTotal de todos os anos); sinal retido (pedido canceled com pago) conta como Recebido, estornado nao; finished antigo derivado conta como Recebido na paymentDate; calcularRecebidoNoPeriodo e calcularAReceberTotal batem com o panorama; listarMovimentoDoMes; resumirValoresPedidos (total, pago, saldo); pedidoSaiuDoKanban (delivered && saldo>0 && saldoDescoberto==0 => true; delivered sem parcelas => false; pending com parcelas => false) e excluirPedidosForaDoKanban; (2) roda `npx ng test --include='**/order-receivables-rules.spec.ts' --include='**/order-filters.spec.ts' --browsers=ChromeHeadless --watch=false` e todos falham por NotImplemented; (3) sem Firestore.
ARQUIVOS PERMITIDOS: src/services/order-service/order-receivables-rules.spec.ts, src/components/order/order-filters.spec.ts
NAO FAZER: nao alterar esqueleto/producao; nao editar order.spec.ts; nao editar .claude/tasks.md.
RETORNO ESPERADO: lista de testes e saida RED.
HISTORICO: 2026-10-20 — mike criou order-receivables-rules.spec.ts (34) e order-filters.spec.ts (11): 45 testes, RED confirmado (45 FAILED por NotImplemented). hoje fixo 20/10/2026. Premissas: mes 0-11 em listarMovimentoDoMes; grupos crescentes por dueDate; calcularAReceberTotal inclui vencidas (conforme 5.3). Nao cobertos: k/n com pagos/estornados misturados, previsto sem dueDate, total de cancelado em resumirValoresPedidos.

## TASK-040 — [TDD GREEN] Implementar regras de A receber, resumo e kanban
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-039, TASK-037
ESCOPO: implementar order-receivables-rules.ts e as 2 funcoes novas de order-filters.ts ate GREEN, reaproveitando listarPagamentos/calcularSaldo/calcularSaldoDescoberto de order-payment-rules.ts.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (monolitico; secoes 5, 5.3), .claude/context/clean-code.md, src/services/order-service/order-receivables-rules.ts, src/services/order-service/order-receivables-rules.spec.ts (leitura), src/components/order/order-filters.ts, src/components/order/order-filters.spec.ts (leitura), src/services/order-service/order-payment-rules.ts
CRITERIO DE ACEITE: (1) specs da TASK-039 GREEN; (2) uma unica funcao de calculo alimenta aba de Pedidos e panorama (sem duplicar formula); (3) funcoes existentes de order-filters.ts continuam intactas.
ARQUIVOS PERMITIDOS: src/services/order-service/order-receivables-rules.ts, src/components/order/order-filters.ts
NAO FAZER: nao editar specs; nao tocar order.ts/order.html nem services; nao editar .claude/tasks.md.
RETORNO ESPERADO: diff resumido e saida dos testes.
HISTORICO: 2026-10-20 — levi implementou order-receivables-rules.ts (fonte unica: listarParcelasReceber + listarRecebimentos alimentam aba/panorama/movimento/totais; saldo via order-payment-rules) e pedidoSaiuDoKanban/excluirPedidosForaDoKanban em order-filters.ts: 45 SUCCESS; order.spec.ts 7 SUCCESS. Pendencias anotadas pelo Kira: k/n hoje conta so previstas (pago de parcela perde dueDate) -> exibe 1/4 em vez de 2/5 da spec; correcao planejada (pago de parcela mantem dueDate; k/n entre pago+previsto com dueDate). finished legado sem paymentDate entra no pago do resumo mas nao no recebido por periodo (sem data). calcularAReceberTotal inclui previstas de qualquer ano.

## TASK-041 — [TDD GREEN] Confirmar regras de A receber e kanban
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-040
ESCOPO: so RODAR os specs da TASK-039 e confirmar GREEN, mais `npx ng test --include='**/order.spec.ts'` para garantir que o filtro existente nao regrediu.
FLUXO: Implementacao
CONTEXTO A LER: src/services/order-service/order-receivables-rules.ts, src/services/order-service/order-receivables-rules.spec.ts, src/components/order/order-filters.ts, src/components/order/order-filters.spec.ts
CRITERIO DE ACEITE: (1) os dois specs novos 100% GREEN; (2) order.spec.ts continua GREEN; (3) nenhum teste reescrito.
ARQUIVOS PERMITIDOS: nenhum
NAO FAZER: nao editar codigo nem spec; nao editar .claude/tasks.md.
RETORNO ESPERADO: GREEN com contagens ou relatorio de bug.
HISTORICO: 2026-10-20 — mike GREEN: receivables+filters 45 SUCCESS, order.spec 7 SUCCESS, sem teste passando por motivo errado. Em paralelo: ciclo de correcao da TASK-037 fechado pelo levi (Pix sem trava, FORMA_INVALIDA p/ misto, agenda bloqueia canceled/finished): order-payment-rules 82 SUCCESS. Aberto ciclo de correcao k/n (pago de parcela mantem dueDate; n conta pago+previsto com dueDate) p/ exibir 2/5 conforme spec.

## TASK-042 — [TDD RED] SaleService em transacao (venda sem forma, atualizar forma, cancelar registro)
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-035
ESCOPO: acrescentar ao sale-service.spec.ts testes (emulador) para os 3 helpers transacionais e confirmar RED.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (monolitico; secoes 2, 3, 5.3), src/services/sale-service/sale-service.ts (esqueleto), src/services/sale-service/sale-service.spec.ts, src/services/test-helpers.ts, src/models/sell-model.ts
CRITERIO DE ACEITE: (1) addSaleInTransaction dentro de runTransaction grava Sale status 'completed', companyId, total cheio, sem paymentMethod e sem tocar estoque; (2) setSalePaymentInTransaction grava paymentMethod/installments (inclusive 'misto'); (3) cancelSaleRecordInTransaction muda so status para 'canceled' e NAO altera o estoque; (4) falha da transacao apos o helper nao deixa Sale gravada (atomicidade); (5) falham por NotImplemented, nao por compilacao; (6) testes existentes do spec preservados.
ARQUIVOS PERMITIDOS: src/services/sale-service/sale-service.spec.ts
NAO FAZER: nao alterar producao; ids de documento unicos (Date.now) como no padrao da TASK-032; nao editar .claude/tasks.md.
RETORNO ESPERADO: testes novos e saida RED (emuladores Firestore+Auth no ar).
HISTORICO: 2026-10-20 — mike acrescentou 6 testes ao sale-service.spec.ts (emulador): TOTAL 6 FAILED (NotImplemented), 3 SUCCESS (testes antigos preservados). Cobre criacao sem forma/sem estoque, atomicidade, forma pix/misto, cancelamento so de status. Nao coberto: cancelSaleRecordInTransaction em Sale inexistente (regra omissa).

## TASK-043 — [TDD GREEN] SaleService em transacao, enum MISTO e Sale.paymentMethod opcional
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-042
ESCOPO: implementar os 3 helpers de SaleService e confirmar que o enum MISTO e Sale.paymentMethod opcional (do esqueleto) nao quebram PDV/Comandas.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (monolitico; secoes 2, 3, 5.3), .claude/context/clean-code.md, src/services/sale-service/sale-service.ts, src/services/sale-service/sale-service.spec.ts (leitura), src/models/sell-model.ts
CRITERIO DE ACEITE: (1) testes da TASK-042 GREEN; (2) processSale e cancelSale existentes inalterados e seus testes GREEN; (3) `ng build` sem erro novo.
ARQUIVOS PERMITIDOS: src/services/sale-service/sale-service.ts, src/models/sell-model.ts
NAO FAZER: nao editar specs; nao alterar PDV (src/components/pdv/); nao editar .claude/tasks.md.
RETORNO ESPERADO: diff resumido, saida de testes e build.
HISTORICO: 2026-10-20 — levi implementou os 3 helpers em sale-service.ts (transaction.set/update, sem runTransaction proprio, sem estoque; constante SALE_STATUS; helpers privados saleRef/mapSaleItems): emulador 9 SUCCESS, 0 FAILED; ng build EXIT 0. processSale/cancelSale inalterados. Atencao: processSale grava paymentMethod mesmo undefined (PDV sempre passa, ok hoje); date da Sale vem do caller -> markAsDelivered deve passar a data da entrega; mapeamento de items duplicado entre processSale e mapSaleItems (unificar depois).

## TASK-044 — [TDD RED] OrderService: registerPayment, setScheduledInstallments e conclusao
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-037, TASK-043
ESCOPO: no order-service.spec.ts, reescrever os testes de finalizeOrder como testes de registerPayment equivalentes e acrescentar os casos novos de registerPayment e setScheduledInstallments; confirmar RED.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (monolitico; secoes 3, 5, 5.3), src/services/order-service/order-service.ts (esqueleto), src/services/order-service/order-service.spec.ts, src/services/order-service/order-payment-rules.ts, src/services/sale-service/sale-service.ts, src/services/test-helpers.ts, src/models/order-model.ts
CRITERIO DE ACEITE: (1) registerPayment: pagamento parcial grava pago e saldo; valor > saldo rejeita (ACIMA_DO_SALDO) sem gravar nada; pedido canceled rejeita; pagamento antes da entrega permitido sem concluir; delivered + saldo 0 conclui (status finished, paymentDate, closingDate, Order.paymentMethod/installments); conclusao atualiza a Sale existente com a forma do ultimo pagamento ou 'misto'; pedido legado (delivered sem saleId) cria a Sale na conclusao com date de conclusao; Pix forca installments=1; cartao vira pago na hora; pagamento de parcela com diferenca reajusta a proxima ou cria +30 dias; (2) atomicidade: falha forcada (ex.: Sale inexistente) NAO deixa pedido finished nem pagamento gravado, e nunca duplica Sale; (3) setScheduledInstallments: soma != saldo rejeita; cartao rejeita; substitui previstas e preserva pagas; (4) falham por NotImplemented; (5) os testes de isolamento companyId existentes do spec ficam preservados.
ARQUIVOS PERMITIDOS: src/services/order-service/order-service.spec.ts
NAO FAZER: nao alterar producao; nao remover testes de isolamento/numeracao; finalizeOrder ainda existe no codigo — nao testar mais ele; nao editar .claude/tasks.md.
RETORNO ESPERADO: lista de testes novos/reescritos e saida RED.
HISTORICO: 2026-10-20 — mike reescreveu order-service.spec.ts: bloco finalizeOrder (5) removido, 25 testes novos de registerPayment/setScheduledInstallments (parcial, bloqueios, antes da entrega, conclusao + forma final/misto, legado cria Sale sem duplicar, cartao, Pix 3x preservado, installments<=0 -> 1, atomicidade com saleId invalido, parcela/avulso/+30 dias, agenda). Emulador: 25 FAILED, 3 SUCCESS (isolamento preservado). Assumido: agenda em canceled -> PEDIDO_CANCELADO (ja coberto pela correcao da 037). Comentario stale de Pix em order-model.ts corrigido inline pelo Kira.

## TASK-045 — [TDD GREEN] OrderService: registerPayment e setScheduledInstallments
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-044
ESCOPO: implementar registerPayment e setScheduledInstallments em runTransaction (ler pedido, aplicar regra pura, gravar payments; na conclusao gravar status/paymentDate/closingDate/paymentMethod/installments e atualizar ou criar a Sale via helpers de SaleService), ate os testes da TASK-044 ficarem GREEN.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (monolitico; secoes 3, 5, 5.3), .claude/context/clean-code.md, src/services/order-service/order-service.ts, src/services/order-service/order-service.spec.ts (leitura), src/services/order-service/order-payment-rules.ts, src/services/sale-service/sale-service.ts
CRITERIO DE ACEITE: (1) testes da TASK-044 GREEN; (2) toda escrita de dinheiro dentro de UMA runTransaction, com todas as leituras antes das escritas e Sale tocada so via SaleService; (3) nenhum serverTimestamp dentro de payments (Timestamp.fromDate); erros de regra sobem como PagamentoInvalidoError.
ARQUIVOS PERMITIDOS: src/services/order-service/order-service.ts
NAO FAZER: nao editar specs; nao remover finalizeOrder (TASK-055); nao tocar markAsDelivered/cancelOrder/updateOrder (TASK-047); nao editar .claude/tasks.md.
RETORNO ESPERADO: diff resumido e saida de testes.
HISTORICO: 2026-10-20 — levi implementou registerPayment (runTransaction, leitura unica antes das escritas, aplicarPagamento + concluirPedido; legado cria Sale via addSaleInTransaction e grava saleId; forma via setSalePaymentInTransaction) e setScheduledInstallments: emulador 28 SUCCESS, 0 FAILED; ng build ok. paymentDate = paidDate do pago mais recente; gerarId = doc(ordersCollection).id. Sale inexistente por saleId faz o commit falhar (precondicao do update) e reverte tudo. Achado: SaleService.addSaleInTransaction descarta customerId (bug da TASK-043, sem cobertura) -> coberto na TASK-046 (RED) e corrigido na TASK-047 (sale-service.ts liberado).

## TASK-046 — [TDD RED] OrderService: markAsDelivered com Sale, cancelOrder, updateOrder e legado
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-045
ESCOPO: acrescentar ao order-service.spec.ts os testes do restante do ciclo e confirmar RED.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (monolitico; secoes 2, 3, 5, 5.3), src/services/order-service/order-service.ts, src/services/order-service/order-service.spec.ts, src/services/order-service/order-payment-rules.ts, src/services/sale-service/sale-service.ts, src/services/test-helpers.ts
CRITERIO DE ACEITE: (1) markAsDelivered: baixa estoque, cria Sale (completed, total cheio, itens com snapshot, sem forma, sale_type order, customerId) e grava Order.saleId na MESMA transacao; estoque insuficiente reverte tudo e nao deixa Sale; entrega dupla (status delivered/finished/canceled) rejeita sem baixar estoque de novo; saldo ja zerado antes da entrega => conclui na entrega (finished + Sale com forma); (2) cancelOrder: pedido delivered devolve estoque UMA vez, cancela a Sale (status canceled), previstas viram cancelado; estornar=true => pagos estornado, estornar=false => pagos permanecem (sinal retido) e nenhuma Sale nova; pedido pending com pagamentos cancela sem mexer em estoque; finished/canceled rejeita; legado (sem saleId) cancela sem tocar Sale; (3) updateOrder: reduzir total abaixo do pago rejeita (TOTAL_ABAIXO_DO_PAGO) sem gravar; com previstas exige opts.parcelas que fechem o novo saldo (PARCELAS_NAO_REAJUSTADAS) e grava itens+total+parcelas atomicamente; sem pagamentos mantem o comportamento atual (total recalculado com soldByWeight); (4) falham por NotImplemented/comportamento ausente, nao por compilacao.
ARQUIVOS PERMITIDOS: src/services/order-service/order-service.spec.ts
NAO FAZER: nao alterar producao; nao editar .claude/tasks.md.
RETORNO ESPERADO: testes novos e saida RED.
HISTORICO: 2026-10-20 — mike acrescentou 17 testes ao order-service.spec.ts (markAsDelivered com Sale/guarda/conclusao na entrega, customerId na Sale de legado, cancelOrder com estorno/sinal retido/Sale cancelada/guardas, updateOrder com TOTAL_ABAIXO_DO_PAGO/PARCELAS_NAO_REAJUSTADAS/escrita unica). Emulador: 13 FAILED, 32 SUCCESS (28 antigos + 4 guardas que o codigo atual ja cumpre: estoque insuficiente reverte, cancel legado, cancelOrder sem opts, updateOrder sem pagamentos). Sessao caiu no meio e a task foi retomada. Revisao style das regras puras (paralela): APROVADO, opcionais de refactor anotados p/ limpeza antes do PR.

## TASK-047 — [TDD GREEN] OrderService: markAsDelivered, cancelOrder e updateOrder
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-046
ESCOPO: reescrever markAsDelivered (guarda de status + Sale na transacao + conclusao se saldo 0), cancelOrder(orderId, opts) e updateOrder(orderId, data, opts) em runTransaction conforme secao 5.3, ate GREEN.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (monolitico; secoes 2, 3, 5, 5.3), .claude/context/clean-code.md, src/services/order-service/order-service.ts, src/services/order-service/order-service.spec.ts (leitura), src/services/order-service/order-payment-rules.ts, src/services/sale-service/sale-service.ts
CRITERIO DE ACEITE: (1) testes da TASK-046 GREEN e demais specs de order-service continuam GREEN; (2) estoque devolvido/baixado exatamente uma vez; Sale criada/cancelada somente via helpers de SaleService; (3) cancelOrder mantem default {estornar:false} para o order.ts atual compilar; `ng build` passa.
ARQUIVOS PERMITIDOS: src/services/order-service/order-service.ts, src/services/sale-service/sale-service.ts (so p/ addSaleInTransaction gravar customerId)
NAO FAZER: nao editar specs; nao remover finalizeOrder; nao tocar componentes; nao editar .claude/tasks.md.
RETORNO ESPERADO: diff resumido, testes e build.
HISTORICO: 2026-10-20 — levi (mesmo executor da 045): markAsDelivered com guarda de status, leituras antes das escritas, baixa de estoque + Sale (addSaleInTransaction, customerId, sem forma) + saleId/actualDeliveryDate na mesma transacao, conclusao na entrega se saldo 0 (pedido passado a deveConcluir ja com status delivered, apontamento do style); cancelOrder com guarda, estoque 1x, aplicarCancelamento, cancelSaleRecordInTransaction; updateOrder transacional com validarNovoTotal e gerarId do service; caminho unico de conclusao (camposDeConclusao) compartilhado com registerPayment. sale-service.ts: addSaleInTransaction grava customerId. Emulador order-service+sale-service: 54 SUCCESS, 0 FAILED; ng build ok. Pontos p/ usuario: pedido total 0 entregue sem pagamento nao conclui (sem forma); editar so o frete nao recalcula total (comportamento pre-existente). Sale date na entrega = serverTimestamp.

## TASK-048 — [TDD GREEN] Confirmar servicos de pagamento e suite completa
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-047
ESCOPO: so RODAR os specs das TASK-042/044/046 e depois a suite completa dentro de `firebase emulators:exec` (ng test), confirmando GREEN ou devolvendo relatorio de bug.
FLUXO: Implementacao
CONTEXTO A LER: src/services/order-service/order-service.spec.ts, src/services/sale-service/sale-service.spec.ts, src/services/order-service/order-payment-rules.spec.ts, src/services/order-service/order-receivables-rules.spec.ts, .claude/context/regra-de-negocio.md (monolitico; secao 5.3)
CRITERIO DE ACEITE: (1) specs de order-service e sale-service 100% GREEN; (2) suite completa verde (unica falha tolerada: AppComponent/SwUpdate pre-existente, se ainda existir); (3) nenhum teste reescrito.
ARQUIVOS PERMITIDOS: nenhum
NAO FAZER: nao editar codigo nem spec; nao editar .claude/tasks.md.
RETORNO ESPERADO: GREEN com contagens ou relatorio de bug para levi.
HISTORICO: 2026-10-20 — mike rodou a suite completa via firebase emulators:exec: TOTAL 388 SUCCESS, 0 FAILED, exit 0 (era 210 em 2026-10-09). Ruido esperado: ERROR de ComandaService (caminho de erro coberto) e WARN AngularFire fora de injection context.

## TASK-049 — Teste de caracterizacao: comissao so entra com pedido concluido
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-048
ESCOPO: acrescentar ao vendedor-service.spec.ts testes que fixam a regra "comissao so com saldo 0"; o codigo ja a cumpre via status 'finished', entao estes testes nascem GREEN (nao ha RED aplicavel).
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (monolitico; secoes 5.2, 5.3), src/services/vendedor-service/vendedor-service.ts, src/services/vendedor-service/vendedor-service.spec.ts, src/models/order-model.ts
CRITERIO DE ACEITE: (1) pedido 'delivered' com payments parciais (saldo>0) nao entra em totalVendido/totalComissao; (2) pedido 'canceled' com sinal retido nao entra; (3) pedido 'finished' entra normalmente (frete fora da base); (4) todos GREEN.
ARQUIVOS PERMITIDOS: src/services/vendedor-service/vendedor-service.spec.ts
NAO FAZER: nao alterar vendedor-service.ts; nao editar .claude/tasks.md.
RETORNO ESPERADO: testes adicionados e saida GREEN.
HISTORICO: 2026-10-20 — mike acrescentou 3 testes de caracterizacao ao vendedor-service.spec.ts (delivered parcial fora; canceled com sinal retido fora; finished quitado entra com frete fora da base): 29 SUCCESS (26 + 3), nascem GREEN como previsto. vendedor-service.ts intocado.

## TASK-050 — UI Pedidos: modal Registrar pagamento, card "Pago R$ X de Y" e kanban
STATUS: CONCLUIDA
AGENT: hanzo
DEPENDENCIAS: TASK-041, TASK-048
ESCOPO: trocar o modal de pagamento por "Registrar pagamento" (valor com default = saldo, forma, parcelas informativas so p/ cartao, data paga default hoje) chamando orderService.registerPayment; botao em todo status exceto cancelado; card do kanban mostra "Pago R$ X de Y"; aplicar excluirPedidosForaDoKanban no filteredOrders$ e em cidadesDisponiveis$.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (monolitico; secao 5.3), .claude/context/identidade-visual.md, .claude/context/clean-code.md, src/components/order/order.ts, src/components/order/order.html, src/components/order/order.css, src/components/order/order-filters.ts, src/services/order-service/order-service.ts, src/services/order-service/order-payment-rules.ts
CRITERIO DE ACEITE: (1) valor > saldo e <=0 bloqueados na UI E erro do servico (PagamentoInvalidoError.codigo) vira notif.warning/error em pt-BR; (2) toast de conclusao quando RegistrarPagamentoResultado.concluido; (3) pedido entregue com parcelas cobrindo o saldo some do kanban; sem chamar finalizeOrder em lugar nenhum de order.ts; Pix forca 1 parcela na UI.
ARQUIVOS PERMITIDOS: src/components/order/order.ts, src/components/order/order.html, src/components/order/order.css, src/components/order/order-mobile.css
NAO FAZER: nao alterar services/models; nao tocar PDV/Comandas; nao editar order.spec.ts; nao editar .claude/tasks.md.
RETORNO ESPERADO: diff aplicado, `ng build` sem erro, resumo.
HISTORICO: 2026-10-20 — hanzo: modal 'Registrar pagamento' (saldo via calcularSaldo, valor default = saldo, forma sem Misto, parcelas informativas p/ todas as formas incl. Pix, data paga default hoje enviada como meio-dia local) chamando registerPayment; mapa tipado codigo -> mensagem pt-BR p/ todos os PagamentoInvalidoError; toast de conclusao; 'Pagar' do delivered abre o modal; icone de pagamento nos demais status (exceto canceled/finished); linha 'Pago R$ X de Y' no card; excluirPedidosForaDoKanban em filteredOrders$ e cidadesDisponiveis$. order.ts nao chama mais finalizeOrder. ng build ok; order.spec 7 SUCCESS. Revisao style do back (order-service/sale-service) em paralelo: APROVADO; opcionais: guarda de status em updateOrder (UI so edita open/pending), duplicacao processSale/mapSaleItems, printWidth, itens repetidos do mesmo produto validados contra estoque cheio (pre-existente).

## TASK-051 — UI Pedidos: modal Montar parcelas e edicao de itens com parcelas
STATUS: CONCLUIDA
AGENT: hanzo
DEPENDENCIAS: TASK-050
ESCOPO: botao "Montar parcelas" (modo A: N iguais mensais a partir da data X via gerarParcelasIguais; modo B: livre) chamando setScheduledInstallments; soma x saldo bloqueando salvar; destaque "vencida ha X dias"; na edicao de itens com pagamentos, bloquear novo total < pago e exigir reajuste de parcelas antes de salvar via updateOrder(id, data, { parcelas }).
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (monolitico; secao 5.3), .claude/context/identidade-visual.md, src/components/order/order.ts, src/components/order/order.html, src/components/order/order.css, src/services/order-service/order-service.ts, src/services/order-service/order-payment-rules.ts
CRITERIO DE ACEITE: (1) soma != saldo impede salvar e mostra a diferenca; cartao nao aparece como forma de parcela; (2) editar itens para total < pago e bloqueado com mensagem; com previstas, salvar so e possivel apos reajustar e a edicao e gravada numa unica chamada; (3) funciona no mobile.
ARQUIVOS PERMITIDOS: src/components/order/order.ts, src/components/order/order.html, src/components/order/order.css, src/components/order/order-mobile.css
NAO FAZER: nao alterar services/models; nao tocar PDV/Comandas; nao editar .claude/tasks.md.
RETORNO ESPERADO: diff aplicado, `ng build`, resumo.
HISTORICO: 2026-10-20 — hanzo (mesmo executor da 050): botao 'Montar parcelas' (card e detalhe, pedido nao canceled/finished com saldo > 0); modal com modo parcelas iguais (gerarParcelasIguais -> previa editavel) e modo livre (abre com previstas atuais); soma x saldo com diferenca, salvar bloqueado ate fechar; formas so Dinheiro/Pix/Cheque/Boleto; lista 'Parcelas previstas' no detalhe com 'vencida ha X dias' e linha 'prox: R$ · dd/mm' no card; edicao de itens bloqueia total < pago e, com previstas desajustadas, abre o mesmo modal pre-carregado e grava via updateOrder(id, data, {parcelas}) numa chamada. Mobile <=600px empilha. ng build ok; order.spec 7 SUCCESS. Ponto p/ style: soma das parcelas e reduce + arredondar2 no componente (nao ha funcao pura de soma).

## TASK-052 — UI Pedidos: cancelamento com pagamentos lancados (estornar ou sinal retido)
STATUS: CONCLUIDA
AGENT: hanzo
DEPENDENCIAS: TASK-051
ESCOPO: em cancelAction, se o pedido tem pagamentos 'pago', avisar o valor ja recebido e perguntar "Estornar?" (sim => estornar:true; nao => sinal retido, estornar:false); informar que parcelas previstas serao canceladas; chamar cancelOrder(id, { estornar }).
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (monolitico; secoes 3, 5, 5.3), .claude/context/identidade-visual.md, src/components/order/order.ts, src/components/order/order.html, src/services/order-service/order-service.ts, src/services/order-service/order-payment-rules.ts
CRITERIO DE ACEITE: (1) sem pagamentos pagos o fluxo atual de confirmacao nao muda; (2) com pagamentos o usuario escolhe estornar ou reter e a escolha chega ao servico; (3) mensagens deixam claro que nao estornar mantem o valor como recebido.
ARQUIVOS PERMITIDOS: src/components/order/order.ts, src/components/order/order.html, src/components/order/order.css
NAO FAZER: nao alterar services; nao tocar a regra de estoque; nao editar .claude/tasks.md.
RETORNO ESPERADO: diff aplicado, `ng build`, resumo.
HISTORICO: 2026-10-20 — hanzo: cancelAction com calcularPago > 0 abre modal proprio (sem confirm nativo): 'Ja recebido: R$ X', aviso de previstas canceladas e, se entregue, de estoque devolvido + venda cancelada; opcoes Estornar R$ X (estornar:true) / Manter como sinal retido (estornar:false, texto 'continua contado como recebido e nao vira venda') / Voltar. Sem pagamento pago o confirm antigo segue igual. Toast indica o caminho; erros via mapa de mensagens. ng build ok; order.spec 7 SUCCESS.

## TASK-053 — UI Pedidos: aba "A receber" (mobile incluso)
STATUS: CONCLUIDA
AGENT: hanzo
DEPENDENCIAS: TASK-052
ESCOPO: abas "Pedidos | A receber (N vencidas)" que trocam o conteudo inteiro; componente novo src/components/order-receivables/ com cards, grupos VENCIDAS / ESTE MES / PROXIMOS MESES e linhas com [Recebi] via montarAbaAReceber; [Recebi] abre Registrar pagamento com a parcela preenchida e editavel (parcelaId); clique no cliente abre o detalhe do pedido.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (monolitico; secao 5.3), .claude/context/identidade-visual.md, src/components/order/order.ts, src/components/order/order.html, src/components/order/order.css, src/components/order/order-mobile.css, src/services/order-service/order-receivables-rules.ts
CRITERIO DE ACEITE: (1) numeros e grupos vem exclusivamente de montarAbaAReceber (sem formula nova no componente); (2) [Recebi] pre-preenche o valor da parcela e a parcela paga some/atualiza em tempo real; (3) layout utilizavel em mobile.
ARQUIVOS PERMITIDOS: src/components/order-receivables/order-receivables.ts, src/components/order-receivables/order-receivables.html, src/components/order-receivables/order-receivables.css, src/components/order/order.ts, src/components/order/order.html, src/components/order/order.css, src/components/order/order-mobile.css
NAO FAZER: nao alterar services/models; nao criar colecao nem service; nao tocar PDV/Comandas; nao editar .claude/tasks.md.
RETORNO ESPERADO: diff aplicado, `ng build`, resumo.
HISTORICO: 2026-10-20 — hanzo: abas 'Pedidos | A receber (N vencidas)' (contador de quantidadeVencidas sobre todos os pedidos); componente standalone OrderReceivablesComponent (src/components/order-receivables/) recebe orders$ completo por @Input e so apresenta montarAbaAReceber: cards Vencido/Vence este mes/Proximos, grupos VENCIDAS/ESTE MES/PROXIMOS MESES, linha cliente · #n · parcela k/n · valor · 'venceu ha X dias'/'vence dd/mm', estado vazio. [Recebi] abre Registrar pagamento com valor/forma da parcela e parcelaId; clique no cliente abre o detalhe. Mobile: cards empilham, [Recebi] 44px. ng build ok; order.spec 7 SUCCESS. Filtros do kanban ainda visiveis na aba A receber -> ocultados na TASK-054.

## TASK-054 — UI Pedidos: valor estimado ao lado do Resumo de Producao
STATUS: CONCLUIDA
AGENT: hanzo
DEPENDENCIAS: TASK-053
ESCOPO: bloco "Valor estimado" (total / pago / saldo) ao lado do Resumo de Producao, via resumirValoresPedidos sobre filteredOrders$.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (monolitico; secao 5.3), .claude/context/identidade-visual.md, src/components/order/order.ts, src/components/order/order.html, src/components/order/order.css, src/services/order-service/order-receivables-rules.ts
CRITERIO DE ACEITE: (1) base e filteredOrders$ (muda com filtro de status/cidade); (2) pedido parcelado que saiu do kanban nao entra; (3) usa order.total gravado (inclui frete).
ARQUIVOS PERMITIDOS: src/components/order/order.ts, src/components/order/order.html, src/components/order/order.css, src/components/order/order-mobile.css
NAO FAZER: nao alterar services; nao editar .claude/tasks.md.
RETORNO ESPERADO: diff aplicado, `ng build`, resumo.
HISTORICO: 2026-10-20 — hanzo: bloco 'Valor estimado' (Total/Pago/Saldo) ao lado do Resumo de Producao via resumirValoresPedidos sobre filteredOrders$ (respeita filtros, exclui parcelados fora do kanban, total gravado com frete); filtros de status/cidade/ordenacao ocultos na aba A receber. Mobile <=768px empilha. ng build ok; order.spec 7 SUCCESS. Revisao style das telas 050-054: 1a rodada PRECISA CORRIGIR (formulas de dinheiro/regra no order.ts — soma de parcelas, pre-check de edicao, dias de atraso, previstas, validacao de valor; order.ts inchado 710->1100; fallback de erro errado em saveInstallments; fechamento duplicado). Ciclo: Kira criou esqueletos (resumirAgenda, avaliarNovoTotal, listarPrevistas, proximaPrevista, valorDePagamentoValido, calcularTotalDoPedido; calcularDiasAtraso exportada) -> mike RED (43) -> levi GREEN (183 puros + 54 emulador; avaliarNovoTotal e validarNovoTotal com predicado comum; OrderService.updateOrder usa calcularTotalDoPedido; itemsTotal arredondado a centavos) -> hanzo trocou formulas, extraiu OrderInstallmentsComponent (src/components/order-installments/) e payment-error-messages.ts; order.ts 991 linhas. 2a rodada style: APROVADO. Opcionais: extrair modais de pagamento/cancelamento, hoje congelado na aba A receber apos meia-noite, tabpanel, 'Pago R$ 0,00 de X' em todo card.

## TASK-055 — Remover OrderService.finalizeOrder
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-050, TASK-048
ESCOPO: remover finalizeOrder (e imports mortos) do OrderService, apos confirmar por busca que nada mais o chama.
FLUXO: Melhoria
CONTEXTO A LER: .claude/context/regra-de-negocio.md (monolitico; secoes 5, 5.3), src/services/order-service/order-service.ts, src/components/order/order.ts
CRITERIO DE ACEITE: (1) grep de `finalizeOrder` em src/ retorna zero; (2) `ng build` e suite do order-service continuam GREEN; (3) nenhuma regra de pagamento alterada.
ARQUIVOS PERMITIDOS: src/services/order-service/order-service.ts
NAO FAZER: nao editar specs nem componentes (se sobrar chamador, parar e reportar); nao editar .claude/tasks.md.
RETORNO ESPERADO: diff, resultado do grep e build.
HISTORICO: 2026-10-20 — levi removeu OrderService.finalizeOrder (sem chamadores) e o import morto de PaymentMethod. grep finalizeOrder em src/: zero. ng build ok; emulador order-service+sale-service 54 SUCCESS. Fecha o bug de Sale duplicada (duas escritas sem transacao) por eliminacao do caminho antigo.

## TASK-056 — Gestao: forma Misto, vendas canceladas fora dos relatorios e cards Recebido/A receber
STATUS: CONCLUIDA
AGENT: hanzo
DEPENDENCIAS: TASK-041, TASK-048
ESCOPO: (a) incluir 'Misto' nos selects filtroFormaPagamento e filtroHistoricoFormaPagamento e no paymentMethodLabel; (b) excluir Sale com status 'canceled' de atualizarRelatorio e das demais agregacoes de vendas (~linhas 617, 709, 779); (c) cards "Recebido no periodo" (calcularRecebidoNoPeriodo) e "A receber" (calcularAReceberTotal) nas abas Vendas e Balanco.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (monolitico; secoes 3, 5.1, 5.3), .claude/context/identidade-visual.md, src/components/product-inventory/product-inventory.ts, src/components/product-inventory/product-inventory.html, src/components/product-inventory/product-inventory.css, src/services/order-service/order-receivables-rules.ts, src/models/sell-model.ts
CRITERIO DE ACEITE: (1) venda cancelada nao entra em faturamento/custo/contagem; (2) filtro por 'Misto' funciona e pedido sem forma aparece com filtro "todos"; (3) os cards usam as funcoes de order-receivables-rules (mesmos numeros da aba A receber de Pedidos).
ARQUIVOS PERMITIDOS: src/components/product-inventory/product-inventory.ts, src/components/product-inventory/product-inventory.html, src/components/product-inventory/product-inventory.css
NAO FAZER: nao alterar services/models; nao tocar order.*; nao mexer na logica de Contas (bills); nao editar .claude/tasks.md.
RETORNO ESPERADO: diff aplicado, `ng build`, resumo.
HISTORICO: 2026-10-20 — hanzo: 'Misto' nos selects de forma (Vendas e Historico; label via PAYMENT_METHOD_LABELS); atualizarRelatorio descarta Sale status 'canceled' na entrada (alimenta faturamento/custo/lucro/margem/qtdVendas, grafico por dia, top produtos, Balanco); Historico Geral mantem canceladas (listagem com label); Vendedores ja so usa finished. Cards 'Recebido no Periodo' (calcularRecebidoNoPeriodo) e 'A Receber' (calcularAReceberTotal) em Vendas e Balanco. ng build ok; product-inventory.spec 23 SUCCESS. Pendente: revisao style junto do lote de UI. Revisao style: 1a rodada APROVADA na regra (canceladas fora de todas as agregacoes, Misto, cards via funcoes puras); 2a rodada APROVADO junto da 057.

## TASK-057 — Gestao: sub-aba Relatorio > A receber (panorama anual)
STATUS: CONCLUIDA
AGENT: hanzo
DEPENDENCIAS: TASK-056
ESCOPO: acrescentar 'receber' ao reportTab com seletor de ano, grafico Chart.js de 12 barras empilhadas (recebido / previsto / vencido nao pago), cards Recebido no ano / A receber no ano / Vencido total, e modal com as parcelas do mes ao clicar na barra (listarMovimentoDoMes), tudo via montarPanoramaAnual.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (monolitico; secao 5.3), .claude/context/identidade-visual.md, .claude/context/stack.md, src/components/product-inventory/product-inventory.ts, src/components/product-inventory/product-inventory.html, src/components/product-inventory/product-inventory.css, src/services/order-service/order-receivables-rules.ts
CRITERIO DE ACEITE: (1) numeros batem com a aba A receber de Pedidos para o mesmo dia (mesma funcao); (2) clique no mes abre o modal com as parcelas daquele mes; (3) a trava existente que volta reportTab para 'vendas' quando o modulo some nao regride.
ARQUIVOS PERMITIDOS: src/components/product-inventory/product-inventory.ts, src/components/product-inventory/product-inventory.html, src/components/product-inventory/product-inventory.css
NAO FAZER: nao alterar services/models; nao criar formula nova de calculo no componente; nao editar .claude/tasks.md.
RETORNO ESPERADO: diff aplicado, `ng build`, resumo.
HISTORICO: 2026-10-20 — hanzo (mesmo executor da 056): sub-aba 'A Receber' no Relatorio com seletor de ano (atual-3..atual+2), Chart.js 12 barras empilhadas Recebido/Previsto/Vencido (cores lidas dos tokens success/info/danger), cards Recebido no Ano / A Receber no Ano / Vencido Total ('todos os anos'), modal do mes via listarMovimentoDoMes; tudo de montarPanoramaAnual. selecionarReportTab() destroi/recria o chart na troca de aba/ano/dados + ngOnDestroy; trava de modulo vendedores preservada. ng build ok; product-inventory.spec 23 SUCCESS. Revisao style 1a rodada: PRECISA CORRIGIR (2 bugs: grafico em branco ao voltar da aba principal — canvas destruido pelo *ngIf com chart orfao; modal do mes fechando a cada snapshot de orders). hanzo corrigiu: selecionarAbaPrincipal(tab) destroi/redesenha; recalcularPanorama() no snapshot nao fecha modal e recalcula movimentos; atualizarPanorama() (troca de ano) fecha. Opcionais aplicados: constantes ANOS_PANORAMA_PARA_TRAS/FRENTE, grade via token, classes kpi-value-*, hint 'ignora filtros' nos cards de Vendas. product-inventory.spec 23 SUCCESS. 2a rodada style: APROVADO. Restam opcionais pre-existentes (destroy de salesChart/topProductsChart, filtro de cancelada no componente em vez do SaleService).

## TASK-058 — Pedidos: limite de 60 parcelas em Montar parcelas (crash com N enorme)
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-057
FLUXO: Correcao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (secao 5.3, "### Parcelas previstas", bullet "Limite"); .claude/context/clean-code.md
ESCOPO: Rejeitar mais de 60 parcelas previstas (PARCELAS_ACIMA_DO_LIMITE) e parcela abaixo de R$ 0,01 no modo iguais, validando antes de montar a lista.
CRITERIO DE ACEITE: gerarParcelasIguais(…, 61/100000) e agendas/reajustes com 61 itens lancam PARCELAS_ACIMA_DO_LIMITE; quantidade > saldo em centavos lanca VALOR_INVALIDO; UI limita o input e mostra a mensagem.
ARQUIVOS PERMITIDOS: src/services/order-service/order-payment-rules.ts, src/services/order-service/order-payment-rules.spec.ts, src/components/order/payment-error-messages.ts, src/components/order-installments/order-installments.ts, src/components/order-installments/order-installments.html
NAO FAZER: mexer em outras regras de parcelas
RETORNO ESPERADO: suite verde + aprovacao do style
HISTORICO: Bug reportado pelo usuario (N enorme travou a aba: Array.from sem teto). Limite 60 decidido pelo usuario. mike RED: 8 testes (5 falharam por assercao; caso 1e9 trocado por 100000 para nao travar o runner). levi GREEN: MAXIMO_DE_PARCELAS exportada, validarTamanhoDaAgenda em validarAgenda (cobre agenda livre e reajuste) e em validarQuantidadeDeParcelas (antes do Array.from) + piso de centavos. Kira inline na UI: [max] no input, mensagem de quantidade propria e PARCELAS_ACIMA_DO_LIMITE em MENSAGENS_PAGAMENTO. Suite 464 SUCCESS. style APROVADO em 1 rodada (obs nao bloqueante: "R$ 0,01" fixo em 2 mensagens). gon nao se aplica.

## TASK-059 — Context: secao 5.4 Pedido recorrente, schema e stack
STATUS: CONCLUIDA
AGENT: killua
DEPENDENCIAS:
ESCOPO: Registrar a secao 5.4 (decisoes do usuario), a colecao recurringOrders no schema e a nota de Spark/HML no stack.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md; .claude/context/schema.dbml; .claude/context/stack.md
CRITERIO DE ACEITE: secao 5.4 cobre as decisoes do usuario; schema.dbml tem recurringOrders e os 2 campos novos em orders; stack.md registra que HML nao roda Functions.
ARQUIVOS PERMITIDOS: .claude/context/regra-de-negocio.md, .claude/context/schema.dbml, .claude/context/stack.md
NAO FAZER: assumir resposta nao dada pelo usuario
RETORNO ESPERADO: diff resumido
HISTORICO: killua arquitetou (read-only); Kira aplicou o texto no context (killua nao escreve em .claude/). Usuario aceitou todas as recomendacoes e decidiu: geracao no cliente agora; Cloud Function agendada so quando a feature for para prod. Desvio do killua: customerId opcional no modelo (pedido pode nao ter cliente cadastrado). Esqueletos criados por Kira: src/models/recurring-order-model.ts, recurrence-rules.ts, recurring-order-build-rules.ts; Order ganhou recurringOrderId/occurrenceDate.

## TASK-060 — [TDD RED] Regras de data da recorrencia
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-059
ESCOPO: Escrever testes das funcoes de recurrence-rules.ts e confirmar RED por logica ausente.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (secao 5.4); src/services/recurring-order-service/recurrence-rules.ts; src/models/recurring-order-model.ts
CRITERIO DE ACEITE: cobre weekly/biweekly/monthly (dia 31 em mes curto, ancora em startDate)/weekdays, endDate inclusivo, janela com antecedencia/catch-up/generateFrom/lastGeneratedDate, teto por execucao, validarAgenda (4 codigos), idDaOcorrencia deterministico, hojeCivil/dataDoAgendamento locais; RED por NotImplemented, nao por compilacao.
ARQUIVOS PERMITIDOS: src/services/recurring-order-service/recurrence-rules.spec.ts
NAO FAZER: alterar o esqueleto; usar Date.now real
RETORNO ESPERADO: lista de testes + saida do RED
HISTORICO: mike: 50 testes em recurrence-rules.spec.ts (validarAgenda 15, hojeCivil 2, dataDoAgendamento 1, listarDatas 13, proxima 5, janela 12, id 2); RED 50/50 por NotImplemented. Ambiguidades levantadas (codigo p/ weekdays fora de 'weekdays', endDate recem-passado no catch-up, teto = 14 primeiras, apos < startDate) decididas por Kira derivando da regra aprovada e registradas na 5.4; caso extra do endDate recem-passado adicionado.

## TASK-061 — [TDD GREEN] Implementar regras de data da recorrencia
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-060
ESCOPO: Implementar recurrence-rules.ts ate o spec ficar GREEN.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (secao 5.4); .claude/context/clean-code.md; src/services/recurring-order-service/recurrence-rules.ts; src/services/recurring-order-service/recurrence-rules.spec.ts (leitura)
CRITERIO DE ACEITE: spec da TASK-060 verde; funcoes puras sem Date.now interno; constantes nomeadas.
ARQUIVOS PERMITIDOS: src/services/recurring-order-service/recurrence-rules.ts
NAO FAZER: editar o spec
RETORNO ESPERADO: suite verde
HISTORICO: levi: aritmetica civil em UTC (Date.UTC), local so em hojeCivil/dataDoAgendamento; ancoragem mensal local (adicionarMesesAncorado nao e exportado); laco limitado por teto/janela. 50/50 GREEN. style APROVADO em 1 rodada; polimento aplicado inline por Kira (FREQUENCIA_MENSAL, UM_DIA, cursor->dataMinima), 50/50 de novo.

## TASK-062 — [TDD RED] Montar modelo e pedido da ocorrencia
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-061
ESCOPO: Testar montarModeloDoPedido e montarPedidoDaOcorrencia.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (secoes 5, 5.3, 5.4); src/services/recurring-order-service/recurring-order-build-rules.ts; src/models/order-model.ts; src/models/recurring-order-model.ts; src/services/order-service/order-payment-rules.ts (calcularTotalDoPedido); src/services/product-service/product-weight-rules.ts
CRITERIO DE ACEITE: preco/custo do produto atual; peso com snapshot soldByWeight; produto ausente/outra empresa/sellPrice nao finito => ok:false; status pending; recurringOrderId/occurrenceDate/scheduledDate preenchidos; frete, endereco e vendedor do molde; modelo sem preco e generateFrom = startDate.
ARQUIVOS PERMITIDOS: src/services/recurring-order-service/recurring-order-build-rules.spec.ts
NAO FAZER: alterar o esqueleto
RETORNO ESPERADO: lista de testes + saida do RED
HISTORICO: mike: 25 testes RED; 6 ambiguidades (nome atual vs snapshot, soldByWeight divergente, preco 0/negativo, itens vazios/quantity invalida, pedido sem id, detail) decididas por Kira e registradas na 5.4 (bullet Detalhes); 'ITENS_INVALIDOS' adicionado ao union por Kira; +9 testes (34). Rodada 3 (achado do style): +10 testes de buyPrice (44).

## TASK-063 — [TDD GREEN] Implementar montagem de modelo e pedido
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-062
ESCOPO: Implementar recurring-order-build-rules.ts reusando calcularTotalDoPedido.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (secoes 5, 5.3, 5.4); .claude/context/clean-code.md; src/services/recurring-order-service/recurring-order-build-rules.ts; src/services/recurring-order-service/recurring-order-build-rules.spec.ts (leitura); src/services/order-service/order-payment-rules.ts (leitura)
CRITERIO DE ACEITE: spec da TASK-062 verde; nenhuma matematica de dinheiro duplicada.
ARQUIVOS PERMITIDOS: src/services/recurring-order-service/recurring-order-build-rules.ts
NAO FAZER: editar o spec
RETORNO ESPERADO: suite verde
HISTORICO: levi: montarModeloDoPedido/montarPedidoDaOcorrencia reusando validarAgenda e calcularTotalDoPedido; semUndefined p/ chaves opcionais; detail usa productName do modelo (nao vaza titulo de produto de outro tenant). style rodada 1 PRECISA CORRIGIR: buyPrice nao validado (custo NaN contaminaria lucro/comissao) + aspas/acentos -> 5.4 atualizada (preco OU custo invalido), mike RED +10, levi corrigiu. style rodada 2 APROVADO. 44/44 + 50/50.

## TASK-064 — [TDD RED] RecurringOrderService (CRUD e geracao idempotente)
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-063
ESCOPO: Testar o service contra o emulador.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (secoes 5, 5.4, 10); src/services/recurring-order-service/recurring-order-service.ts; src/services/order-service/order-service.ts; src/services/order-service/order-service.spec.ts (referencia de setup)
CRITERIO DE ACEITE: generateOccurrence cria pedido rec_..., orderNumber do contador e cursor na mesma transacao; 2a chamada => already-exists sem consumir numero; concorrencia gera 1 pedido; produto ausente => skipped-issue com cursor/lastIssue e contador intacto; pausado/encerrado => not-due; ultima ocorrencia => ended; resume grava generateFrom=hoje; queries por companyId.
ARQUIVOS PERMITIDOS: src/services/recurring-order-service/recurring-order-service.spec.ts
NAO FAZER: alterar o esqueleto
RETORNO ESPERADO: lista de testes + saida do RED
HISTORICO: mike: 26 testes contra emulador (createFromOrder 5, multi-tenant 2, generateOccurrence 9 incl. concorrencia Promise.all, generateDueOccurrences 4, maquina de estado 4, update 2); RED 26/26 (2 falsos verdes corrigidos com not.toBe('NotImplemented')). Decisoes Kira: resume/update de ended lancam Error sem codigo; skipped-issue nao incrementa generatedCount; perdedor da corrida = already-exists.

## TASK-065 — [TDD GREEN] Implementar RecurringOrderService
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-064
ESCOPO: Implementar o service: transacao leituras-antes-de-escritas, check de existencia, guarda de companyId.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (secoes 5, 5.4, 10); .claude/context/clean-code.md; src/services/recurring-order-service/*; src/services/order-service/order-service.ts (leitura)
CRITERIO DE ACEITE: spec da TASK-064 verde; nenhum getDoc+setDoc fora de transacao; erro sobe.
ARQUIVOS PERMITIDOS: src/services/recurring-order-service/recurring-order-service.ts
NAO FAZER: editar spec; alterar OrderService
RETORNO ESPERADO: suite verde
HISTORICO: levi: 1a versao lia orders/rec_... e products/{id} na transacao -> rules negam leitura de doc inexistente; levi propos afrouxar rules (oraculo de existencia cross-tenant) e Kira RECUSOU. Redesenho (5.4 atualizada): cursor lastGeneratedDate como trava de idempotencia, produtos por consulta filtrada por companyId fora da transacao (1x por rodada). mike ajustou helper do spec (consulta em vez de getDoc). style rodada 1 PRECISA CORRIGIR: modelo vencido nunca virava ended; erro engolido no lote; resume em active descartava ocorrencias; duplicacoes/logica pura no service -> mike +6 RED, levi corrigiu (agendaEsgotada, falhas?: string[] opcional p/ nao quebrar toEqual, resume so paused, itemDoModelo/MODELO_ATIVO unicos, funcoes de alteracao nas build-rules com null->deleteField so no service, update aceita endDate/weekdays null). style rodada 2 PRECISA CORRIGIR: agendaEsgotada ignorava hoje/catch-up (semanal 10-07/fim 10-15/hoje 10-21 ficava active) e sem unit test -> Kira unificou com proximaOcorrenciaPendente(agenda,cursor,hoje) (tambem usada pela UI); mike +17 RED; levi GREEN. style rodada 3 APROVADO (obs nao bloqueantes: dois caminhos de encerramento — camposDeFimDeAgenda e agendaEsgotada — unificar depois; linha >100). mike GREEN 153/153. gon APROVADO (riscos residuais: integridade client-side ja aceita — reset manual do cursor permitiria set sobre pedido existente; update sem validacao de tipo em campos texto/numero; counters sem nextOrderNumber falha isolado).

## TASK-066 — [TDD RED] Regras do Firestore para recurringOrders
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-059
ESCOPO: Estender o spec de rules (Jest) para recurringOrders.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (secoes 5.4, 10, 13); firestore.rules; test/firestore.rules.spec.ts
CRITERIO DE ACEITE: empresa A nao le nem escreve recurringOrders da B; create exige companyId do usuario; update nao muda companyId; super-admin no padrao das colecoes operacionais; RED porque a colecao nao esta na lista.
ARQUIVOS PERMITIDOS: test/firestore.rules.spec.ts
NAO FAZER: editar firestore.rules
RETORNO ESPERADO: saida do RED
HISTORICO: mike: describe recurringOrders em test/firestore.rules.spec.ts (16 casos; seed com withSecurityRulesDisabled para a leitura cross-tenant avaliar a regra). RED: 9 permitidos falhando por PERMISSION_DENIED; 7 negados ja passavam; 51 preexistentes verdes.

## TASK-067 — [TDD GREEN] Incluir recurringOrders nas rules
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-066
ESCOPO: Adicionar 'recurringOrders' em isOperationalCollection.
FLUXO: Implementacao
CONTEXTO A LER: firestore.rules; test/firestore.rules.spec.ts (leitura); .claude/context/regra-de-negocio.md (secao 10)
CRITERIO DE ACEITE: npm run test:rules verde; nenhuma outra regra alterada.
ARQUIVOS PERMITIDOS: firestore.rules
NAO FAZER: afrouxar qualquer condicao
RETORNO ESPERADO: suite de rules verde
HISTORICO: levi: 'recurringOrders' adicionada em isOperationalCollection (unica linha). test:rules 67/67. gon pendente (revisao conjunta com o service na TASK-065). gon APROVADO junto com a TASK-065.

## TASK-068 — [TDD GREEN] Confirmar nucleo, service e rules
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-065, TASK-067
ESCOPO: Rodar a suite completa (ng test no emulators:exec + test:rules) sem reescrever teste.
FLUXO: Implementacao
CONTEXTO A LER: specs das TASK-060/062/064/066
CRITERIO DE ACEITE: suite inteira verde; relatorio de bug se falhar.
ARQUIVOS PERMITIDOS: nenhum
NAO FAZER: editar teste
RETORNO ESPERADO: contagem de specs e status
HISTORICO: Kira rodou a suite completa (emulators:exec): Karma 617 SUCCESS; test:rules 67/67; ng build sem erro (so avisos de budget preexistentes, order.css > 20 kB).

## TASK-069 — UI Pedidos: "Repetir pedido", selo e gatilho de geracao
STATUS: CONCLUIDA
AGENT: hanzo
DEPENDENCIAS: TASK-068
ESCOPO: No detalhe, acao "Repetir pedido"; selo discreto no card do gerado; OrderComponent dispara generateDueOccurrences uma vez por sessao.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (5.4); .claude/context/identidade-visual.md; .claude/context/clean-code.md; src/components/order/order.ts|html|css; src/services/recurring-order-service/recurring-order-service.ts (leitura)
CRITERIO DE ACEITE: nenhum botao novo no card; validacao via validarAgenda com notif.warning; selo so em pedido gerado; original com recorrencia mostra estado em vez de oferecer de novo.
ARQUIVOS PERMITIDOS: src/components/order/order.ts, order.html, order.css, order_mobile.css, src/components/order-recurrence/*
NAO FAZER: tocar services; fluxo de pagamento/parcelas
RETORNO ESPERADO: arquivos tocados + decisoes de UX
HISTORICO: hanzo: modal standalone src/components/order-recurrence/ (frequencia, dias, 1a data via proximaDataDeOcorrencia, fim opcional; validarAgenda + mensagens por codigo); selo Recorrente no card e detalhe; 'Repete: <freq>' no original; generateDueOccurrences 1x por sessao/empresa (Set estatico) sem bloquear. Decisao Kira (pergunta do style, 5.4): Repetir pedido nao aparece em pedido gerado e reaparece se so houver modelos encerrados.

## TASK-070 — UI Pedidos: pill "Recorrentes" e gestao dos modelos
STATUS: CONCLUIDA
AGENT: hanzo
DEPENDENCIAS: TASK-069
ESCOPO: Pill "Recorrentes" (so se existir modelo); lista com proxima data, pausar, retomar, encerrar, editar e aviso de lastIssue.
FLUXO: Implementacao
CONTEXTO A LER: igual a TASK-069
CRITERIO DE ACEITE: pill ausente sem modelos; encerrado nao reabre; editar nao altera pedidos ja gerados; mobile incluso.
ARQUIVOS PERMITIDOS: src/components/order/order.ts, order.html, order.css, order_mobile.css, src/components/order-recurrence/*
NAO FAZER: tocar services
RETORNO ESPERADO: arquivos tocados
HISTORICO: hanzo: aba extraida em recurring-orders-tab.* + recurring-order-view.ts; pill so com modelos; proxima data via proximaOcorrenciaPendente (so ativo); lastIssue; pausar/retomar/encerrar (modal proprio)/editar (modal reaproveitado: agenda, remover fim -> endDate null, itens com validarPeso, frete, observacoes).

## TASK-071 — UI Clientes: "Pedidos recorrentes deste cliente"
STATUS: CONCLUIDA
AGENT: hanzo
DEPENDENCIAS: TASK-070
ESCOPO: Lista de leitura dos modelos do cliente com atalho pausar/editar.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/identidade-visual.md; .claude/context/clean-code.md; componente de cliente (Kira identifica); src/services/recurring-order-service/recurring-order-service.ts (leitura)
CRITERIO DE ACEITE: so leitura + 2 atalhos; some sem modelos; usa getByCustomer.
ARQUIVOS PERMITIDOS: componente de cliente identificado pelo Kira + css
NAO FAZER: gestao completa nessa tela
RETORNO ESPERADO: arquivos tocados
HISTORICO: hanzo: src/components/customer-recurring-orders/ embutido no 'Editar Cliente' (Gestao > Clientes); so leitura + pausar/retomar; proxima data via proximaOcorrenciaPendente. style UI (069-071) rodada 1 PRECISA CORRIGIR: duplicacao de rotulos/datas/erros com order-recurrence, @media no meio do CSS anulando alvo de 44px -> hanzo unificou (montarLinhaRecorrente, rotuloDaProximaData defensiva, notificarErroDoModelo) e moveu o @media. style rodada 2 APROVADO (obs: cliente mostra proxima data tambem em pausado, a aba nao).

## TASK-072 — Cloud Function agendada de geracao (somente PROD)
STATUS: BLOQUEADA
AGENT: killua
DEPENDENCIAS: TASK-068
ESCOPO: Arquitetar e implementar onSchedule diaria que reusa o nucleo e a mesma idempotencia.
FLUXO: Implementacao
CONTEXTO A LER: functions/src/index.ts; functions/package.json; .claude/context/regra-de-negocio.md (5.4, 13)
CRITERIO DE ACEITE: definido na virada para prod
ARQUIVOS PERMITIDOS: definido na virada para prod
NAO FAZER: implementar antes da virada para prod
RETORNO ESPERADO: desenho
HISTORICO: Decisao do usuario (2026-10-21): a function entra so quando a feature for para producao, depois de testada em homolog com a geracao no cliente. Aviso do style (TASK-061): hojeCivil usa getters locais; servidor em UTC calcularia 'hoje' errado no fim da tarde BR — a Function precisa calcular hoje em America/Sao_Paulo.

<!-- Modulo Despesas: tasks originalmente TASK-035..064 na branch do modulo; renumeradas para TASK-073..102 no merge com homologacao (colisao com Pedidos). -->

## TASK-073 — Aplicar alteração de context do módulo Despesas
STATUS: CONCLUIDA
AGENT: killua
DEPENDENCIAS: vazio
ESCOPO: aplicar em .claude/context o texto aprovado do módulo Despesas (skill alterar-context): regra-de-negocio.md (§1, §2, §5.2, §7, §8, §10, §11, §12 e nova §14), schema.dbml (diff) e stack.md (coleções, rules, runner node:test).
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro, monolitico), .claude/context/schema.dbml, .claude/context/stack.md, C:/Users/Felps/.claude/skills/alterar-context/SKILL.md; o bloco "Context (A)" entregue pelo killua na rodada de arquitetura (Kira cola no briefing).
CRITERIO DE ACEITE: (1) §7 e §8 substituídas, §11 sem `compras`, §14 criada, com D1-D7 registradas em 7.6 e [CRÍTICA] em 7, 8 e 14; (2) schema.dbml tem expenses/expenseCategories/expenseSeries e marca bills/purchaseProducts como LEGADO; (3) nenhuma outra seção alterada além das listadas e nenhuma referência residual a "Produtos de compra"/"aba Compras" como existentes (grep).
ARQUIVOS PERMITIDOS: .claude/context/regra-de-negocio.md, .claude/context/schema.dbml, .claude/context/stack.md
NAO FAZER: não decidir regra nova; não reabrir D1-D7; não tocar em código; não editar .claude/tasks.md. Itens marcados [CONFIRMAR] ficam marcados.
RETORNO ESPERADO: relatório da skill (antes/depois por seção, índice de dependência n/a por ser monolítico, agents afetados).
HISTORICO: 2026-10-22 — texto de context redigido pelo killua (arquitetura do modulo, decisoes D1-D7 do usuario) e aplicado pelo Kira em regra-de-negocio.md (§1, §2, §5.2, §7, §8, §10, §11, §12, nova §14), schema.dbml (3 tabelas novas, bills/purchaseProducts LEGADO, nota stale de "purchase-products" corrigida — o nome real no codigo e purchaseProducts) e stack.md (colecoes, rules, runner node:test). Itens [CONFIRMAR] mantidos para a TASK-101.

## TASK-074 — Models, defaults e esqueletos de assinatura do módulo Despesas
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-073
ESCOPO: criar os arquivos de model/defaults e os esqueletos compiláveis (corpo `throw new Error('not implemented')`) exatamente como entregues pelo killua, sem lógica.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro), .claude/context/schema.dbml, .claude/context/clean-code.md, bloco "Esqueletos" da rodada de arquitetura (Kira cola no briefing), src/services/firestore-base.service.ts, src/models/sell-model.ts
CRITERIO DE ACEITE: (1) `npx tsc --noEmit -p tsconfig.app.json` sem erro novo; (2) os 5 arquivos .ts de service/lib existem com as assinaturas idênticas às do esqueleto; (3) nenhuma lógica real (todos os corpos lançam 'not implemented'), exceto `defaultCategoryId` e as constantes de dados.
ARQUIVOS PERMITIDOS: src/models/expense-model.ts, src/models/expense-category-defaults.ts, src/services/expense-schedule-service/expense-schedule-service.ts, src/services/expense-report-service/expense-report-service.ts, src/services/expense-service/expense-service.ts, src/services/expense-category-service/expense-category-service.ts, src/services/expense-recurrence-service/expense-recurrence-service.ts, scripts/lib/expense-migration-core.mjs
NAO FAZER: não implementar lógica; não alterar assinatura; não tocar em bills/purchase-product; não editar .claude/tasks.md.
RETORNO ESPERADO: lista de arquivos criados + saída do tsc.
HISTORICO: 2026-10-22 — Kira criou os 8 arquivos de esqueleto exatamente como entregues pelo killua (acao estrutural, Secao 5 passo 2). Validacao de tipos registrada no chat.

## TASK-075 — [TDD RED] ExpenseScheduleService + ExpenseReportService (funções puras)
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-074
ESCOPO: escrever os testes (Karma/Jasmine, lógica pura sem emulador) das duas classes estáticas e confirmar RED por lógica ausente.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §7.1-7.4 e §8), src/services/expense-schedule-service/expense-schedule-service.ts, src/services/expense-report-service/expense-report-service.ts, src/models/expense-model.ts, src/models/expense-category-defaults.ts, src/services/bill-recurrence-service/bill-recurrence-service.spec.ts (describe de lógica pura como referência de estilo)
CRITERIO DE ACEITE: (1) Schedule: split 100/3 = [33.33,33.33,33.34]; soma exata para totais com centavos quebrados (ex.: 0,10/3; 99,99/7; 1000/12), N=1, N=120, N=0/121/1.5 e total<=0 lançam; datas de parcela 31/jan -> 28/fev -> 31/mar, ano bissexto (29/fev), virada de ano; occurrenceDates mensal dia 31 e semanal, com generatedThrough null e preenchido, upTo no fim do mês, upTo < âncora -> []; toDateKey estável independente do fuso da máquina (datas 23:30 e 00:30 de São Paulo); (2) Report: groupForMonth — cards e listas derivam do mesmo agrupamento (total do card = soma da lista), vencida de mês anterior aparece em `vencidas`, a vencer só do mês e >= hoje, paga por paidDate; isOverdue no limite (dueDate == hoje não é vencida); sumOperacionalPorVencimento ignora custo_producao e conta pago e a_pagar, limites inclusivos start/end; categoria órfã = operacional; breakdown por categoria; monthlyTotals com 12 buckets e zeros; calcResultado = fat − cmv − operacionais com soma em centavos (sem 0.1+0.2); (3) execução mostra RED por 'not implemented' (não por erro de compilação).
ARQUIVOS PERMITIDOS: src/services/expense-schedule-service/expense-schedule-service.spec.ts, src/services/expense-report-service/expense-report-service.spec.ts
NAO FAZER: não editar os services; não escrever teste que dependa de Firestore; não editar .claude/tasks.md.
RETORNO ESPERADO: lista de testes + saída do runner confirmando RED válido + comando de execução (`npx ng test --include='**/expense-*-service.spec.ts' --browsers=ChromeHeadless --watch=false`).
HISTORICO: 2026-10-22 — mike: 33+35 testes (schedule/report), RED 68/68 por not implemented; helper exige mensagem != not implemented nos casos de lancamento. Rodada de correcao pos-style: +13 testes applyFilters e +1 orfa "Sem categoria". Spec do report fechou com 48 its, schedule 34 (contagem real do runner). Prettier aplicado pelo Kira.


## TASK-076 — Implementar ExpenseScheduleService
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-075
ESCOPO: implementar todos os métodos de ExpenseScheduleService até os testes da TASK-075 ficarem GREEN (aritmética em centavos inteiros; datas via componentes Y/M/D, nunca Date local sem fuso).
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §7.2, §7.3), src/services/expense-schedule-service/expense-schedule-service.ts, src/services/expense-schedule-service/expense-schedule-service.spec.ts (somente leitura), src/models/expense-model.ts, .claude/context/clean-code.md
CRITERIO DE ACEITE: (1) todos os testes de expense-schedule-service.spec.ts passam; (2) nenhuma dependência de Angular/Firestore no arquivo; (3) nenhum `new Date()` implícito de "hoje" dentro dos métodos (entrada explícita).
ARQUIVOS PERMITIDOS: src/services/expense-schedule-service/expense-schedule-service.ts
NAO FAZER: não alterar o spec nem assinaturas; não tocar em outros arquivos; não editar .claude/tasks.md.
RETORNO ESPERADO: arquivo implementado + saída do runner (GREEN do spec desta classe).
HISTORICO: 2026-10-22 — levi: GREEN 34/34. style APROVADO com ressalvas; Kira mandou fechar: assertTotalValid (Number.isFinite — NaN gerava parcelas NaN), assertDateKeyValid em anchor/upTo/generatedThrough (evita laco infinito com dado ruim do Firestore), mensagens de erro em portugues acentuado. 2a revisao style: APROVADO.


## TASK-077 — Implementar ExpenseReportService
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-075
ESCOPO: implementar todos os métodos de ExpenseReportService até os testes da TASK-075 ficarem GREEN (um único agrupamento alimenta cards e listas; somas em centavos).
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §7.4, §8.2), src/services/expense-report-service/expense-report-service.ts, src/services/expense-report-service/expense-report-service.spec.ts (somente leitura), src/models/expense-model.ts, .claude/context/clean-code.md
CRITERIO DE ACEITE: (1) todos os testes de expense-report-service.spec.ts passam; (2) sem dependência de Angular/Firestore; (3) nenhum critério de data duplicado: `groupForMonth` é usado pelos totals.
ARQUIVOS PERMITIDOS: src/services/expense-report-service/expense-report-service.ts
NAO FAZER: não alterar o spec nem assinaturas; não editar .claude/tasks.md.
RETORNO ESPERADO: arquivo implementado + saída do runner.
HISTORICO: 2026-10-22 — levi: GREEN 34/34 inicial. style PRECISA CORRIGIR (1 rodada): prettier, orfa exibia categoryId cru -> SEM_CATEGORIA_LABEL, helpers de data duplicados -> reuso de ExpenseScheduleService, comentario enganoso, find duplicado/copia quadratica -> Map. applyFilters sem teste -> mike cobriu. Final 48/48; 2a revisao style: APROVADO.


## TASK-078 — [TDD GREEN] Confirmar ExpenseScheduleService + ExpenseReportService
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-076, TASK-077
ESCOPO: rodar os dois specs puros (sem reescrever) e confirmar GREEN ou devolver relatório de bug.
FLUXO: Implementacao
CONTEXTO A LER: src/services/expense-schedule-service/expense-schedule-service.spec.ts, src/services/expense-report-service/expense-report-service.spec.ts
CRITERIO DE ACEITE: (1) 100% dos testes das duas classes passam; (2) suíte Karma completa sem regressão vs. contagem anterior (reportar nº exato antes/depois); (3) em caso de falha, relatório com teste, esperado vs. obtido e suspeita.
ARQUIVOS PERMITIDOS: nenhum (somente execução)
NAO FAZER: não editar specs nem código; não editar .claude/tasks.md.
RETORNO ESPERADO: contagem exata de SUCCESS/FAILED e veredito GREEN ou relatório de bug.
HISTORICO: 2026-10-22 — mike: GREEN 68/68 (schedule+report). Criterio (2) suite completa adiado para TASK-085 (emulador ocupado pela TASK-086). Pos-correcao: 82/82 confirmado pelo style.


## TASK-079 — [TDD RED] ExpenseService + ExpenseCategoryService (emulador, isolamento)
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-078
ESCOPO: escrever specs de integração (Firestore/Auth Emulator, helpers existentes) dos dois services e confirmar RED por lógica ausente.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §7.1, §7.2, §8.1, §10), src/services/expense-service/expense-service.ts, src/services/expense-category-service/expense-category-service.ts, src/models/expense-model.ts, src/models/expense-category-defaults.ts, src/services/test-helpers.ts, src/services/bill-service/bill-service.spec.ts (padrão de isolamento com 2 usuários)
CRITERIO DE ACEITE: (1) ExpenseService: getExpenses só retorna da empresa da sessão (segundo usuário/empresa seeda dado estrangeiro); addExpense injeta companyId, status 'a_pagar', origin 'manual'; todas as escritas lançam com companyId nulo; addInstallments grava N docs com soma exata, vencimentos corretos, mesmo installmentGroupId, atomicamente; markAsPaid grava paidDate/paymentMethod e lança se já pago; markGoodsReceived; (2) ExpenseCategoryService: ensureDefaults cria 12 com ids `${companyId}_${systemKey}`, tipos corretos (2 custo_producao, 10 operacionais) e é idempotente (2 chamadas = 12 docs, sem sobrescrever uma categoria renomeada); addCategory exige type; renameCategory não altera type (lança se tentar); deleteCategory lança com expense OU série vinculada e funciona sem vínculo; setArchived; isolamento entre empresas; (3) RED por 'not implemented' (não por PERMISSION_DENIED de fixture nem erro de compilação; ids de fixture únicos — lição da TASK-032).
ARQUIVOS PERMITIDOS: src/services/expense-service/expense-service.spec.ts, src/services/expense-category-service/expense-category-service.spec.ts
NAO FAZER: não editar services nem test-helpers; não usar IDs fixos de documento; não editar .claude/tasks.md.
RETORNO ESPERADO: lista de testes + saída RED + comando (emuladores Firestore+Auth no ar).
HISTORICO: 2026-10-22 — mike: 41 testes RED (isolamento, companyId nulo, parcelamento, markAsPaid, ensureDefaults, deleteCategory). Corrigiu 6 falsos positivos (toBeRejected aceitava not implemented -> expectRejeicaoDeRegra). Licao: rules negam getDoc E query por documentId() de doc inexistente -> prova de exclusao por listagem da empresa. Rodadas de correcao pos-style/gon: +3 (patch protegido, seed unico), +22 (validacao de entrada, input sujo, categoria da empresa), +8 (goodsReceivedDate, valor < 1 centavo). Setup passou a usar categoria real da empresa. Final 76 testes.


## TASK-080 — Implementar ExpenseService + ExpenseCategoryService
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-079
ESCOPO: implementar os dois services até os specs da TASK-079 ficarem GREEN (padrão BillService/TenantService; `runTransaction` em markAsPaid; batch em addInstallments).
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §7.1, §7.2, §8.1, §10), src/services/expense-service/expense-service.ts, src/services/expense-category-service/expense-category-service.ts, os dois .spec.ts (somente leitura), src/services/bill-service/bill-service.ts (padrão), src/services/tenant-service/tenant-service.ts, src/services/expense-schedule-service/expense-schedule-service.ts, src/models/expense-model.ts, src/models/expense-category-defaults.ts, .claude/context/clean-code.md
CRITERIO DE ACEITE: (1) specs das TASK-079 passam; (2) `getExpenses` filtra por companyId e ordena por dueDate desc; (3) nenhuma escrita sem guarda de companyId; valores numéricos normalizados com Number(...).
ARQUIVOS PERMITIDOS: src/services/expense-service/expense-service.ts, src/services/expense-category-service/expense-category-service.ts
NAO FAZER: não alterar specs; não alterar firestore.rules (TASK-082); não editar .claude/tasks.md.
RETORNO ESPERADO: arquivos implementados + saída do runner. Gate: style + gon (isolamento).
HISTORICO: 2026-10-22 — levi: ExpenseService + ExpenseCategoryService. style 4 rodadas, gon 2 rodadas. Achados e decisoes: (1) updateExpense gravava status/paidDate em runtime -> CAMPOS_GERENCIADOS_PELO_SERVICE (inclui proveniencia) filtrado em create e update; (2) ensureDefaults ressuscitava padrao excluida -> SEED UNICO (decisao do Kira: so cria as 12 se a empresa nao tem nenhuma categoria); (3) gon: valor/data sem validacao nos caminhos simples, input sujo na criacao, categoryId de outra empresa -> modulo novo src/services/expense-validation (assertExpenseValue >= 1 centavo, assertDateKey com ano 2000..2100, assertRecurrencePeriod, stripUndefined, omitFields); categoria validada (existe, da empresa, nao arquivada na criacao; no update so quando muda); permission-denied -> "Categoria inválida para esta empresa." (sem oraculo de existencia); (4) goodsReceivedDate validado nos 3 caminhos. migracaoRevisar/migracaoMotivo editaveis por design. Convencao reforcada: comentario sem acento (briefing do Kira errou uma vez). Aceitos/registrados: corrida minima no seed; checagem de vinculo de deleteCategory fora de transacao; valor com >2 casas gravado cru; sem teto maximo de valor; duplicacao de helpers de categoria com recurrence -> task de Melhoria. Runner final 110/110 (76 + schedule 34).


## TASK-081 — [TDD RED] firestore.rules para expenses/expenseCategories/expenseSeries
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-074
ESCOPO: estender test/firestore.rules.spec.ts cobrindo as 3 coleções novas (isolamento por companyId, super-admin, update sem trocar companyId, anônimo negado) e confirmar RED.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §10, §13), test/firestore.rules.spec.ts, firestore.rules
CRITERIO DE ACEITE: (1) para cada uma das 3 coleções: leitura/criação/atualização/exclusão da própria empresa permitidas; de outra empresa negadas; sem auth negadas; update que troca companyId negado; super-admin com bypass igual às demais coleções operacionais; (2) as listas de coleções operacionais existentes (linhas ~284 e ~310) ganham as 3 novas e MANTÊM bills/purchaseProducts; (3) RED porque as rules atuais ainda não conhecem as coleções (falha de permissão), com `npm run test:rules` mostrando só os novos casos falhando.
ARQUIVOS PERMITIDOS: test/firestore.rules.spec.ts
NAO FAZER: não editar firestore.rules; não remover casos existentes; não editar .claude/tasks.md.
RETORNO ESPERADO: casos adicionados + saída de `npm run test:rules` com RED válido.
HISTORICO: 2026-10-22 — mike: 42 casos novos (14 x 3 colecoes) + 3 colecoes nas 2 listas existentes do spec. RED: 15 falhas/99 por PERMISSION_DENIED. Casos negativos passavam pelo motivo errado ate a TASK-082.


## TASK-082 — firestore.rules e índices das coleções de Despesas
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-081
ESCOPO: adicionar 'expenses', 'expenseCategories', 'expenseSeries' em isOperationalCollection e o índice composto de expenses (companyId ASC, dueDate DESC) em firestore.indexes.json, mantendo bills e purchaseProducts.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §10, §12), firestore.rules, firestore.indexes.json, test/firestore.rules.spec.ts (somente leitura)
CRITERIO DE ACEITE: (1) `npm run test:rules` 100% GREEN (casos novos e antigos); (2) firestore.indexes.json contém o novo índice e continua com os 3 anteriores; (3) nenhuma outra regra alterada (diff só na lista e no JSON).
ARQUIVOS PERMITIDOS: firestore.rules, firestore.indexes.json
NAO FAZER: não executar deploy; não remover bills/purchaseProducts; não editar o spec; não editar .claude/tasks.md.
RETORNO ESPERADO: diff + saída do test:rules. Gate: style + gon (autorização).
HISTORICO: 2026-10-22 — levi: 3 colecoes em isOperationalCollection (firestore.rules:26) + indice expenses(companyId ASC, dueDate DESC). test:rules 99/99. style APROVADO. gon APROVADO; achado baixo registrado como melhoria futura: squatting de id deterministico de categoria padrao (`${companyId}_${systemKey}`) por outro tenant que conheca o companyId — blindagem possivel exigindo docId com prefixo companyId_ na criacao de expenseCategories. Informativo: sem checagem de papel nas colecoes de despesas (igual as demais operacionais).


## TASK-083 — [TDD RED] ExpenseRecurrenceService (catch-up idempotente)
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-080, TASK-082
ESCOPO: escrever specs de integração do ExpenseRecurrenceService e confirmar RED.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §7.3), src/services/expense-recurrence-service/expense-recurrence-service.ts, src/services/expense-schedule-service/expense-schedule-service.ts, src/models/expense-model.ts, src/services/test-helpers.ts, src/services/bill-recurrence-service/bill-recurrence-service.spec.ts (padrão), firestore.rules
CRITERIO DE ACEITE: (1) catch-up gera TODAS as ocorrências perdidas até o fim do mês corrente (mensal: âncora dia 31 -> dias 30/28/31 corretos; semanal: +7k dias); (2) rodar duas vezes seguidas e duas chamadas concorrentes (Promise.all) não duplicam (contagem de docs = esperado) e avançam generatedThrough; (3) ocorrência apagada pelo usuário não é recriada; (4) série `active=false` não gera; endSeries mantém ocorrências já geradas; (5) createSeries grava série + 1ª ocorrência com id `${seriesId}_${dueDate}`; (6) isolamento: série de outra empresa nunca é processada; companyId vazio lança; (7) RED por 'not implemented'; fixtures com ids únicos.
ARQUIVOS PERMITIDOS: src/services/expense-recurrence-service/expense-recurrence-service.spec.ts
NAO FAZER: não editar o service; não editar test-helpers; não editar .claude/tasks.md.
RETORNO ESPERADO: lista de testes + saída RED.
HISTORICO: 2026-10-22 — mike: 17 testes RED iniciais; rodadas pos-style/gon: +13 (endSeries ownership/encerrada, lote >399, getSeries, validacao de createSeries, serie envenenada), +limites (ancora 24 meses, faixa de ano, teto 399/chamada, template sujo, companyId alheio), +6 (today invalido, anchorDate corrompido). Fixtures passaram a usar categoria real da empresa e HOJE_REFERENCIA fixo (eliminada bomba-relogio de 2028). Final 46 testes.


## TASK-084 — Implementar ExpenseRecurrenceService
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-083
ESCOPO: implementar o service até GREEN: catch-up em runTransaction sobre o doc da série, geração em lotes de no máximo 400 escritas por transação, ids determinísticos.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §7.3, §10), src/services/expense-recurrence-service/expense-recurrence-service.ts, src/services/expense-recurrence-service/expense-recurrence-service.spec.ts (somente leitura), src/services/expense-schedule-service/expense-schedule-service.ts, src/services/tenant-service/tenant-service.ts, src/models/expense-model.ts, .claude/context/clean-code.md
CRITERIO DE ACEITE: (1) specs da TASK-083 passam; (2) leitura de séries sempre com where companyId + active; (3) nenhuma geração fora de transação; falhas sobem (throw), sem engolir erro.
ARQUIVOS PERMITIDOS: src/services/expense-recurrence-service/expense-recurrence-service.ts
NAO FAZER: não alterar o spec; não usar Cloud Functions; não editar .claude/tasks.md.
RETORNO ESPERADO: arquivo implementado + saída do runner. Gate: style + gon.
HISTORICO: 2026-10-22 — levi: ExpenseRecurrenceService. style 4 rodadas, gon 2 rodadas. R1 style: endSeries sem ownership (CRITICA §10), serie ruim derrubava as demais -> decisao do Kira: processa todas, acumula falhas e relanca erro agregado. createSeries sem validacao -> reusa expense-validation. R1 gon (ALTA): ancora arbitrariamente antiga gerava ~100k docs por carregamento -> Kira decidiu limites e registrou em regra §7.3 "Limites" (ano 2000..2100, ancora <= 24 meses, 1 lote de 399 por serie por chamada, revalidacao do template, companyId so da sessao). R3 style: today obrigatorio e validado, anchorDate corrompido -> mensagem de dominio. Aceitos: today do catch-up vem do chamador (UI deve usar relogio local); texto livre sem limite (padrao do projeto); escrita de expenseSeries por qualquer papel da empresa (decisao de produto). Divida -> TASK-102.


## TASK-085 — [TDD GREEN] Services, recurrence e rules de Despesas
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-080, TASK-082, TASK-084
ESCOPO: rodar (sem reescrever) os specs das TASK-079/043/045 e a suíte completa; confirmar GREEN ou devolver relatório de bug.
FLUXO: Implementacao
CONTEXTO A LER: src/services/expense-service/expense-service.spec.ts, src/services/expense-category-service/expense-category-service.spec.ts, src/services/expense-recurrence-service/expense-recurrence-service.spec.ts, test/firestore.rules.spec.ts
CRITERIO DE ACEITE: (1) os três specs de service e `npm run test:rules` em GREEN; (2) suíte Karma completa dentro de `firebase emulators:exec` sem regressão (reportar contagem exata; a falha pré-existente AppComponent/SwUpdate, se ainda existir, é reportada à parte); (3) relatório de bug se houver falha.
ARQUIVOS PERMITIDOS: nenhum (somente execução)
NAO FAZER: não editar specs nem código; não editar .claude/tasks.md.
RETORNO ESPERADO: contagem exata e veredito.
HISTORICO: 2026-10-22 — Verificacao consolidada na rodada final da TASK-099 (levi, sem reescrever specs): suite Karma completa no emulador 408/408 SUCCESS (era 428 antes da remocao dos specs legados), test:rules 99/99, test:migration 68/68, ng build producao ok. Sem falha AppComponent/SwUpdate. Specs de expense/category (76) e recurrence (46) inclusos.


## TASK-086 — [TDD RED] Núcleo e script da migração bills/purchaseProducts -> expenses
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-074
ESCOPO: escrever os testes node:test do núcleo puro e um teste de integração do script contra o Firestore Emulator (Admin SDK), confirmando RED.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §7, §8.1, §14), scripts/lib/expense-migration-core.mjs, src/models/expense-model.ts, src/models/expense-category-defaults.ts, scripts/seed-demo.mjs (formato real dos bills legados), scripts/backfill-companyid.mjs (padrão Admin SDK/dry-run/--apply)
CRITERIO DE ACEITE: (1) status: pendente->a_pagar; recebido->a_pagar+goodsReceivedDate; pago->pago+paidDate (+goodsReceivedDate se receivedAt); (2) D3: sem dueDate usa paidAt/receivedAt/createdAt e marca migracaoRevisar; datas em America/Sao_Paulo (Timestamp 02:30Z do dia seguinte cai no dia anterior em SP); (3) categoria pela precedência da §14: "Compra: X" -> Compra de mercadoria; bill com purchaseProductId usa nome do produto; "Aluguel do ponto" -> Aluguel; "Conta de energia" -> Energia/Água/Gás; "Taxa da maquininha" -> Taxas de cartão; sem casamento -> Outros + revisar; recebido sem casamento -> Compra de mercadoria + revisar; (4) purchaseProduct recurring -> série `mig_pp_<id>` com period traduzido, anchorDate = menor dueDate, generatedThrough = maior dueDate dos bills ligados, e os bills ligados recebem seriesId; recurring=false -> sem série; bill recorrente manual -> despesa simples + revisar; (5) idempotência: planMigration com existingIds preenchido pula tudo e reporta `skipped`; script no emulador: 2ª execução cria 0 docs e não sobrescreve doc editado; (6) dry-run padrão não escreve; `--rollback` apaga só origin=='migracao'/mig_pp_*; legado nunca é alterado; (7) script recusa projeto != hologaerp e bill sem companyId é ignorado e reportado; (8) paridade: DEFAULT_CATEGORY_DEFS do core == DEFAULT_EXPENSE_CATEGORIES do app (comparação textual do .ts); (9) RED por 'not implemented'/script ausente.
ARQUIVOS PERMITIDOS: test/expense-migration-core.test.mjs, test/migrate-bills-to-expenses.emulator.test.mjs, package.json (somente adicionar scripts `test:migration` e `test:migration:emulator`)
NAO FAZER: não editar scripts/ nem src/; não rodar contra projeto real; não editar .claude/tasks.md.
RETORNO ESPERADO: lista de testes + saída RED + comandos de execução.
HISTORICO: 2026-10-22 — mike: test/expense-migration-core.test.mjs (53 testes; RED 52 por not implemented, 1 de paridade de categorias passa por construcao — guarda de regressao) + test/migrate-bills-to-expenses.emulator.test.mjs (7; RED por script ausente) + scripts npm test:migration/test:migration:emulator. Contrato de report nao estava no esqueleto: Kira fixou formato no briefing da TASK-087 (byStatus, byCategory, revisar, skipped, created + ids ignorados no stdout).


## TASK-087 — Implementar núcleo e script de migração (hml only)
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-086
ESCOPO: implementar scripts/lib/expense-migration-core.mjs e criar scripts/migrate-bills-to-expenses.mjs (Admin SDK; dry-run padrão; --apply; --rollback; --company=<id> opcional; recusa projeto != hologaerp; suporta FIRESTORE_EMULATOR_HOST) até os testes da TASK-086 ficarem GREEN.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §14), scripts/lib/expense-migration-core.mjs, test/expense-migration-core.test.mjs e test/migrate-bills-to-expenses.emulator.test.mjs (somente leitura), scripts/backfill-companyid.mjs (padrão), src/models/expense-model.ts, .claude/context/clean-code.md
CRITERIO DE ACEITE: (1) `npm run test:migration` e `npm run test:migration:emulator` GREEN; (2) ids determinísticos com `create()` (ALREADY_EXISTS = pulado, nunca sobrescreve); (3) relatório final com contagens (por status, por categoria, migracaoRevisar, pulados, sem companyId); (4) o script não altera nem apaga bills/purchaseProducts e o cabeçalho documenta uso, pré-requisitos e rollback.
ARQUIVOS PERMITIDOS: scripts/lib/expense-migration-core.mjs, scripts/migrate-bills-to-expenses.mjs, package.json (somente scripts npm `migrate:expenses:hml`)
NAO FAZER: não habilitar produção (projetosfelipe-9e458); não alterar os testes; não rodar contra projeto real; não editar .claude/tasks.md.
RETORNO ESPERADO: arquivos + saída dos dois runners. Gate: style + gon (script que escreve dado de cliente).
HISTORICO: 2026-10-22 — levi: core + script (Admin SDK, dry-run padrao, --apply, --rollback, --company, guard hologaerp antes do initializeApp; projectId fixo). style: 3 rodadas. R1 PRECISA CORRIGIR: serie aplicava regras de bill ("Compra:" e receivedAt) na categoria; bill sem data abortava o run inteiro; "cartao" isolado capturava "Fatura cartao de credito"; constantes duplicadas entre core e script; project_id da service account nao validado. Kira decidiu tambem: rollback apaga ocorrencias geradas de series mig_pp_*. mike escreveu RED (+12 core, +2 emulador) antes da correcao. R2: serie sem bills e sem defaultValue gravava template.value NaN (mike +2 RED) + sentinela U+F8FF cru -> escape. R3 APROVADO. Decisao registrada: palavras-chave genericas compra/compras removidas de matchCategoryKey (falso positivo em series); bills livres "compra fornecedor X" sem prefixo caem em Outros+revisar (ou compra_mercadoria+revisar se receivedAt) — aceito pela §14. report.skipped numerico + skippedByKind (teste prevaleceu sobre o briefing do Kira); report.unmigratable {kind,id,motivo}. gon APROVADO; obs baixas: companyId legado nao validado como id seguro (defesa em profundidade), rollback apaga despesas migradas mesmo editadas/pagas depois (documentado no cabecalho; decisao de produto), FIRESTORE_EMULATOR_HOST nao restrito a loopback.


## TASK-088 — [TDD GREEN] Confirmar migração
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-087
ESCOPO: rodar (sem reescrever) os testes de migração e o emulador; confirmar GREEN ou relatório de bug.
FLUXO: Implementacao
CONTEXTO A LER: test/expense-migration-core.test.mjs, test/migrate-bills-to-expenses.emulator.test.mjs
CRITERIO DE ACEITE: (1) ambos GREEN; (2) 2ª execução do script no emulador cria 0 docs e `--rollback` deixa bills/purchaseProducts intactos (conferência de contagem); (3) relatório de bug se falhar.
ARQUIVOS PERMITIDOS: nenhum (somente execução)
NAO FAZER: não editar testes nem código; não editar .claude/tasks.md.
RETORNO ESPERADO: contagens e veredito.
HISTORICO: 2026-10-22 — mike: GREEN core 53/53 + emulador 7/7 na 1a rodada; apos as correcoes do style o executor/mike confirmaram core 68/68 e emulador 9/9 (2a execucao cria 0 docs, rollback restrito, legado intacto).


## TASK-089 — [MANUAL / USUARIO] Deploy de rules+índices e migração em homolog (hologaerp)
STATUS: PENDENTE
AGENT: usuario (manual; Kira apenas orienta, não executa)
DEPENDENCIAS: TASK-085, TASK-088
ESCOPO: publicar rules/índices no hml, rodar a migração em dry-run, conferir o relatório e só então aplicar com --apply.
FLUXO: Implementacao
CONTEXTO A LER: scripts/migrate-bills-to-expenses.mjs (cabeçalho), firestore.rules, firestore.indexes.json, .claude/context/regra-de-negocio.md (inteiro; §14)
CRITERIO DE ACEITE: (1) `npm run deploy:rules:staging` concluído e índice de expenses com status "Enabled" no console; (2) dry-run revisado (contagens por status/categoria, lista de migracaoRevisar); (3) `--apply` rodado; 2ª execução reporta 0 criados; amostra de 5 bills conferida no console contra os expenses gerados.
ARQUIVOS PERMITIDOS: nenhum (operação manual em hml)
NAO FAZER: nada em produção (projetosfelipe-9e458); não apagar bills/purchaseProducts.
RETORNO ESPERADO: o usuário confirma no chat + cola o relatório do script.
HISTORICO:

## TASK-090 — Componente ExpenseForm (única / parcelada / recorrente)
STATUS: CONCLUIDA
AGENT: hanzo
DEPENDENCIAS: TASK-078
ESCOPO: criar componente standalone `expense-form` (template-driven, ngModel) para criar/editar despesa com modo único, parcelado (N, preview das parcelas via ExpenseScheduleService.buildInstallments) e recorrente (semanal/mensal), emitindo o payload por @Output.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §7.1-7.3, §8.1), .claude/context/identidade-visual.md, .claude/context/clean-code.md, src/models/expense-model.ts, src/services/expense-schedule-service/expense-schedule-service.ts, src/components/bills/bills.html, src/components/bills/bills.css
CRITERIO DE ACEITE: (1) campos: descrição, valor, categoria (só não arquivadas), vencimento obrigatório, fornecedor, forma de pagamento, observação, "mercadoria recebida em"; validação early-return com notif.warning; (2) modo parcelado mostra preview "N x R$" com a soma exata e datas; modo recorrente mostra aviso se a âncora for > 24 meses no passado; parcelado e recorrente são excludentes; (3) usa tokens/variáveis CSS da identidade visual (dark/light) e tem layout mobile (`expense-form-mobile.css`).
ARQUIVOS PERMITIDOS: src/components/expense-form/expense-form.ts, src/components/expense-form/expense-form.html, src/components/expense-form/expense-form.css, src/components/expense-form/expense-form-mobile.css
NAO FAZER: não chamar Firestore/services de escrita (só emite evento); não calcular parcela fora do ExpenseScheduleService; não editar outros arquivos; não editar .claude/tasks.md.
RETORNO ESPERADO: arquivos + contrato de @Input/@Output + `ng build` sem erro.
HISTORICO: 2026-10-22 — hanzo: ExpenseFormComponent (unica/parcelada/recorrente; preview via buildInstallments; aviso ancora > 24 meses). style PRECISA CORRIGIR (1 rodada): ngOnChanges sobrescrevia digitacao quando categories reemitia e nao resetava em expense=null (MEDIA); getter de preview recalculado 5x/ciclo; "24 meses" hardcoded; outputs com nome nativo -> saved/cancelled. 2a revisao: APROVADO. Obs: aviso de ancora usa fuso America/Sao_Paulo (toDateKey) e a §7.1 fala em "data local do navegador" — divergencia so de texto, cliente opera no Brasil.


## TASK-091 — Componente ExpenseCategoryManager
STATUS: CONCLUIDA
AGENT: hanzo
DEPENDENCIAS: TASK-080
ESCOPO: criar componente standalone `expense-category-manager` para listar categorias com tag de tipo, criar nova (nome + escolha obrigatória do tipo), renomear, arquivar/desarquivar e excluir (só se sem vínculo; erro do service vira notif.warning clara).
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §8.1), .claude/context/identidade-visual.md, .claude/context/clean-code.md, src/services/expense-category-service/expense-category-service.ts, src/models/expense-model.ts
CRITERIO DE ACEITE: (1) tipo só escolhido na criação e exibido (somente leitura) depois; (2) categoria com vínculo mostra só "Arquivar" (sem "Excluir"), com texto explicando o porquê; (3) chama ensureDefaults ao abrir; mobile ok.
ARQUIVOS PERMITIDOS: src/components/expense-category-manager/expense-category-manager.ts, src/components/expense-category-manager/expense-category-manager.html, src/components/expense-category-manager/expense-category-manager.css
NAO FAZER: não alterar o service; não editar outros arquivos; não editar .claude/tasks.md.
RETORNO ESPERADO: arquivos + `ng build` sem erro.
HISTORICO: 2026-10-22 — hanzo: ExpenseCategoryManagerComponent (@Input categoryIdsInUse: ReadonlySet<string> calculado pelo pai; @Output closed; exporta EXPENSE_CATEGORY_TYPE_LABELS). style PRECISA CORRIGIR (1 rodada): corrida — criar categoria antes do seed terminar impedia o seed unico para sempre -> form travado ate ensureDefaults + 1o snapshot; window confirm() -> modal padrao do projeto com CSS local (bills sera apagado na 061). 2a revisao APROVADO. Obs nao bloqueante: erro no stream getCategories deixa o form travado (tratar com error: no subscribe numa task futura). Mobile via @media no proprio .css (restricao de arquivos).


## TASK-092 — Tela Despesas (/contas): mês, cards, grupos, ações e filtros
STATUS: CONCLUIDA
AGENT: hanzo
DEPENDENCIAS: TASK-078, TASK-080, TASK-084, TASK-090, TASK-091
ESCOPO: criar `ExpensesComponent` substituindo BillsComponent na rota /contas (título "Despesas"): navegação ◀ mês ▶, cards Vencidas / A pagar no mês / Pago no mês, lista agrupada Vencidas / A vencer / Pagas, botões "Paguei" e "Chegou", filtros, form/categorias via componentes filhos, catch-up de recorrência no ngOnInit, e ajustes de rótulo no menu.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §7, §8.1), .claude/context/identidade-visual.md, .claude/context/clean-code.md, src/components/bills/bills.ts, src/components/bills/bills.html, src/components/bills/bills.css, src/components/expense-form/expense-form.ts, src/components/expense-category-manager/expense-category-manager.ts, src/services/expense-service/expense-service.ts, src/services/expense-report-service/expense-report-service.ts, src/services/expense-recurrence-service/expense-recurrence-service.ts, src/services/expense-category-service/expense-category-service.ts, src/app/app.routes.ts, src/components/home/home.html
CRITERIO DE ACEITE: (1) cards e grupos vêm exclusivamente de ExpenseReportService.groupForMonth (nenhuma soma/critério de data inline no componente); cards ignoram filtros, lista aplica ExpenseReportService.applyFilters (categoria, status, "a pagar e já recebida", "revisar migração"); (2) "Paguei" abre confirmação com data (default hoje) e forma de pagamento opcional; "Chegou" aparece só para categoria custo_producao sem goodsReceivedDate; encerrar recorrência disponível em despesa de série; excluir com modal; (3) rota /contas aponta para ExpensesComponent com o mesmo guard/data.module 'contas'; título e card do menu da home dizem "Despesas"; hoje = ExpenseScheduleService.toDateKey(new Date()); erros de escrita em try/catch com notif; (4) layout mobile (`expenses-mobile.css`) com cards empilhados e botões acessíveis.
ARQUIVOS PERMITIDOS: src/components/expenses/expenses.ts, src/components/expenses/expenses.html, src/components/expenses/expenses.css, src/components/expenses/expenses-mobile.css, src/app/app.routes.ts, src/components/home/home.html
NAO FAZER: não apagar o BillsComponent (TASK-099); não calcular totais/datas inline; não mexer em product-inventory; não editar .claude/tasks.md.
RETORNO ESPERADO: arquivos + `ng build` sem erro + descrição do fluxo. Gate: style.
HISTORICO: 2026-10-22 — hanzo: ExpensesComponent em /contas (mesmo guard e data.module contas; home "DESPESAS"); navegacao por mes; cards e grupos so via groupForMonth, lista via applyFilters; Paguei (modal, data default hoje), Chegou (so custo_producao), Encerrar recorrencia e Excluir com modal; botao Editar (adicao do executor, aceita: §7.4 lista editar); ensureDefaults antes de liberar Nova Despesa; catch-up no init. style PRECISA CORRIGIR (1 rodada): 44px nos botoes restantes no mobile, subscription criada apos await, categoriasProntas liberado com seed falho, literal Sem categoria duplicado, edicao sem id caindo em criacao. 2a revisao APROVADO; Kira adicionou .btn-voltar aos 44px inline. Aceito: "hoje" fixo com a pagina aberta. gon nao se aplica. BillsComponent segue no repo ate a TASK-099.


## TASK-093 — [TDD RED] Balanço: gastosPeriodo/resultadoFinal por despesas (competência)
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-078, TASK-080
ESCOPO: ampliar product-inventory.spec.ts com testes dos getters de Balanço/Despesas do ProductInventory (mocks de ExpenseService/ExpenseCategoryService/ExpenseRecurrenceService) e confirmar RED contra a implementação atual (baseada em bills).
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §8), src/components/product-inventory/product-inventory.spec.ts, src/components/product-inventory/product-inventory.ts (linhas ~515-560, somente leitura), src/services/expense-report-service/expense-report-service.ts, src/models/expense-model.ts
CRITERIO DE ACEITE: contrato de membros do componente a testar — `despesas`, `categoriasDespesa`, `get gastosPeriodo()` (soma operacional por dueDate no período), `get custoProducaoPeriodo()`, `get gastosPorCategoria()`, `get resultadoFinal()` = faturamento − custoTotal − gastosPeriodo; casos: despesa operacional a_pagar conta; despesa paga fora do período por dueDate NÃO conta mesmo paga dentro; custo_producao não entra no Resultado nem no Gastos mas aparece em `custoProducaoPeriodo`; (2) o spec existente continua compilando com os providers novos; (3) RED por comportamento (getters ainda leem bills).
ARQUIVOS PERMITIDOS: src/components/product-inventory/product-inventory.spec.ts
NAO FAZER: não editar o componente; não remover provider de BillService/PurchaseProductService ainda; não editar .claude/tasks.md.
RETORNO ESPERADO: testes + saída RED.
HISTORICO: 2026-10-22 — mike: 12 testes RED em product-inventory.spec.ts (sem emulador): gastosPeriodo por dueDate em qualquer status, limites inclusivos, custo_producao fora, orfa operacional, centavos; custoProducaoPeriodo; resultadoFinal; gastosPorCategoria. Semeou bill pago de 999 no periodo para o RED ser honesto. Mocks de ExpenseService/Category/Recurrence adicionados; BillService/PurchaseProductService mantidos.


## TASK-094 — product-inventory.ts: lógica de Despesas/Balanço e remoção da aba Compras
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-093
ESCOPO: no product-inventory.ts, trocar bills/purchaseProducts por despesas: assinar ExpenseService/ExpenseCategoryService, chamar o catch-up de recorrência, implementar os getters do contrato da TASK-093 via ExpenseReportService, `reportTab: 'vendas'|'despesas'|'balanco'|'vendedores'`, `isGastosModalOpen` + abrir/fechar, e remover aba/estado/métodos de Compras e Contas a Pagar.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §7, §8), src/components/product-inventory/product-inventory.ts, src/components/product-inventory/product-inventory.spec.ts (somente leitura), src/services/expense-report-service/expense-report-service.ts, src/services/expense-service/expense-service.ts, src/services/expense-category-service/expense-category-service.ts, src/services/expense-recurrence-service/expense-recurrence-service.ts, .claude/context/clean-code.md
CRITERIO DE ACEITE: (1) testes da TASK-093 GREEN e suíte do componente sem regressão; (2) `activeTab` sem 'compras', sem `m.compras`, sem imports/injeções de Bill/PurchaseProduct, sem `gerarBillDeProdutoCompra`, `resetFiltroContasStatusSeNecessario`, `filtroContasStatus`, `billsFiltradosRelatorio`; (3) nenhuma soma/critério de data inline: tudo via ExpenseReportService; `confirmarCompra` (entrada de estoque) preservado intacto.
ARQUIVOS PERMITIDOS: src/components/product-inventory/product-inventory.ts
NAO FAZER: não editar .html/.css (TASK-097); não alterar o spec; não alterar PurchaseService; não editar .claude/tasks.md.
RETORNO ESPERADO: diff + saída do runner. Gate: style.
HISTORICO: 2026-10-22 — levi: getters gastosPeriodo/custoProducaoPeriodo/gastosPorCategoria/resultadoFinal via ExpenseReportService; assinatura de despesas/categorias; reportTab + "despesas"; isGastosModalOpen; catch-up gerarRecorrenciasAteHoje no init (companyId da sessao, erro -> notif.warning generico). AJUSTE DO KIRA: remocao dos membros de Compras/Contas adiada para depois da TASK-097 (strictTemplates — html ainda os usa); lista de obsoletos no retorno do levi (bills, purchaseProducts, produtoCompra*, gerarBillDeProdutoCompra, filtroContasStatus, billsFiltradosRelatorio, totalContas*, avancarStatusBill, billStatusLabel, formatBillDate, recurrenceLabel, *Compra* modal/form, activeTab compras, reportTab contas, injecoes BillService/PurchaseProductService). Bloqueio intermediario: TenantService sem provider no spec -> mike adicionou mock + 2 RED do catch-up. Runner 37/37. style APROVADO; ressalvas: subscriptions sem cleanup (padrao do componente inteiro — task futura), reformat do spec veio do prettier do mike na 055.


## TASK-095 — [TDD GREEN] Balanço por despesas
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-094
ESCOPO: rodar (sem reescrever) o spec do ProductInventory e a suíte completa; confirmar GREEN ou relatório de bug.
FLUXO: Implementacao
CONTEXTO A LER: src/components/product-inventory/product-inventory.spec.ts
CRITERIO DE ACEITE: (1) testes da TASK-093 GREEN; (2) suíte completa sem regressão (contagem exata antes/depois).
ARQUIVOS PERMITIDOS: nenhum (somente execução)
NAO FAZER: não editar spec nem código; não editar .claude/tasks.md.
RETORNO ESPERADO: contagem e veredito.
HISTORICO: 2026-10-22 — product-inventory.spec 37/37 confirmado em varias rodadas (levi TASK-094/059) e dentro da suite completa 408/408 da TASK-099.


## TASK-096 — Componentes do relatório de Despesas (pizza, barras 12 meses, modal Gastos)
STATUS: CONCLUIDA
AGENT: hanzo
DEPENDENCIAS: TASK-078
ESCOPO: criar `expense-report-panel` (pizza por categoria no período + barras dos 12 meses, Chart.js) e `gastos-breakdown-modal` (breakdown operacional + bloco separado "já incluso no CMV" só informativo), recebendo dados por @Input.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §8.2), .claude/context/identidade-visual.md, .claude/context/clean-code.md, src/services/expense-report-service/expense-report-service.ts, src/models/expense-model.ts, src/components/product-inventory/product-inventory.ts (linhas ~680-830: padrão de render/destroy de Chart.js)
CRITERIO DE ACEITE: (1) painel usa ExpenseReportService.breakdownPorCategoria e monthlyTotals (nenhuma agregação própria); pizza mostra tag de tipo; Charts destruídos no ngOnDestroy/ngOnChanges; (2) modal lista só categorias operacionais com total e %, e um bloco visualmente distinto rotulado "já incluso no CMV" com o custo de produção; (3) cores da paleta da identidade; dark/light; mobile ok.
ARQUIVOS PERMITIDOS: src/components/expense-report-panel/expense-report-panel.ts, src/components/expense-report-panel/expense-report-panel.html, src/components/expense-report-panel/expense-report-panel.css, src/components/gastos-breakdown-modal/gastos-breakdown-modal.ts, src/components/gastos-breakdown-modal/gastos-breakdown-modal.html, src/components/gastos-breakdown-modal/gastos-breakdown-modal.css
NAO FAZER: não editar product-inventory; não consultar Firestore (só @Input); não editar .claude/tasks.md.
RETORNO ESPERADO: arquivos + contrato de @Input/@Output + `ng build` sem erro.
HISTORICO: 2026-10-22 — hanzo: ExpenseReportPanelComponent (rosca por categoria + barras 12 meses empilhadas por tipo) e GastosBreakdownModalComponent (operacional + bloco "Ja incluso no CMV"). style PRECISA CORRIGIR (1 rodada): prettier, sufixo Component, output close->closed + Esc. 2a revisao: APROVADO. Tolerado: cores de eixo/grade do Chart.js fixas p/ tema escuro (mesmo precedente do product-inventory).


## TASK-097 — product-inventory.html/.css: sub-aba Despesas, Balanço e modal Gastos
STATUS: CONCLUIDA
AGENT: hanzo
DEPENDENCIAS: TASK-094, TASK-095, TASK-096
ESCOPO: no template, remover a aba Compras e a sub-aba Contas a Pagar, adicionar a sub-aba "Despesas" (expense-report-panel), tornar o card Gastos clicável abrindo gastos-breakdown-modal, e ajustar rótulos do Balanço ("Gastos (despesas operacionais por vencimento)").
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §8), .claude/context/identidade-visual.md, .claude/context/clean-code.md, src/components/product-inventory/product-inventory.html, src/components/product-inventory/product-inventory.css, src/components/product-inventory/product-inventory.ts (somente leitura), src/components/expense-report-panel/expense-report-panel.ts, src/components/gastos-breakdown-modal/gastos-breakdown-modal.ts
CRITERIO DE ACEITE: (1) nenhuma referência no html a `compras`, `produtoCompra*`, `bills`, `reportTab === 'contas'`; (2) fórmula do Balanço mostra Faturamento − CMV − Despesas operacionais = Resultado, com nota "custos de produção já estão no CMV"; (3) `ng build` sem erro de template (strictTemplates) e mobile preservado.
ARQUIVOS PERMITIDOS: src/components/product-inventory/product-inventory.html, src/components/product-inventory/product-inventory.css
NAO FAZER: não editar o .ts nem o spec; não alterar a aba Estoque/entrada 📦; não editar .claude/tasks.md.
RETORNO ESPERADO: diff + `ng build` sem erro. Gate: style.
HISTORICO: 2026-10-22 — hanzo: removidas aba Compras, modal de produto de compra e sub-aba Contas a Pagar do template; sub-aba Despesas com app-expense-report-panel; card Gastos clicavel (click/Enter/Espaco) + app-gastos-breakdown-modal (closed); formula Faturamento − CMV − Despesas operacionais + nota CMV. Componente standalone exigiu imports no .ts (fora dos arquivos permitidos): Kira fez o ajuste minimo (2 imports). Build ok; spec 37/37. style APROVADO; prettier tolerado (arquivos ja eram nao formatados — formatar = ~6k linhas de ruido; debito separado). Obs: membros orfaos no .ts (totalContas*, reportTab contas etc.) vao na TASK-099.


## TASK-098 — Remover módulo `compras` do ModuleConfig e de Configurações
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-092, TASK-097
ESCOPO: remover `compras` do ModuleConfig/DEFAULT_MODULES e o toggle em Configurações, e renomear o rótulo do módulo `contas` para "Despesas" (descrição "Despesas e contas a pagar"), garantindo que documentos antigos com `compras` não quebrem o merge.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §11), src/models/company-config.ts, src/components/config/config.ts, src/components/config/config.html, src/services/config/config.service.ts, src/components/product-inventory/product-inventory.spec.ts (mocks com compras: true)
CRITERIO DE ACEITE: (1) `grep -r "compras" src` sem ocorrência funcional (exceto comentário de legado e a coleção `purchases`); (2) config mostra "Despesas" e não mostra "Compras"; (3) `loadCompanyModules` com doc contendo `compras: true` legado carrega sem erro e sem recriar a chave; build e suíte sem regressão.
ARQUIVOS PERMITIDOS: src/models/company-config.ts, src/components/config/config.ts, src/components/config/config.html, src/services/config/config.service.ts, src/components/product-inventory/product-inventory.spec.ts (somente remover `compras` dos mocks)
NAO FAZER: não migrar companies/*; não tocar nas regras de gestao/clientes obrigatórios; não editar .claude/tasks.md.
RETORNO ESPERADO: diff + build + suíte.
HISTORICO: 2026-10-22 — levi: compras removido de ModuleConfig/DEFAULT_MODULES e do toggle de Configuracoes; rotulo contas -> "Despesas"; mocks do spec sem compras; remocao minima de m.compras no product-inventory.ts (autorizada pelo Kira). Doc legado com compras: true fica inerte (spread apos DEFAULT_MODULES). style APROVADO; lacuna baixa: sem spec de ConfigService para o doc legado (config.service fora dos arquivos permitidos).


## TASK-099 — Remover código legado de Contas a Pagar e Produtos de Compra
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-092, TASK-097, TASK-098
ESCOPO: apagar BillsComponent, BillService, BillRecurrenceService, PurchaseProductService, seus specs e models, e os providers/imports órfãos; manter intactos bills/purchaseProducts no banco, em firestore.rules, firestore.indexes.json e scripts/backfill-companyid.mjs.
FLUXO: Melhoria
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §7, §14), src/components/bills/bills.ts, src/services/bill-service/bill-service.ts, src/services/bill-recurrence-service/bill-recurrence-service.ts, src/services/purchase-product-service/purchase-product-service.ts, src/models/bill-model.ts, src/models/purchase-product-model.ts, src/app/app.routes.ts, src/components/product-inventory/product-inventory.spec.ts, src/services/test-helpers.ts
CRITERIO DE ACEITE: (1) `grep -rn "BillService\|BillRecurrenceService\|PurchaseProductService\|bill-model\|purchase-product-model\|BillsComponent" src` sem resultados; (2) `ng build` produção sem erro e suíte completa dentro de `firebase emulators:exec` 100% verde (exceto falha pré-existente AppComponent/SwUpdate, se persistir, reportada à parte) + `npm run test:rules` + `npm run test:migration` verdes; (3) `PurchaseService` e a coleção `purchases` intactos.
ARQUIVOS PERMITIDOS: src/components/bills/ (remover), src/services/bill-service/ (remover), src/services/bill-recurrence-service/ (remover), src/services/purchase-product-service/ (remover), src/models/bill-model.ts (remover), src/models/purchase-product-model.ts (remover), src/components/product-inventory/product-inventory.spec.ts, src/app/app.routes.ts
NAO FAZER: não remover bills/purchaseProducts de firestore.rules nem de firestore.indexes.json (rollback preservado até a purga em produção); não tocar em scripts/backfill-companyid.mjs; não editar .claude/tasks.md.
RETORNO ESPERADO: lista de arquivos removidos + saída de build e suítes.
HISTORICO: 2026-10-22 — levi: limpeza de todos os membros de Compras/Contas no product-inventory.ts e spec (confirmarCompra, PurchaseService e getters de despesas preservados). rm negado ao agent -> Kira removeu os arquivos legados via git rm (bills/, bill-service, bill-recurrence-service, purchase-product-service, bill-model, purchase-product-model). grep limpo; firestore.rules e indexes intactos (rollback). Suite 408/408, rules 99/99, migration 68/68, build prod ok. style APROVADO; Kira removeu comentario residual "Compras" em busca-por-nome.ts.


## TASK-100 — seed-demo no novo modelo de Despesas
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-085
ESCOPO: atualizar scripts/seed-demo.mjs para semear categorias padrão, despesas (a pagar, vencida, paga, parcelada, mercadoria recebida), séries recorrentes e `expenseCategories`, em vez de bills/purchaseProducts, mantendo alvo emulator/hml e recusa de PROD.
FLUXO: Melhoria
CONTEXTO A LER: scripts/seed-demo.mjs, .claude/context/regra-de-negocio.md (inteiro; §7, §8), src/models/expense-model.ts, src/models/expense-category-defaults.ts
CRITERIO DE ACEITE: (1) seed no emulador gera categorias com ids `${companyId}_${systemKey}`, despesas de todos os estados (incl. vencida, a vencer, paga, recebida, uma parcelada 3x e uma série semanal/mensal com generatedThrough) com datas date-only; (2) reexecução continua idempotente como o seed atual; (3) recusa PROD preservada.
ARQUIVOS PERMITIDOS: scripts/seed-demo.mjs
NAO FAZER: não rodar contra hml sem pedido do usuário; não alterar a migração; não editar .claude/tasks.md.
RETORNO ESPERADO: diff + saída da execução no emulador.
HISTORICO: 2026-10-22 — levi: seed-demo grava 12 categorias (ids deterministicos lidos de expense-category-defaults.ts), 20 despesas em todos os estados, parcelada 3x (333,33/333,33/333,34), 2 series com ocorrencias `${seriesId}_${dueDate}` e generatedThrough coerente; datas relativas a hoje em America/Sao_Paulo; sem bills/purchaseProducts; recusa de PROD intacta. Validado no emulador (2a execucao aborta sem duplicar). style APROVADO; Kira removeu compras: true residual do DEFAULT_MODULES do seed. Nao rodado em hml.


## TASK-101 — [MANUAL / USUARIO] Validação do módulo Despesas com a cliente em homolog
STATUS: PENDENTE
AGENT: usuario (manual; Kira apenas orienta, não executa)
DEPENDENCIAS: TASK-089, TASK-099, TASK-100
ESCOPO: publicar o hosting em hml (`npm run deploy:hosting:staging`) e validar com a cliente os fluxos de Despesas, Relatório e Balanço sobre os dados migrados.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §7, §8, §14), docs/bills.md
CRITERIO DE ACEITE: checklist aprovado pela cliente: (1) filtro "revisar migração" lista as despesas marcadas e a cliente corrige categorias; (2) cards Vencidas / A pagar no mês / Pago no mês batem com as listas em 3 meses diferentes; (3) criar despesa única, parcelada (soma = total) e recorrente (reabrir a tela 2x não duplica); Paguei/Chegou funcionam; categoria com despesa só arquiva; (4) Resultado do Balanço = Faturamento − CMV − Despesas operacionais; Gastos abre o modal com "já incluso no CMV" separado; confirmar com a cliente as respostas dos pontos [CONFIRMAR] (reversão de pagamento, categoria de recebido sem casamento, forma de pagamento boleto/transferência, "Vencidas" global); (5) mobile conferido no celular da cliente.
ARQUIVOS PERMITIDOS: nenhum
NAO FAZER: nada em produção; Kira não faz PR para main nem deploy de produção nesta fila.
RETORNO ESPERADO: o usuário confirma no chat (aprovado/ajustes); ajustes viram novas tasks.
HISTORICO:

## TASK-102 — Extrair helpers duplicados dos services de Despesas
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-084, TASK-094
ESCOPO: eliminar a duplicacao entre expense-service, expense-category-service e expense-recurrence-service (leitura/validacao de categoria da empresa, deteccao de permission-denied, constantes de colecao e guarda de sessao) e o codigo morto de faixa de ano no recurrence, sem mudar comportamento.
FLUXO: Melhoria
CONTEXTO A LER: .claude/context/clean-code.md, .claude/context/regra-de-negocio.md (inteiro; §7, §8.1, §10), src/services/expense-service/expense-service.ts, src/services/expense-category-service/expense-category-service.ts, src/services/expense-recurrence-service/expense-recurrence-service.ts, src/services/expense-validation/expense-validation.ts, os specs dos tres services (somente leitura)
CRITERIO DE ACEITE: (1) lerCategoriaDaEmpresa/assertCategoriaAtiva/ehNegacaoDePermissao/CODIGO_PERMISSAO_NEGADA/COLECAO_*/MSG_SEM_EMPRESA existem em um unico lugar; (2) assertDataDeNegocio e constantes ANO_* removidos do recurrence (assertDateKey ja cobre a faixa); (3) erro agregado do catch-up passa a carregar resultado parcial (RecurrenceCatchUpError com partial + failures) mantendo a mensagem; todos os specs dos tres services GREEN sem alteracao de assercao.
ARQUIVOS PERMITIDOS: os tres services, src/services/expense-validation/expense-validation.ts, novo src/services/expense-firestore-guards/expense-firestore-guards.ts
NAO FAZER: nao mudar comportamento nem mensagens verificadas pelos specs; nao alterar specs; nao editar .claude/tasks.md.
RETORNO ESPERADO: diff resumido + saida dos runners. Gate: style.
HISTORICO: 2026-10-22 — levi: novo src/services/expense-firestore-guards (COLECAO_*, MSG_CATEGORIA_*, exigirCompanyId com mensagem do chamador, lerCategoriaDaEmpresa, assertCategoriaAtiva, ehNegacaoDePermissao) usado pelos 3 services; assertDataDeNegocio/ANO_* removidos do recurrence; RecurrenceCatchUpError com partial + failures (mesma message). +79/-152 linhas + modulo novo. expense-*.spec 204/204. style APROVADO; sugestoes futuras (nao bloqueantes): helper unico "categoria ativa da empresa" nos guards, renomear pasta para expense-firestore-helpers (colide com src/guards), esclarecer partial.seriesProcessed.
