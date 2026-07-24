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
STATUS: PENDENTE
AGENT: levi
DEPENDENCIAS: TASK-001, TASK-002
FLUXO: Melhoria
CONTEXTO A LER: regra-de-negocio.md seção 11 (Configuração por empresa revisada); src/services/config/config.service.ts (arquivo atual, inteiro)
ESCOPO: trocar a leitura/escrita fixa em config/company pela leitura/escrita em companies/{tenant.companyId()}, mantendo a mesma API pública (signal modules, modules$, updateModules) pro resto do app não quebrar.
CRITERIO DE ACEITE: modules() reflete o doc da empresa da sessão atual; troca de empresa (logout/login em outra conta) atualiza modules() sem reload da página; merge com DEFAULT_MODULES continua funcionando pra módulos novos.
ARQUIVOS PERMITIDOS: src/services/config/config.service.ts
NAO FAZER: não alterar company-config.ts (DEFAULT_MODULES/ModuleConfig continuam iguais).
RETORNO ESPERADO: diff do service.

## TASK-008 — Adicionar companyId nos 8 models existentes
STATUS: PENDENTE
AGENT: levi
DEPENDENCIAS: vazio
FLUXO: Melhoria
CONTEXTO A LER: regra-de-negocio.md seção 10 (campo companyId, motivo); schema.dbml atualizado (tabelas com company_id)
ESCOPO: adicionar o campo obrigatório `companyId: string` na interface principal de cada um dos 8 models — atenção aos nomes de arquivo reais, que não batem 1:1 com o nome da entidade: Product→product-model.ts, Sale→sell-model.ts, Comanda→comanda-model.ts, Order→order-model.ts, Bill→bill-model.ts, Customer→customer-model.ts, Purchase→buy-model.ts, PurchaseProduct→purchase-product-model.ts.
CRITERIO DE ACEITE: campo adicionado só na interface do documento raiz de cada um (nunca nos itens embutidos como SaleItem/OrderItem/ComandaItem); projeto compila.
ARQUIVOS PERMITIDOS: src/models/product-model.ts, src/models/sell-model.ts, src/models/comanda-model.ts, src/models/order-model.ts, src/models/bill-model.ts, src/models/customer-model.ts, src/models/buy-model.ts, src/models/purchase-product-model.ts
NAO FAZER: não renomear nenhum arquivo (a inconsistência de nome é conhecida e documentada em stack.md — não corrigir aqui).
RETORNO ESPERADO: diff dos 8 arquivos.

