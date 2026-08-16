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
