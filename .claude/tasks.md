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

## TASK-035 — Aplicar alteração de context do módulo Despesas
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
HISTORICO: 2026-10-22 — texto de context redigido pelo killua (arquitetura do modulo, decisoes D1-D7 do usuario) e aplicado pelo Kira em regra-de-negocio.md (§1, §2, §5.2, §7, §8, §10, §11, §12, nova §14), schema.dbml (3 tabelas novas, bills/purchaseProducts LEGADO, nota stale de "purchase-products" corrigida — o nome real no codigo e purchaseProducts) e stack.md (colecoes, rules, runner node:test). Itens [CONFIRMAR] mantidos para a TASK-063.

## TASK-036 — Models, defaults e esqueletos de assinatura do módulo Despesas
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-035
ESCOPO: criar os arquivos de model/defaults e os esqueletos compiláveis (corpo `throw new Error('not implemented')`) exatamente como entregues pelo killua, sem lógica.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro), .claude/context/schema.dbml, .claude/context/clean-code.md, bloco "Esqueletos" da rodada de arquitetura (Kira cola no briefing), src/services/firestore-base.service.ts, src/models/sell-model.ts
CRITERIO DE ACEITE: (1) `npx tsc --noEmit -p tsconfig.app.json` sem erro novo; (2) os 5 arquivos .ts de service/lib existem com as assinaturas idênticas às do esqueleto; (3) nenhuma lógica real (todos os corpos lançam 'not implemented'), exceto `defaultCategoryId` e as constantes de dados.
ARQUIVOS PERMITIDOS: src/models/expense-model.ts, src/models/expense-category-defaults.ts, src/services/expense-schedule-service/expense-schedule-service.ts, src/services/expense-report-service/expense-report-service.ts, src/services/expense-service/expense-service.ts, src/services/expense-category-service/expense-category-service.ts, src/services/expense-recurrence-service/expense-recurrence-service.ts, scripts/lib/expense-migration-core.mjs
NAO FAZER: não implementar lógica; não alterar assinatura; não tocar em bills/purchase-product; não editar .claude/tasks.md.
RETORNO ESPERADO: lista de arquivos criados + saída do tsc.
HISTORICO: 2026-10-22 — Kira criou os 8 arquivos de esqueleto exatamente como entregues pelo killua (acao estrutural, Secao 5 passo 2). Validacao de tipos registrada no chat.

## TASK-037 — [TDD RED] ExpenseScheduleService + ExpenseReportService (funções puras)
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-036
ESCOPO: escrever os testes (Karma/Jasmine, lógica pura sem emulador) das duas classes estáticas e confirmar RED por lógica ausente.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §7.1-7.4 e §8), src/services/expense-schedule-service/expense-schedule-service.ts, src/services/expense-report-service/expense-report-service.ts, src/models/expense-model.ts, src/models/expense-category-defaults.ts, src/services/bill-recurrence-service/bill-recurrence-service.spec.ts (describe de lógica pura como referência de estilo)
CRITERIO DE ACEITE: (1) Schedule: split 100/3 = [33.33,33.33,33.34]; soma exata para totais com centavos quebrados (ex.: 0,10/3; 99,99/7; 1000/12), N=1, N=120, N=0/121/1.5 e total<=0 lançam; datas de parcela 31/jan -> 28/fev -> 31/mar, ano bissexto (29/fev), virada de ano; occurrenceDates mensal dia 31 e semanal, com generatedThrough null e preenchido, upTo no fim do mês, upTo < âncora -> []; toDateKey estável independente do fuso da máquina (datas 23:30 e 00:30 de São Paulo); (2) Report: groupForMonth — cards e listas derivam do mesmo agrupamento (total do card = soma da lista), vencida de mês anterior aparece em `vencidas`, a vencer só do mês e >= hoje, paga por paidDate; isOverdue no limite (dueDate == hoje não é vencida); sumOperacionalPorVencimento ignora custo_producao e conta pago e a_pagar, limites inclusivos start/end; categoria órfã = operacional; breakdown por categoria; monthlyTotals com 12 buckets e zeros; calcResultado = fat − cmv − operacionais com soma em centavos (sem 0.1+0.2); (3) execução mostra RED por 'not implemented' (não por erro de compilação).
ARQUIVOS PERMITIDOS: src/services/expense-schedule-service/expense-schedule-service.spec.ts, src/services/expense-report-service/expense-report-service.spec.ts
NAO FAZER: não editar os services; não escrever teste que dependa de Firestore; não editar .claude/tasks.md.
RETORNO ESPERADO: lista de testes + saída do runner confirmando RED válido + comando de execução (`npx ng test --include='**/expense-*-service.spec.ts' --browsers=ChromeHeadless --watch=false`).
HISTORICO: 2026-10-22 — mike: 33+35 testes (schedule/report), RED 68/68 por not implemented; helper exige mensagem != not implemented nos casos de lancamento. Rodada de correcao pos-style: +13 testes applyFilters e +1 orfa "Sem categoria". Spec do report fechou com 48 its, schedule 34 (contagem real do runner). Prettier aplicado pelo Kira.


## TASK-038 — Implementar ExpenseScheduleService
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-037
ESCOPO: implementar todos os métodos de ExpenseScheduleService até os testes da TASK-037 ficarem GREEN (aritmética em centavos inteiros; datas via componentes Y/M/D, nunca Date local sem fuso).
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §7.2, §7.3), src/services/expense-schedule-service/expense-schedule-service.ts, src/services/expense-schedule-service/expense-schedule-service.spec.ts (somente leitura), src/models/expense-model.ts, .claude/context/clean-code.md
CRITERIO DE ACEITE: (1) todos os testes de expense-schedule-service.spec.ts passam; (2) nenhuma dependência de Angular/Firestore no arquivo; (3) nenhum `new Date()` implícito de "hoje" dentro dos métodos (entrada explícita).
ARQUIVOS PERMITIDOS: src/services/expense-schedule-service/expense-schedule-service.ts
NAO FAZER: não alterar o spec nem assinaturas; não tocar em outros arquivos; não editar .claude/tasks.md.
RETORNO ESPERADO: arquivo implementado + saída do runner (GREEN do spec desta classe).
HISTORICO: 2026-10-22 — levi: GREEN 34/34. style APROVADO com ressalvas; Kira mandou fechar: assertTotalValid (Number.isFinite — NaN gerava parcelas NaN), assertDateKeyValid em anchor/upTo/generatedThrough (evita laco infinito com dado ruim do Firestore), mensagens de erro em portugues acentuado. 2a revisao style: APROVADO.