## TASK-009 — [TDD RED] Testes de isolamento companyId nos 8 services
STATUS: PENDENTE
AGENT: mike
DEPENDENCIAS: TASK-002, TASK-008
FLUXO: Implementacao
CONTEXTO A LER: regra-de-negocio.md seção 10 (classificação CRÍTICA e o porquê); os 8 services atuais em src/services/*/*.ts (comportamento hoje, sem filtro)
ESCOPO: escrever testes (Jasmine/Karma, ou suíte parametrizada) provando que cada getX() dos 8 services monta a query com where('companyId','==', tenant.companyId()) e que cada addX() grava companyId no payload — um teste por service ou suíte única cobrindo os 8, a critério de mike.
CRITERIO DE ACEITE: existe cobertura de teste pros 8 services (get + add); os testes rodam e falham (RED) por lógica ausente no código atual (sem filtro/stamp de companyId), nunca por erro de compilação.
ARQUIVOS PERMITIDOS: arquivos *.spec.ts novos, um por service, na mesma pasta do service correspondente (ex.: src/services/product-service/product-service.spec.ts)
NAO FAZER: não alterar nenhum arquivo de service (isso é TASK-010 a TASK-017). Se a infraestrutura de teste (mock de Firestore/emulator) não existir no projeto, resolver com o mínimo necessário e sinalizar o gap no retorno — não instalar dependência nova sem reportar.
RETORNO ESPERADO: lista dos arquivos de teste criados + confirmação de RED (motivo da falha) por service.

## TASK-010 — Isolamento companyId: product-service
STATUS: PENDENTE
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
STATUS: PENDENTE
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
STATUS: PENDENTE
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
STATUS: PENDENTE
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
STATUS: PENDENTE
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
STATUS: PENDENTE
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
STATUS: PENDENTE
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
STATUS: PENDENTE
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
STATUS: PENDENTE
AGENT: mike
DEPENDENCIAS: TASK-010, TASK-011, TASK-012, TASK-013, TASK-014, TASK-015, TASK-016, TASK-017
FLUXO: Implementacao
CONTEXTO A LER: os 8 arquivos .spec.ts criados na TASK-009
ESCOPO: rodar novamente (não reescrever) os testes da TASK-009 contra os 8 services implementados, confirmar GREEN.
CRITERIO DE ACEITE: os 8 conjuntos de teste passam; qualquer falha remanescente é reportada como bug pontual (service e motivo), não reescrita de teste.
ARQUIVOS PERMITIDOS: nenhum (só execução)
NAO FAZER: não alterar nenhum arquivo de teste nem de service.
RETORNO ESPERADO: relatório GREEN/FAIL por service; se houver FAIL, relatório de bug pro Kira redespachar ao levi correspondente.

## TASK-019 — Atualizar mocks para aceitar companyId
STATUS: PENDENTE
AGENT: levi
DEPENDENCIAS: TASK-008, TASK-010, TASK-011, TASK-012, TASK-013, TASK-014, TASK-015, TASK-016, TASK-017
FLUXO: Melhoria
CONTEXTO A LER: stack.md (modo useMock); os 8 arquivos de mock em src/mocks/*.ts e src/mocks/core/*.ts (padrão atual de InMemoryCollection)
ESCOPO: ajustar os 8 mocks (product/sale/comanda/order/bill/customer/purchase/purchase-product) e o config-service-mock pra aceitar/ignorar o parâmetro companyId sem quebrar a assinatura usada pelos services reais, garantindo que o modo useMock continue funcionando fim a fim.
CRITERIO DE ACEITE: app roda normalmente com environment.useMock=true após a mudança dos 8 services reais; nenhum mock lança erro por parâmetro companyId inesperado.
ARQUIVOS PERMITIDOS: src/mocks/product-service-mock.ts, src/mocks/sale-service-mock.ts, src/mocks/comanda-service-mock.ts, src/mocks/order-service-mock.ts, src/mocks/bill-service-mock.ts, src/mocks/customer-service-mock.ts, src/mocks/purchase-service-mock.ts, src/mocks/purchase-product-service-mock.ts, src/mocks/config-service-mock.ts, src/mocks/core/in-memory-collection.ts, src/mocks/core/mock-database.ts
NAO FAZER: não alterar os arquivos de seed em src/mocks/data/ nesta task, a menos que sejam estritamente necessários pra não quebrar o build (se precisar, reportar).
RETORNO ESPERADO: diff dos mocks alterados.

## TASK-020 — [TDD RED] Testes de firestore.rules
STATUS: PENDENTE
AGENT: mike
DEPENDENCIAS: TASK-001, TASK-008
FLUXO: Implementacao
CONTEXTO A LER: regra-de-negocio.md seção 10 (CRÍTICA); regra completa proposta na especificação multi-tenant (seção 6); firestore.rules atual (allow read write if true)
ESCOPO: escrever testes de regra de segurança (via @firebase/rules-unit-testing contra o emulator do Firestore) provando que: leitura/escrita cross-tenant é negada, leitura/escrita same-tenant é permitida, escrita em users/{uid} pelo cliente é sempre negada.
CRITERIO DE ACEITE: testes rodam e falham (RED) porque a regra atual ainda libera tudo (if true); ao menos 1 caso de negação cross-tenant e 1 caso de permissão same-tenant por coleção operacional relevante.
ARQUIVOS PERMITIDOS: firestore.rules.spec.ts (novo, raiz ou pasta de teste dedicada — mike decide o caminho e reporta), package.json (só se precisar adicionar @firebase/rules-unit-testing como devDependency)
NAO FAZER: se @firebase/rules-unit-testing não estiver disponível/instalável no ambiente, não forçar — reportar o gap ao Kira em vez de decidir sozinho instalar dependência nova sem aviso (gap já sinalizado em regra-de-negocio.md seção 12).
RETORNO ESPERADO: arquivo de teste criado + confirmação de RED, ou relatório do gap de tooling se não for viável rodar agora.

## TASK-021 — firestore.rules novo
STATUS: PENDENTE
AGENT: levi
DEPENDENCIAS: TASK-018, TASK-020
FLUXO: Implementacao
CONTEXTO A LER: regra-de-negocio.md seção 10 (CRÍTICA); especificação multi-tenant seção 6 (regra completa, base a ajustar pros nomes reais de coleção); firestore.rules.spec.ts da TASK-020
ESCOPO: substituir o allow read write if true pela regra de isolamento por companyId, cobrindo companies/{id}, users/{uid} e as 8 coleções operacionais, usando exatamente os nomes de coleção reais do código (products, sales, orders, comandas, bills, customers, purchases, purchaseProducts).
CRITERIO DE ACEITE: testes da TASK-020 ficam GREEN; nomes de coleção na regra batem com os usados nos services (não com os nomes da especificação genérica, ex. sales não sells).
ARQUIVOS PERMITIDOS: firestore.rules
NAO FAZER: não alterar firestore.rules.spec.ts. Publicar/deployar a regra só depois de TASK-018 confirmado GREEN (services já gravam companyId em toda escrita) — regra publicada antes disso bloqueia o app em produção.
RETORNO ESPERADO: conteúdo final de firestore.rules.

## TASK-022 — [TDD GREEN] Confirmar firestore.rules
STATUS: PENDENTE
AGENT: mike
DEPENDENCIAS: TASK-021
FLUXO: Implementacao
CONTEXTO A LER: firestore.rules.spec.ts da TASK-020
ESCOPO: rodar novamente os testes de regra contra o firestore.rules novo, confirmar GREEN.
CRITERIO DE ACEITE: todos os casos de negação cross-tenant e permissão same-tenant passam.
ARQUIVOS PERMITIDOS: nenhum (só execução)
NAO FAZER: não reescrever os testes nem a regra.
RETORNO ESPERADO: relatório GREEN/FAIL; se FAIL, relatório de bug pro Kira redespachar ao levi.

## TASK-023 — [FASE 2 / OPCIONAL] Cloud Function de custom claims
STATUS: PENDENTE
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
STATUS: PENDENTE
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
STATUS: PENDENTE
AGENT: levi
DEPENDENCIAS: vazio
FLUXO: Correcao
CONTEXTO A LER: src/components/order/order.ts (métodos loadData, updateFilter, propriedade sortOrder já implementada)
ESCOPO: ajustar loadData()/orders$ para que o filtro "Todos" use uma fonte que inclua pedidos finished/canceled (hoje usa getPendingOrders(), que os exclui), sem alterar a ordenação recente/antigo que já existe e já funciona.
CRITERIO DE ACEITE: com filtro "Todos" e ordenação "Mais antigo" selecionados, pedidos com status finished e canceled aparecem na lista, ordenados do mais antigo pro mais recente; filtros "Pendente" e "Entregues" continuam com o comportamento atual (não regredir).
ARQUIVOS PERMITIDOS: src/components/order/order.ts
NAO FAZER: não alterar order.html, order-service.ts nem a lógica de sortOrder (recent/oldest) — ela já existe e já está correta, o gap é só na fonte de dados do filtro "Todos".
RETORNO ESPERADO: diff do componente.