## TASK-039 — Implementar ExpenseReportService
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-037
ESCOPO: implementar todos os métodos de ExpenseReportService até os testes da TASK-037 ficarem GREEN (um único agrupamento alimenta cards e listas; somas em centavos).
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §7.4, §8.2), src/services/expense-report-service/expense-report-service.ts, src/services/expense-report-service/expense-report-service.spec.ts (somente leitura), src/models/expense-model.ts, .claude/context/clean-code.md
CRITERIO DE ACEITE: (1) todos os testes de expense-report-service.spec.ts passam; (2) sem dependência de Angular/Firestore; (3) nenhum critério de data duplicado: `groupForMonth` é usado pelos totals.
ARQUIVOS PERMITIDOS: src/services/expense-report-service/expense-report-service.ts
NAO FAZER: não alterar o spec nem assinaturas; não editar .claude/tasks.md.
RETORNO ESPERADO: arquivo implementado + saída do runner.
HISTORICO: 2026-10-22 — levi: GREEN 34/34 inicial. style PRECISA CORRIGIR (1 rodada): prettier, orfa exibia categoryId cru -> SEM_CATEGORIA_LABEL, helpers de data duplicados -> reuso de ExpenseScheduleService, comentario enganoso, find duplicado/copia quadratica -> Map. applyFilters sem teste -> mike cobriu. Final 48/48; 2a revisao style: APROVADO.


## TASK-040 — [TDD GREEN] Confirmar ExpenseScheduleService + ExpenseReportService
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-038, TASK-039
ESCOPO: rodar os dois specs puros (sem reescrever) e confirmar GREEN ou devolver relatório de bug.
FLUXO: Implementacao
CONTEXTO A LER: src/services/expense-schedule-service/expense-schedule-service.spec.ts, src/services/expense-report-service/expense-report-service.spec.ts
CRITERIO DE ACEITE: (1) 100% dos testes das duas classes passam; (2) suíte Karma completa sem regressão vs. contagem anterior (reportar nº exato antes/depois); (3) em caso de falha, relatório com teste, esperado vs. obtido e suspeita.
ARQUIVOS PERMITIDOS: nenhum (somente execução)
NAO FAZER: não editar specs nem código; não editar .claude/tasks.md.
RETORNO ESPERADO: contagem exata de SUCCESS/FAILED e veredito GREEN ou relatório de bug.
HISTORICO: 2026-10-22 — mike: GREEN 68/68 (schedule+report). Criterio (2) suite completa adiado para TASK-047 (emulador ocupado pela TASK-048). Pos-correcao: 82/82 confirmado pelo style.


## TASK-041 — [TDD RED] ExpenseService + ExpenseCategoryService (emulador, isolamento)
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-040
ESCOPO: escrever specs de integração (Firestore/Auth Emulator, helpers existentes) dos dois services e confirmar RED por lógica ausente.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §7.1, §7.2, §8.1, §10), src/services/expense-service/expense-service.ts, src/services/expense-category-service/expense-category-service.ts, src/models/expense-model.ts, src/models/expense-category-defaults.ts, src/services/test-helpers.ts, src/services/bill-service/bill-service.spec.ts (padrão de isolamento com 2 usuários)
CRITERIO DE ACEITE: (1) ExpenseService: getExpenses só retorna da empresa da sessão (segundo usuário/empresa seeda dado estrangeiro); addExpense injeta companyId, status 'a_pagar', origin 'manual'; todas as escritas lançam com companyId nulo; addInstallments grava N docs com soma exata, vencimentos corretos, mesmo installmentGroupId, atomicamente; markAsPaid grava paidDate/paymentMethod e lança se já pago; markGoodsReceived; (2) ExpenseCategoryService: ensureDefaults cria 12 com ids `${companyId}_${systemKey}`, tipos corretos (2 custo_producao, 10 operacionais) e é idempotente (2 chamadas = 12 docs, sem sobrescrever uma categoria renomeada); addCategory exige type; renameCategory não altera type (lança se tentar); deleteCategory lança com expense OU série vinculada e funciona sem vínculo; setArchived; isolamento entre empresas; (3) RED por 'not implemented' (não por PERMISSION_DENIED de fixture nem erro de compilação; ids de fixture únicos — lição da TASK-032).
ARQUIVOS PERMITIDOS: src/services/expense-service/expense-service.spec.ts, src/services/expense-category-service/expense-category-service.spec.ts
NAO FAZER: não editar services nem test-helpers; não usar IDs fixos de documento; não editar .claude/tasks.md.
RETORNO ESPERADO: lista de testes + saída RED + comando (emuladores Firestore+Auth no ar).
HISTORICO: 2026-10-22 — mike: 41 testes RED (isolamento, companyId nulo, parcelamento, markAsPaid, ensureDefaults, deleteCategory). Corrigiu 6 falsos positivos (toBeRejected aceitava not implemented -> expectRejeicaoDeRegra). Licao: rules negam getDoc E query por documentId() de doc inexistente -> prova de exclusao por listagem da empresa. Rodadas de correcao pos-style/gon: +3 (patch protegido, seed unico), +22 (validacao de entrada, input sujo, categoria da empresa), +8 (goodsReceivedDate, valor < 1 centavo). Setup passou a usar categoria real da empresa. Final 76 testes.


## TASK-042 — Implementar ExpenseService + ExpenseCategoryService
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-041
ESCOPO: implementar os dois services até os specs da TASK-041 ficarem GREEN (padrão BillService/TenantService; `runTransaction` em markAsPaid; batch em addInstallments).
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §7.1, §7.2, §8.1, §10), src/services/expense-service/expense-service.ts, src/services/expense-category-service/expense-category-service.ts, os dois .spec.ts (somente leitura), src/services/bill-service/bill-service.ts (padrão), src/services/tenant-service/tenant-service.ts, src/services/expense-schedule-service/expense-schedule-service.ts, src/models/expense-model.ts, src/models/expense-category-defaults.ts, .claude/context/clean-code.md
CRITERIO DE ACEITE: (1) specs das TASK-041 passam; (2) `getExpenses` filtra por companyId e ordena por dueDate desc; (3) nenhuma escrita sem guarda de companyId; valores numéricos normalizados com Number(...).
ARQUIVOS PERMITIDOS: src/services/expense-service/expense-service.ts, src/services/expense-category-service/expense-category-service.ts
NAO FAZER: não alterar specs; não alterar firestore.rules (TASK-044); não editar .claude/tasks.md.
RETORNO ESPERADO: arquivos implementados + saída do runner. Gate: style + gon (isolamento).
HISTORICO: 2026-10-22 — levi: ExpenseService + ExpenseCategoryService. style 4 rodadas, gon 2 rodadas. Achados e decisoes: (1) updateExpense gravava status/paidDate em runtime -> CAMPOS_GERENCIADOS_PELO_SERVICE (inclui proveniencia) filtrado em create e update; (2) ensureDefaults ressuscitava padrao excluida -> SEED UNICO (decisao do Kira: so cria as 12 se a empresa nao tem nenhuma categoria); (3) gon: valor/data sem validacao nos caminhos simples, input sujo na criacao, categoryId de outra empresa -> modulo novo src/services/expense-validation (assertExpenseValue >= 1 centavo, assertDateKey com ano 2000..2100, assertRecurrencePeriod, stripUndefined, omitFields); categoria validada (existe, da empresa, nao arquivada na criacao; no update so quando muda); permission-denied -> "Categoria inválida para esta empresa." (sem oraculo de existencia); (4) goodsReceivedDate validado nos 3 caminhos. migracaoRevisar/migracaoMotivo editaveis por design. Convencao reforcada: comentario sem acento (briefing do Kira errou uma vez). Aceitos/registrados: corrida minima no seed; checagem de vinculo de deleteCategory fora de transacao; valor com >2 casas gravado cru; sem teto maximo de valor; duplicacao de helpers de categoria com recurrence -> task de Melhoria. Runner final 110/110 (76 + schedule 34).


## TASK-043 — [TDD RED] firestore.rules para expenses/expenseCategories/expenseSeries
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-036
ESCOPO: estender test/firestore.rules.spec.ts cobrindo as 3 coleções novas (isolamento por companyId, super-admin, update sem trocar companyId, anônimo negado) e confirmar RED.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §10, §13), test/firestore.rules.spec.ts, firestore.rules
CRITERIO DE ACEITE: (1) para cada uma das 3 coleções: leitura/criação/atualização/exclusão da própria empresa permitidas; de outra empresa negadas; sem auth negadas; update que troca companyId negado; super-admin com bypass igual às demais coleções operacionais; (2) as listas de coleções operacionais existentes (linhas ~284 e ~310) ganham as 3 novas e MANTÊM bills/purchaseProducts; (3) RED porque as rules atuais ainda não conhecem as coleções (falha de permissão), com `npm run test:rules` mostrando só os novos casos falhando.
ARQUIVOS PERMITIDOS: test/firestore.rules.spec.ts
NAO FAZER: não editar firestore.rules; não remover casos existentes; não editar .claude/tasks.md.
RETORNO ESPERADO: casos adicionados + saída de `npm run test:rules` com RED válido.
HISTORICO: 2026-10-22 — mike: 42 casos novos (14 x 3 colecoes) + 3 colecoes nas 2 listas existentes do spec. RED: 15 falhas/99 por PERMISSION_DENIED. Casos negativos passavam pelo motivo errado ate a TASK-044.


## TASK-044 — firestore.rules e índices das coleções de Despesas
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-043
ESCOPO: adicionar 'expenses', 'expenseCategories', 'expenseSeries' em isOperationalCollection e o índice composto de expenses (companyId ASC, dueDate DESC) em firestore.indexes.json, mantendo bills e purchaseProducts.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §10, §12), firestore.rules, firestore.indexes.json, test/firestore.rules.spec.ts (somente leitura)
CRITERIO DE ACEITE: (1) `npm run test:rules` 100% GREEN (casos novos e antigos); (2) firestore.indexes.json contém o novo índice e continua com os 3 anteriores; (3) nenhuma outra regra alterada (diff só na lista e no JSON).
ARQUIVOS PERMITIDOS: firestore.rules, firestore.indexes.json
NAO FAZER: não executar deploy; não remover bills/purchaseProducts; não editar o spec; não editar .claude/tasks.md.
RETORNO ESPERADO: diff + saída do test:rules. Gate: style + gon (autorização).
HISTORICO: 2026-10-22 — levi: 3 colecoes em isOperationalCollection (firestore.rules:26) + indice expenses(companyId ASC, dueDate DESC). test:rules 99/99. style APROVADO. gon APROVADO; achado baixo registrado como melhoria futura: squatting de id deterministico de categoria padrao (`${companyId}_${systemKey}`) por outro tenant que conheca o companyId — blindagem possivel exigindo docId com prefixo companyId_ na criacao de expenseCategories. Informativo: sem checagem de papel nas colecoes de despesas (igual as demais operacionais).


## TASK-045 — [TDD RED] ExpenseRecurrenceService (catch-up idempotente)
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-042, TASK-044
ESCOPO: escrever specs de integração do ExpenseRecurrenceService e confirmar RED.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §7.3), src/services/expense-recurrence-service/expense-recurrence-service.ts, src/services/expense-schedule-service/expense-schedule-service.ts, src/models/expense-model.ts, src/services/test-helpers.ts, src/services/bill-recurrence-service/bill-recurrence-service.spec.ts (padrão), firestore.rules
CRITERIO DE ACEITE: (1) catch-up gera TODAS as ocorrências perdidas até o fim do mês corrente (mensal: âncora dia 31 -> dias 30/28/31 corretos; semanal: +7k dias); (2) rodar duas vezes seguidas e duas chamadas concorrentes (Promise.all) não duplicam (contagem de docs = esperado) e avançam generatedThrough; (3) ocorrência apagada pelo usuário não é recriada; (4) série `active=false` não gera; endSeries mantém ocorrências já geradas; (5) createSeries grava série + 1ª ocorrência com id `${seriesId}_${dueDate}`; (6) isolamento: série de outra empresa nunca é processada; companyId vazio lança; (7) RED por 'not implemented'; fixtures com ids únicos.
ARQUIVOS PERMITIDOS: src/services/expense-recurrence-service/expense-recurrence-service.spec.ts
NAO FAZER: não editar o service; não editar test-helpers; não editar .claude/tasks.md.
RETORNO ESPERADO: lista de testes + saída RED.
HISTORICO: 2026-10-22 — mike: 17 testes RED iniciais; rodadas pos-style/gon: +13 (endSeries ownership/encerrada, lote >399, getSeries, validacao de createSeries, serie envenenada), +limites (ancora 24 meses, faixa de ano, teto 399/chamada, template sujo, companyId alheio), +6 (today invalido, anchorDate corrompido). Fixtures passaram a usar categoria real da empresa e HOJE_REFERENCIA fixo (eliminada bomba-relogio de 2028). Final 46 testes.


## TASK-046 — Implementar ExpenseRecurrenceService
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-045
ESCOPO: implementar o service até GREEN: catch-up em runTransaction sobre o doc da série, geração em lotes de no máximo 400 escritas por transação, ids determinísticos.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §7.3, §10), src/services/expense-recurrence-service/expense-recurrence-service.ts, src/services/expense-recurrence-service/expense-recurrence-service.spec.ts (somente leitura), src/services/expense-schedule-service/expense-schedule-service.ts, src/services/tenant-service/tenant-service.ts, src/models/expense-model.ts, .claude/context/clean-code.md
CRITERIO DE ACEITE: (1) specs da TASK-045 passam; (2) leitura de séries sempre com where companyId + active; (3) nenhuma geração fora de transação; falhas sobem (throw), sem engolir erro.
ARQUIVOS PERMITIDOS: src/services/expense-recurrence-service/expense-recurrence-service.ts
NAO FAZER: não alterar o spec; não usar Cloud Functions; não editar .claude/tasks.md.
RETORNO ESPERADO: arquivo implementado + saída do runner. Gate: style + gon.
HISTORICO: 2026-10-22 — levi: ExpenseRecurrenceService. style 4 rodadas, gon 2 rodadas. R1 style: endSeries sem ownership (CRITICA §10), serie ruim derrubava as demais -> decisao do Kira: processa todas, acumula falhas e relanca erro agregado. createSeries sem validacao -> reusa expense-validation. R1 gon (ALTA): ancora arbitrariamente antiga gerava ~100k docs por carregamento -> Kira decidiu limites e registrou em regra §7.3 "Limites" (ano 2000..2100, ancora <= 24 meses, 1 lote de 399 por serie por chamada, revalidacao do template, companyId so da sessao). R3 style: today obrigatorio e validado, anchorDate corrompido -> mensagem de dominio. Aceitos: today do catch-up vem do chamador (UI deve usar relogio local); texto livre sem limite (padrao do projeto); escrita de expenseSeries por qualquer papel da empresa (decisao de produto). Divida -> TASK-064.


## TASK-047 — [TDD GREEN] Services, recurrence e rules de Despesas
STATUS: PENDENTE
AGENT: mike
DEPENDENCIAS: TASK-042, TASK-044, TASK-046
ESCOPO: rodar (sem reescrever) os specs das TASK-041/043/045 e a suíte completa; confirmar GREEN ou devolver relatório de bug.
FLUXO: Implementacao
CONTEXTO A LER: src/services/expense-service/expense-service.spec.ts, src/services/expense-category-service/expense-category-service.spec.ts, src/services/expense-recurrence-service/expense-recurrence-service.spec.ts, test/firestore.rules.spec.ts
CRITERIO DE ACEITE: (1) os três specs de service e `npm run test:rules` em GREEN; (2) suíte Karma completa dentro de `firebase emulators:exec` sem regressão (reportar contagem exata; a falha pré-existente AppComponent/SwUpdate, se ainda existir, é reportada à parte); (3) relatório de bug se houver falha.
ARQUIVOS PERMITIDOS: nenhum (somente execução)
NAO FAZER: não editar specs nem código; não editar .claude/tasks.md.
RETORNO ESPERADO: contagem exata e veredito.
HISTORICO:

## TASK-048 — [TDD RED] Núcleo e script da migração bills/purchaseProducts -> expenses
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-036
ESCOPO: escrever os testes node:test do núcleo puro e um teste de integração do script contra o Firestore Emulator (Admin SDK), confirmando RED.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §7, §8.1, §14), scripts/lib/expense-migration-core.mjs, src/models/expense-model.ts, src/models/expense-category-defaults.ts, scripts/seed-demo.mjs (formato real dos bills legados), scripts/backfill-companyid.mjs (padrão Admin SDK/dry-run/--apply)
CRITERIO DE ACEITE: (1) status: pendente->a_pagar; recebido->a_pagar+goodsReceivedDate; pago->pago+paidDate (+goodsReceivedDate se receivedAt); (2) D3: sem dueDate usa paidAt/receivedAt/createdAt e marca migracaoRevisar; datas em America/Sao_Paulo (Timestamp 02:30Z do dia seguinte cai no dia anterior em SP); (3) categoria pela precedência da §14: "Compra: X" -> Compra de mercadoria; bill com purchaseProductId usa nome do produto; "Aluguel do ponto" -> Aluguel; "Conta de energia" -> Energia/Água/Gás; "Taxa da maquininha" -> Taxas de cartão; sem casamento -> Outros + revisar; recebido sem casamento -> Compra de mercadoria + revisar; (4) purchaseProduct recurring -> série `mig_pp_<id>` com period traduzido, anchorDate = menor dueDate, generatedThrough = maior dueDate dos bills ligados, e os bills ligados recebem seriesId; recurring=false -> sem série; bill recorrente manual -> despesa simples + revisar; (5) idempotência: planMigration com existingIds preenchido pula tudo e reporta `skipped`; script no emulador: 2ª execução cria 0 docs e não sobrescreve doc editado; (6) dry-run padrão não escreve; `--rollback` apaga só origin=='migracao'/mig_pp_*; legado nunca é alterado; (7) script recusa projeto != hologaerp e bill sem companyId é ignorado e reportado; (8) paridade: DEFAULT_CATEGORY_DEFS do core == DEFAULT_EXPENSE_CATEGORIES do app (comparação textual do .ts); (9) RED por 'not implemented'/script ausente.
ARQUIVOS PERMITIDOS: test/expense-migration-core.test.mjs, test/migrate-bills-to-expenses.emulator.test.mjs, package.json (somente adicionar scripts `test:migration` e `test:migration:emulator`)
NAO FAZER: não editar scripts/ nem src/; não rodar contra projeto real; não editar .claude/tasks.md.
RETORNO ESPERADO: lista de testes + saída RED + comandos de execução.
HISTORICO: 2026-10-22 — mike: test/expense-migration-core.test.mjs (53 testes; RED 52 por not implemented, 1 de paridade de categorias passa por construcao — guarda de regressao) + test/migrate-bills-to-expenses.emulator.test.mjs (7; RED por script ausente) + scripts npm test:migration/test:migration:emulator. Contrato de report nao estava no esqueleto: Kira fixou formato no briefing da TASK-049 (byStatus, byCategory, revisar, skipped, created + ids ignorados no stdout).


## TASK-049 — Implementar núcleo e script de migração (hml only)
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-048
ESCOPO: implementar scripts/lib/expense-migration-core.mjs e criar scripts/migrate-bills-to-expenses.mjs (Admin SDK; dry-run padrão; --apply; --rollback; --company=<id> opcional; recusa projeto != hologaerp; suporta FIRESTORE_EMULATOR_HOST) até os testes da TASK-048 ficarem GREEN.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §14), scripts/lib/expense-migration-core.mjs, test/expense-migration-core.test.mjs e test/migrate-bills-to-expenses.emulator.test.mjs (somente leitura), scripts/backfill-companyid.mjs (padrão), src/models/expense-model.ts, .claude/context/clean-code.md
CRITERIO DE ACEITE: (1) `npm run test:migration` e `npm run test:migration:emulator` GREEN; (2) ids determinísticos com `create()` (ALREADY_EXISTS = pulado, nunca sobrescreve); (3) relatório final com contagens (por status, por categoria, migracaoRevisar, pulados, sem companyId); (4) o script não altera nem apaga bills/purchaseProducts e o cabeçalho documenta uso, pré-requisitos e rollback.
ARQUIVOS PERMITIDOS: scripts/lib/expense-migration-core.mjs, scripts/migrate-bills-to-expenses.mjs, package.json (somente scripts npm `migrate:expenses:hml`)
NAO FAZER: não habilitar produção (projetosfelipe-9e458); não alterar os testes; não rodar contra projeto real; não editar .claude/tasks.md.
RETORNO ESPERADO: arquivos + saída dos dois runners. Gate: style + gon (script que escreve dado de cliente).
HISTORICO: 2026-10-22 — levi: core + script (Admin SDK, dry-run padrao, --apply, --rollback, --company, guard hologaerp antes do initializeApp; projectId fixo). style: 3 rodadas. R1 PRECISA CORRIGIR: serie aplicava regras de bill ("Compra:" e receivedAt) na categoria; bill sem data abortava o run inteiro; "cartao" isolado capturava "Fatura cartao de credito"; constantes duplicadas entre core e script; project_id da service account nao validado. Kira decidiu tambem: rollback apaga ocorrencias geradas de series mig_pp_*. mike escreveu RED (+12 core, +2 emulador) antes da correcao. R2: serie sem bills e sem defaultValue gravava template.value NaN (mike +2 RED) + sentinela U+F8FF cru -> escape. R3 APROVADO. Decisao registrada: palavras-chave genericas compra/compras removidas de matchCategoryKey (falso positivo em series); bills livres "compra fornecedor X" sem prefixo caem em Outros+revisar (ou compra_mercadoria+revisar se receivedAt) — aceito pela §14. report.skipped numerico + skippedByKind (teste prevaleceu sobre o briefing do Kira); report.unmigratable {kind,id,motivo}. gon APROVADO; obs baixas: companyId legado nao validado como id seguro (defesa em profundidade), rollback apaga despesas migradas mesmo editadas/pagas depois (documentado no cabecalho; decisao de produto), FIRESTORE_EMULATOR_HOST nao restrito a loopback.


## TASK-050 — [TDD GREEN] Confirmar migração
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-049
ESCOPO: rodar (sem reescrever) os testes de migração e o emulador; confirmar GREEN ou relatório de bug.
FLUXO: Implementacao
CONTEXTO A LER: test/expense-migration-core.test.mjs, test/migrate-bills-to-expenses.emulator.test.mjs
CRITERIO DE ACEITE: (1) ambos GREEN; (2) 2ª execução do script no emulador cria 0 docs e `--rollback` deixa bills/purchaseProducts intactos (conferência de contagem); (3) relatório de bug se falhar.
ARQUIVOS PERMITIDOS: nenhum (somente execução)
NAO FAZER: não editar testes nem código; não editar .claude/tasks.md.
RETORNO ESPERADO: contagens e veredito.
HISTORICO: 2026-10-22 — mike: GREEN core 53/53 + emulador 7/7 na 1a rodada; apos as correcoes do style o executor/mike confirmaram core 68/68 e emulador 9/9 (2a execucao cria 0 docs, rollback restrito, legado intacto).


## TASK-051 — [MANUAL / USUARIO] Deploy de rules+índices e migração em homolog (hologaerp)
STATUS: PENDENTE
AGENT: usuario (manual; Kira apenas orienta, não executa)
DEPENDENCIAS: TASK-047, TASK-050
ESCOPO: publicar rules/índices no hml, rodar a migração em dry-run, conferir o relatório e só então aplicar com --apply.
FLUXO: Implementacao
CONTEXTO A LER: scripts/migrate-bills-to-expenses.mjs (cabeçalho), firestore.rules, firestore.indexes.json, .claude/context/regra-de-negocio.md (inteiro; §14)
CRITERIO DE ACEITE: (1) `npm run deploy:rules:staging` concluído e índice de expenses com status "Enabled" no console; (2) dry-run revisado (contagens por status/categoria, lista de migracaoRevisar); (3) `--apply` rodado; 2ª execução reporta 0 criados; amostra de 5 bills conferida no console contra os expenses gerados.
ARQUIVOS PERMITIDOS: nenhum (operação manual em hml)
NAO FAZER: nada em produção (projetosfelipe-9e458); não apagar bills/purchaseProducts.
RETORNO ESPERADO: o usuário confirma no chat + cola o relatório do script.
HISTORICO:

## TASK-052 — Componente ExpenseForm (única / parcelada / recorrente)
STATUS: CONCLUIDA
AGENT: hanzo
DEPENDENCIAS: TASK-040
ESCOPO: criar componente standalone `expense-form` (template-driven, ngModel) para criar/editar despesa com modo único, parcelado (N, preview das parcelas via ExpenseScheduleService.buildInstallments) e recorrente (semanal/mensal), emitindo o payload por @Output.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §7.1-7.3, §8.1), .claude/context/identidade-visual.md, .claude/context/clean-code.md, src/models/expense-model.ts, src/services/expense-schedule-service/expense-schedule-service.ts, src/components/bills/bills.html, src/components/bills/bills.css
CRITERIO DE ACEITE: (1) campos: descrição, valor, categoria (só não arquivadas), vencimento obrigatório, fornecedor, forma de pagamento, observação, "mercadoria recebida em"; validação early-return com notif.warning; (2) modo parcelado mostra preview "N x R$" com a soma exata e datas; modo recorrente mostra aviso se a âncora for > 24 meses no passado; parcelado e recorrente são excludentes; (3) usa tokens/variáveis CSS da identidade visual (dark/light) e tem layout mobile (`expense-form-mobile.css`).
ARQUIVOS PERMITIDOS: src/components/expense-form/expense-form.ts, src/components/expense-form/expense-form.html, src/components/expense-form/expense-form.css, src/components/expense-form/expense-form-mobile.css
NAO FAZER: não chamar Firestore/services de escrita (só emite evento); não calcular parcela fora do ExpenseScheduleService; não editar outros arquivos; não editar .claude/tasks.md.
RETORNO ESPERADO: arquivos + contrato de @Input/@Output + `ng build` sem erro.
HISTORICO: 2026-10-22 — hanzo: ExpenseFormComponent (unica/parcelada/recorrente; preview via buildInstallments; aviso ancora > 24 meses). style PRECISA CORRIGIR (1 rodada): ngOnChanges sobrescrevia digitacao quando categories reemitia e nao resetava em expense=null (MEDIA); getter de preview recalculado 5x/ciclo; "24 meses" hardcoded; outputs com nome nativo -> saved/cancelled. 2a revisao: APROVADO. Obs: aviso de ancora usa fuso America/Sao_Paulo (toDateKey) e a §7.1 fala em "data local do navegador" — divergencia so de texto, cliente opera no Brasil.


## TASK-053 — Componente ExpenseCategoryManager
STATUS: CONCLUIDA
AGENT: hanzo
DEPENDENCIAS: TASK-042
ESCOPO: criar componente standalone `expense-category-manager` para listar categorias com tag de tipo, criar nova (nome + escolha obrigatória do tipo), renomear, arquivar/desarquivar e excluir (só se sem vínculo; erro do service vira notif.warning clara).
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §8.1), .claude/context/identidade-visual.md, .claude/context/clean-code.md, src/services/expense-category-service/expense-category-service.ts, src/models/expense-model.ts
CRITERIO DE ACEITE: (1) tipo só escolhido na criação e exibido (somente leitura) depois; (2) categoria com vínculo mostra só "Arquivar" (sem "Excluir"), com texto explicando o porquê; (3) chama ensureDefaults ao abrir; mobile ok.
ARQUIVOS PERMITIDOS: src/components/expense-category-manager/expense-category-manager.ts, src/components/expense-category-manager/expense-category-manager.html, src/components/expense-category-manager/expense-category-manager.css
NAO FAZER: não alterar o service; não editar outros arquivos; não editar .claude/tasks.md.
RETORNO ESPERADO: arquivos + `ng build` sem erro.
HISTORICO: 2026-10-22 — hanzo: ExpenseCategoryManagerComponent (@Input categoryIdsInUse: ReadonlySet<string> calculado pelo pai; @Output closed; exporta EXPENSE_CATEGORY_TYPE_LABELS). style PRECISA CORRIGIR (1 rodada): corrida — criar categoria antes do seed terminar impedia o seed unico para sempre -> form travado ate ensureDefaults + 1o snapshot; window confirm() -> modal padrao do projeto com CSS local (bills sera apagado na 061). 2a revisao APROVADO. Obs nao bloqueante: erro no stream getCategories deixa o form travado (tratar com error: no subscribe numa task futura). Mobile via @media no proprio .css (restricao de arquivos).


## TASK-054 — Tela Despesas (/contas): mês, cards, grupos, ações e filtros
STATUS: PENDENTE
AGENT: hanzo
DEPENDENCIAS: TASK-040, TASK-042, TASK-046, TASK-052, TASK-053
ESCOPO: criar `ExpensesComponent` substituindo BillsComponent na rota /contas (título "Despesas"): navegação ◀ mês ▶, cards Vencidas / A pagar no mês / Pago no mês, lista agrupada Vencidas / A vencer / Pagas, botões "Paguei" e "Chegou", filtros, form/categorias via componentes filhos, catch-up de recorrência no ngOnInit, e ajustes de rótulo no menu.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §7, §8.1), .claude/context/identidade-visual.md, .claude/context/clean-code.md, src/components/bills/bills.ts, src/components/bills/bills.html, src/components/bills/bills.css, src/components/expense-form/expense-form.ts, src/components/expense-category-manager/expense-category-manager.ts, src/services/expense-service/expense-service.ts, src/services/expense-report-service/expense-report-service.ts, src/services/expense-recurrence-service/expense-recurrence-service.ts, src/services/expense-category-service/expense-category-service.ts, src/app/app.routes.ts, src/components/home/home.html
CRITERIO DE ACEITE: (1) cards e grupos vêm exclusivamente de ExpenseReportService.groupForMonth (nenhuma soma/critério de data inline no componente); cards ignoram filtros, lista aplica ExpenseReportService.applyFilters (categoria, status, "a pagar e já recebida", "revisar migração"); (2) "Paguei" abre confirmação com data (default hoje) e forma de pagamento opcional; "Chegou" aparece só para categoria custo_producao sem goodsReceivedDate; encerrar recorrência disponível em despesa de série; excluir com modal; (3) rota /contas aponta para ExpensesComponent com o mesmo guard/data.module 'contas'; título e card do menu da home dizem "Despesas"; hoje = ExpenseScheduleService.toDateKey(new Date()); erros de escrita em try/catch com notif; (4) layout mobile (`expenses-mobile.css`) com cards empilhados e botões acessíveis.
ARQUIVOS PERMITIDOS: src/components/expenses/expenses.ts, src/components/expenses/expenses.html, src/components/expenses/expenses.css, src/components/expenses/expenses-mobile.css, src/app/app.routes.ts, src/components/home/home.html
NAO FAZER: não apagar o BillsComponent (TASK-061); não calcular totais/datas inline; não mexer em product-inventory; não editar .claude/tasks.md.
RETORNO ESPERADO: arquivos + `ng build` sem erro + descrição do fluxo. Gate: style.
HISTORICO:

## TASK-055 — [TDD RED] Balanço: gastosPeriodo/resultadoFinal por despesas (competência)
STATUS: CONCLUIDA
AGENT: mike
DEPENDENCIAS: TASK-040, TASK-042
ESCOPO: ampliar product-inventory.spec.ts com testes dos getters de Balanço/Despesas do ProductInventory (mocks de ExpenseService/ExpenseCategoryService/ExpenseRecurrenceService) e confirmar RED contra a implementação atual (baseada em bills).
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §8), src/components/product-inventory/product-inventory.spec.ts, src/components/product-inventory/product-inventory.ts (linhas ~515-560, somente leitura), src/services/expense-report-service/expense-report-service.ts, src/models/expense-model.ts
CRITERIO DE ACEITE: contrato de membros do componente a testar — `despesas`, `categoriasDespesa`, `get gastosPeriodo()` (soma operacional por dueDate no período), `get custoProducaoPeriodo()`, `get gastosPorCategoria()`, `get resultadoFinal()` = faturamento − custoTotal − gastosPeriodo; casos: despesa operacional a_pagar conta; despesa paga fora do período por dueDate NÃO conta mesmo paga dentro; custo_producao não entra no Resultado nem no Gastos mas aparece em `custoProducaoPeriodo`; (2) o spec existente continua compilando com os providers novos; (3) RED por comportamento (getters ainda leem bills).
ARQUIVOS PERMITIDOS: src/components/product-inventory/product-inventory.spec.ts
NAO FAZER: não editar o componente; não remover provider de BillService/PurchaseProductService ainda; não editar .claude/tasks.md.
RETORNO ESPERADO: testes + saída RED.
HISTORICO: 2026-10-22 — mike: 12 testes RED em product-inventory.spec.ts (sem emulador): gastosPeriodo por dueDate em qualquer status, limites inclusivos, custo_producao fora, orfa operacional, centavos; custoProducaoPeriodo; resultadoFinal; gastosPorCategoria. Semeou bill pago de 999 no periodo para o RED ser honesto. Mocks de ExpenseService/Category/Recurrence adicionados; BillService/PurchaseProductService mantidos.


## TASK-056 — product-inventory.ts: lógica de Despesas/Balanço e remoção da aba Compras
STATUS: CONCLUIDA
AGENT: levi
DEPENDENCIAS: TASK-055
ESCOPO: no product-inventory.ts, trocar bills/purchaseProducts por despesas: assinar ExpenseService/ExpenseCategoryService, chamar o catch-up de recorrência, implementar os getters do contrato da TASK-055 via ExpenseReportService, `reportTab: 'vendas'|'despesas'|'balanco'|'vendedores'`, `isGastosModalOpen` + abrir/fechar, e remover aba/estado/métodos de Compras e Contas a Pagar.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §7, §8), src/components/product-inventory/product-inventory.ts, src/components/product-inventory/product-inventory.spec.ts (somente leitura), src/services/expense-report-service/expense-report-service.ts, src/services/expense-service/expense-service.ts, src/services/expense-category-service/expense-category-service.ts, src/services/expense-recurrence-service/expense-recurrence-service.ts, .claude/context/clean-code.md
CRITERIO DE ACEITE: (1) testes da TASK-055 GREEN e suíte do componente sem regressão; (2) `activeTab` sem 'compras', sem `m.compras`, sem imports/injeções de Bill/PurchaseProduct, sem `gerarBillDeProdutoCompra`, `resetFiltroContasStatusSeNecessario`, `filtroContasStatus`, `billsFiltradosRelatorio`; (3) nenhuma soma/critério de data inline: tudo via ExpenseReportService; `confirmarCompra` (entrada de estoque) preservado intacto.
ARQUIVOS PERMITIDOS: src/components/product-inventory/product-inventory.ts
NAO FAZER: não editar .html/.css (TASK-059); não alterar o spec; não alterar PurchaseService; não editar .claude/tasks.md.
RETORNO ESPERADO: diff + saída do runner. Gate: style.
HISTORICO: 2026-10-22 — levi: getters gastosPeriodo/custoProducaoPeriodo/gastosPorCategoria/resultadoFinal via ExpenseReportService; assinatura de despesas/categorias; reportTab + "despesas"; isGastosModalOpen; catch-up gerarRecorrenciasAteHoje no init (companyId da sessao, erro -> notif.warning generico). AJUSTE DO KIRA: remocao dos membros de Compras/Contas adiada para depois da TASK-059 (strictTemplates — html ainda os usa); lista de obsoletos no retorno do levi (bills, purchaseProducts, produtoCompra*, gerarBillDeProdutoCompra, filtroContasStatus, billsFiltradosRelatorio, totalContas*, avancarStatusBill, billStatusLabel, formatBillDate, recurrenceLabel, *Compra* modal/form, activeTab compras, reportTab contas, injecoes BillService/PurchaseProductService). Bloqueio intermediario: TenantService sem provider no spec -> mike adicionou mock + 2 RED do catch-up. Runner 37/37. style APROVADO; ressalvas: subscriptions sem cleanup (padrao do componente inteiro — task futura), reformat do spec veio do prettier do mike na 055.


## TASK-057 — [TDD GREEN] Balanço por despesas
STATUS: PENDENTE
AGENT: mike
DEPENDENCIAS: TASK-056
ESCOPO: rodar (sem reescrever) o spec do ProductInventory e a suíte completa; confirmar GREEN ou relatório de bug.
FLUXO: Implementacao
CONTEXTO A LER: src/components/product-inventory/product-inventory.spec.ts
CRITERIO DE ACEITE: (1) testes da TASK-055 GREEN; (2) suíte completa sem regressão (contagem exata antes/depois).
ARQUIVOS PERMITIDOS: nenhum (somente execução)
NAO FAZER: não editar spec nem código; não editar .claude/tasks.md.
RETORNO ESPERADO: contagem e veredito.
HISTORICO:

## TASK-058 — Componentes do relatório de Despesas (pizza, barras 12 meses, modal Gastos)
STATUS: CONCLUIDA
AGENT: hanzo
DEPENDENCIAS: TASK-040
ESCOPO: criar `expense-report-panel` (pizza por categoria no período + barras dos 12 meses, Chart.js) e `gastos-breakdown-modal` (breakdown operacional + bloco separado "já incluso no CMV" só informativo), recebendo dados por @Input.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §8.2), .claude/context/identidade-visual.md, .claude/context/clean-code.md, src/services/expense-report-service/expense-report-service.ts, src/models/expense-model.ts, src/components/product-inventory/product-inventory.ts (linhas ~680-830: padrão de render/destroy de Chart.js)
CRITERIO DE ACEITE: (1) painel usa ExpenseReportService.breakdownPorCategoria e monthlyTotals (nenhuma agregação própria); pizza mostra tag de tipo; Charts destruídos no ngOnDestroy/ngOnChanges; (2) modal lista só categorias operacionais com total e %, e um bloco visualmente distinto rotulado "já incluso no CMV" com o custo de produção; (3) cores da paleta da identidade; dark/light; mobile ok.
ARQUIVOS PERMITIDOS: src/components/expense-report-panel/expense-report-panel.ts, src/components/expense-report-panel/expense-report-panel.html, src/components/expense-report-panel/expense-report-panel.css, src/components/gastos-breakdown-modal/gastos-breakdown-modal.ts, src/components/gastos-breakdown-modal/gastos-breakdown-modal.html, src/components/gastos-breakdown-modal/gastos-breakdown-modal.css
NAO FAZER: não editar product-inventory; não consultar Firestore (só @Input); não editar .claude/tasks.md.
RETORNO ESPERADO: arquivos + contrato de @Input/@Output + `ng build` sem erro.
HISTORICO: 2026-10-22 — hanzo: ExpenseReportPanelComponent (rosca por categoria + barras 12 meses empilhadas por tipo) e GastosBreakdownModalComponent (operacional + bloco "Ja incluso no CMV"). style PRECISA CORRIGIR (1 rodada): prettier, sufixo Component, output close->closed + Esc. 2a revisao: APROVADO. Tolerado: cores de eixo/grade do Chart.js fixas p/ tema escuro (mesmo precedente do product-inventory).


## TASK-059 — product-inventory.html/.css: sub-aba Despesas, Balanço e modal Gastos
STATUS: PENDENTE
AGENT: hanzo
DEPENDENCIAS: TASK-056, TASK-057, TASK-058
ESCOPO: no template, remover a aba Compras e a sub-aba Contas a Pagar, adicionar a sub-aba "Despesas" (expense-report-panel), tornar o card Gastos clicável abrindo gastos-breakdown-modal, e ajustar rótulos do Balanço ("Gastos (despesas operacionais por vencimento)").
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §8), .claude/context/identidade-visual.md, .claude/context/clean-code.md, src/components/product-inventory/product-inventory.html, src/components/product-inventory/product-inventory.css, src/components/product-inventory/product-inventory.ts (somente leitura), src/components/expense-report-panel/expense-report-panel.ts, src/components/gastos-breakdown-modal/gastos-breakdown-modal.ts
CRITERIO DE ACEITE: (1) nenhuma referência no html a `compras`, `produtoCompra*`, `bills`, `reportTab === 'contas'`; (2) fórmula do Balanço mostra Faturamento − CMV − Despesas operacionais = Resultado, com nota "custos de produção já estão no CMV"; (3) `ng build` sem erro de template (strictTemplates) e mobile preservado.
ARQUIVOS PERMITIDOS: src/components/product-inventory/product-inventory.html, src/components/product-inventory/product-inventory.css
NAO FAZER: não editar o .ts nem o spec; não alterar a aba Estoque/entrada 📦; não editar .claude/tasks.md.
RETORNO ESPERADO: diff + `ng build` sem erro. Gate: style.
HISTORICO:

## TASK-060 — Remover módulo `compras` do ModuleConfig e de Configurações
STATUS: PENDENTE
AGENT: levi
DEPENDENCIAS: TASK-054, TASK-059
ESCOPO: remover `compras` do ModuleConfig/DEFAULT_MODULES e o toggle em Configurações, e renomear o rótulo do módulo `contas` para "Despesas" (descrição "Despesas e contas a pagar"), garantindo que documentos antigos com `compras` não quebrem o merge.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §11), src/models/company-config.ts, src/components/config/config.ts, src/components/config/config.html, src/services/config/config.service.ts, src/components/product-inventory/product-inventory.spec.ts (mocks com compras: true)
CRITERIO DE ACEITE: (1) `grep -r "compras" src` sem ocorrência funcional (exceto comentário de legado e a coleção `purchases`); (2) config mostra "Despesas" e não mostra "Compras"; (3) `loadCompanyModules` com doc contendo `compras: true` legado carrega sem erro e sem recriar a chave; build e suíte sem regressão.
ARQUIVOS PERMITIDOS: src/models/company-config.ts, src/components/config/config.ts, src/components/config/config.html, src/services/config/config.service.ts, src/components/product-inventory/product-inventory.spec.ts (somente remover `compras` dos mocks)
NAO FAZER: não migrar companies/*; não tocar nas regras de gestao/clientes obrigatórios; não editar .claude/tasks.md.
RETORNO ESPERADO: diff + build + suíte.
HISTORICO:

## TASK-061 — Remover código legado de Contas a Pagar e Produtos de Compra
STATUS: PENDENTE
AGENT: levi
DEPENDENCIAS: TASK-054, TASK-059, TASK-060
ESCOPO: apagar BillsComponent, BillService, BillRecurrenceService, PurchaseProductService, seus specs e models, e os providers/imports órfãos; manter intactos bills/purchaseProducts no banco, em firestore.rules, firestore.indexes.json e scripts/backfill-companyid.mjs.
FLUXO: Melhoria
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §7, §14), src/components/bills/bills.ts, src/services/bill-service/bill-service.ts, src/services/bill-recurrence-service/bill-recurrence-service.ts, src/services/purchase-product-service/purchase-product-service.ts, src/models/bill-model.ts, src/models/purchase-product-model.ts, src/app/app.routes.ts, src/components/product-inventory/product-inventory.spec.ts, src/services/test-helpers.ts
CRITERIO DE ACEITE: (1) `grep -rn "BillService\|BillRecurrenceService\|PurchaseProductService\|bill-model\|purchase-product-model\|BillsComponent" src` sem resultados; (2) `ng build` produção sem erro e suíte completa dentro de `firebase emulators:exec` 100% verde (exceto falha pré-existente AppComponent/SwUpdate, se persistir, reportada à parte) + `npm run test:rules` + `npm run test:migration` verdes; (3) `PurchaseService` e a coleção `purchases` intactos.
ARQUIVOS PERMITIDOS: src/components/bills/ (remover), src/services/bill-service/ (remover), src/services/bill-recurrence-service/ (remover), src/services/purchase-product-service/ (remover), src/models/bill-model.ts (remover), src/models/purchase-product-model.ts (remover), src/components/product-inventory/product-inventory.spec.ts, src/app/app.routes.ts
NAO FAZER: não remover bills/purchaseProducts de firestore.rules nem de firestore.indexes.json (rollback preservado até a purga em produção); não tocar em scripts/backfill-companyid.mjs; não editar .claude/tasks.md.
RETORNO ESPERADO: lista de arquivos removidos + saída de build e suítes.
HISTORICO:

## TASK-062 — seed-demo no novo modelo de Despesas
STATUS: PENDENTE
AGENT: levi
DEPENDENCIAS: TASK-047
ESCOPO: atualizar scripts/seed-demo.mjs para semear categorias padrão, despesas (a pagar, vencida, paga, parcelada, mercadoria recebida), séries recorrentes e `expenseCategories`, em vez de bills/purchaseProducts, mantendo alvo emulator/hml e recusa de PROD.
FLUXO: Melhoria
CONTEXTO A LER: scripts/seed-demo.mjs, .claude/context/regra-de-negocio.md (inteiro; §7, §8), src/models/expense-model.ts, src/models/expense-category-defaults.ts
CRITERIO DE ACEITE: (1) seed no emulador gera categorias com ids `${companyId}_${systemKey}`, despesas de todos os estados (incl. vencida, a vencer, paga, recebida, uma parcelada 3x e uma série semanal/mensal com generatedThrough) com datas date-only; (2) reexecução continua idempotente como o seed atual; (3) recusa PROD preservada.
ARQUIVOS PERMITIDOS: scripts/seed-demo.mjs
NAO FAZER: não rodar contra hml sem pedido do usuário; não alterar a migração; não editar .claude/tasks.md.
RETORNO ESPERADO: diff + saída da execução no emulador.
HISTORICO:

## TASK-063 — [MANUAL / USUARIO] Validação do módulo Despesas com a cliente em homolog
STATUS: PENDENTE
AGENT: usuario (manual; Kira apenas orienta, não executa)
DEPENDENCIAS: TASK-051, TASK-061, TASK-062
ESCOPO: publicar o hosting em hml (`npm run deploy:hosting:staging`) e validar com a cliente os fluxos de Despesas, Relatório e Balanço sobre os dados migrados.
FLUXO: Implementacao
CONTEXTO A LER: .claude/context/regra-de-negocio.md (inteiro; §7, §8, §14), docs/bills.md
CRITERIO DE ACEITE: checklist aprovado pela cliente: (1) filtro "revisar migração" lista as despesas marcadas e a cliente corrige categorias; (2) cards Vencidas / A pagar no mês / Pago no mês batem com as listas em 3 meses diferentes; (3) criar despesa única, parcelada (soma = total) e recorrente (reabrir a tela 2x não duplica); Paguei/Chegou funcionam; categoria com despesa só arquiva; (4) Resultado do Balanço = Faturamento − CMV − Despesas operacionais; Gastos abre o modal com "já incluso no CMV" separado; confirmar com a cliente as respostas dos pontos [CONFIRMAR] (reversão de pagamento, categoria de recebido sem casamento, forma de pagamento boleto/transferência, "Vencidas" global); (5) mobile conferido no celular da cliente.
ARQUIVOS PERMITIDOS: nenhum
NAO FAZER: nada em produção; Kira não faz PR para main nem deploy de produção nesta fila.
RETORNO ESPERADO: o usuário confirma no chat (aprovado/ajustes); ajustes viram novas tasks.
HISTORICO:

## TASK-064 — Extrair helpers duplicados dos services de Despesas
STATUS: PENDENTE
AGENT: levi
DEPENDENCIAS: TASK-046, TASK-056
ESCOPO: eliminar a duplicacao entre expense-service, expense-category-service e expense-recurrence-service (leitura/validacao de categoria da empresa, deteccao de permission-denied, constantes de colecao e guarda de sessao) e o codigo morto de faixa de ano no recurrence, sem mudar comportamento.
FLUXO: Melhoria
CONTEXTO A LER: .claude/context/clean-code.md, .claude/context/regra-de-negocio.md (inteiro; §7, §8.1, §10), src/services/expense-service/expense-service.ts, src/services/expense-category-service/expense-category-service.ts, src/services/expense-recurrence-service/expense-recurrence-service.ts, src/services/expense-validation/expense-validation.ts, os specs dos tres services (somente leitura)
CRITERIO DE ACEITE: (1) lerCategoriaDaEmpresa/assertCategoriaAtiva/ehNegacaoDePermissao/CODIGO_PERMISSAO_NEGADA/COLECAO_*/MSG_SEM_EMPRESA existem em um unico lugar; (2) assertDataDeNegocio e constantes ANO_* removidos do recurrence (assertDateKey ja cobre a faixa); (3) erro agregado do catch-up passa a carregar resultado parcial (RecurrenceCatchUpError com partial + failures) mantendo a mensagem; todos os specs dos tres services GREEN sem alteracao de assercao.
ARQUIVOS PERMITIDOS: os tres services, src/services/expense-validation/expense-validation.ts, novo src/services/expense-firestore-guards/expense-firestore-guards.ts
NAO FAZER: nao mudar comportamento nem mensagens verificadas pelos specs; nao alterar specs; nao editar .claude/tasks.md.
RETORNO ESPERADO: diff resumido + saida dos runners. Gate: style.
HISTORICO:
