# Módulo: Clientes (cadastro e localização)

## Visão geral

Cadastro de cliente captura a localização de entrega via mini-mapa (Google
Maps JavaScript API) em vez de CEP digitado (ViaCEP). O usuário marca a
posição exata com um pin (clique ou arraste); a geocodificação reversa
(Google Geocoding API) resolve rua/número/bairro/cidade/uf automaticamente
como preview, e tudo é persistido junto de `lat`/`lng` no cliente. A
geocodificação (direta e reversa) é centralizada num `GeocodingService`
compartilhado, também usado pela tela de Rotas de entrega.

A tela real onde isso vive é a aba **Clientes dentro de Gestão**
(`product-inventory.ts`, rota `/estoque`) — não existe uma tela dedicada de
clientes com rota própria.

## Regras de negócio implementadas

Ver `.claude/context/regra-de-negocio.md` seção 9 (Clientes) e seção 6
(Rotas de entrega). Resumo:

- Endereço estruturado (`rua`, `bairro`, `cidade`, `uf`, `cep`) nasce de
  geocodificação reversa a partir de uma posição real (`lat`/`lng`), não de
  CEP digitado. `numero` é preenchido automaticamente quando o Google
  retorna `street_number` (rooftop preciso), mas **nunca é limpo
  automaticamente** — se o Google não souber o número, ou se a
  geocodificação falhar, o que o usuário já digitou fica intacto.
  `complemento` continua 100% manual (geocodificação não resolve
  apartamento/bloco).
- Falha na geocodificação reversa **nunca bloqueia o salvamento**: `lat`/`lng`
  sempre persistem se o pin foi posicionado; só o preview de
  rua/bairro/cidade/uf/cep fica vazio e o usuário é avisado — `numero`
  também fica intacto nesse caso (ver acima).
- Pedido (`order.ts`) e rota de entrega (`delivery-route.ts`) **não têm
  mudança de contrato** — já liam `customer.lat`/`customer.lng` e já
  propagavam para `order.addressLat`/`addressLng` quando presentes.

## Modelo de dados / telas entregues

- **Model:** `Customer` (`src/models/customer-model.ts`) sem mudança de
  schema — `lat`/`lng`/`cep` já existiam, só passaram a ser efetivamente
  gravados/usados.
- **Componente:** `MapPickerComponent` (`src/components/map-picker/`) —
  presentational puro, usa `google.maps.Map`/`google.maps.Marker`
  (marker clássico, não `AdvancedMarkerElement` — esse exigiria Map ID
  configurado no Google Cloud Console). `@Input lat/lng/zoom`,
  `@Output positionChange`. Busca por texto no topo recentraliza o mapa
  (via `GeocodingService.geocode`, Nominatim); se o texto digitado casar
  com o padrão `lat, lng` (ex: `-26.978381662252843, -52.72869855561712`),
  centraliza direto na coordenada e move o pin, sem passar pelo geocoder
  (Nominatim `/search` só resolve endereço em texto, não coordenada crua).
  Sem fallback de centro dedicado: tenta geolocalização do navegador,
  senão abre num centro fixo genérico do Brasil (zoom baixo).
- **`GoogleMapsLoaderService`** (`src/services/google-maps-loader-service/`)
  — Promise cacheada que aguarda o script do Google Maps (carregado
  globalmente via `<script defer>` em `index.html`) ficar pronto, sem
  polling (escuta os eventos `load`/`error` do próprio script, com timeout
  de 15s como guard-rail). `MapPickerComponent` aguarda essa Promise antes
  de inicializar o mapa; se falhar, mostra erro amigável sem quebrar a
  tela.
- **`GeocodingService`** (`src/services/geocoding-service/`):
  - `geocode(address)` — Nominatim (OpenStreetMap), usado pela busca por
    texto do mini-mapa e pela rota de entrega (`delivery-route.ts`) quando
    um pedido não tem `addressLat`/`addressLng` salvos.
  - `reverseGeocode(lat, lng)` — Google Geocoding API. Extrai
    `rua`/`numero`/`bairro`/`cidade`/`uf`/`cep` dos `address_components`
    por `type` (não por ordem do array — a extração itera a lista de tipos
    de prioridade como loop externo, não os componentes, pra não depender
    da ordem que o Google devolve). UF vem de `short_name` do componente
    `administrative_area_level_1` (já é a sigla, ex. "SP").
  - Motivo da divergência de provedor entre os dois métodos: Nominatim é
    gratuito e supre bem o forward-geocode (endereço em texto → ponto,
    usado só pra centralizar mapa ou montar rota); a reversa (ponto →
    endereço) precisava de mais precisão pra endereço brasileiro, que o
    Google entrega melhor — o projeto já tinha uma chave de Google Maps
    configurada.
- **Chave do Google Maps:** `environment.googleMapsApiKey`
  (`src/enviroments/enviroments.ts` e `enviroments.staging.ts`, mesma
  chave que carrega o `<script>` em `index.html`). Precisa ter **Maps
  JavaScript API** e **Geocoding API** ativas no Google Cloud Console pro
  projeto dono da chave (as duas são APIs separadas — só uma habilitada
  gera `ApiNotActivatedMapError` no mapa mesmo com a reversa funcionando).
- **`delivery-route.ts`:** só injeta `GeocodingService` em vez de ter
  método privado próprio — resto do comportamento (throttle, montagem da
  URL do Google Maps, haversine) inalterado.
- **Leaflet removido por completo** (era a biblioteca original do
  mini-mapa, trocada pelo Google Maps JS API): sem dependência em
  `package.json`, sem CSS em `angular.json`, sem ícones em `public/`.

## Lacunas conhecidas / pendências

- Clientes cadastrados antes desta feature não têm `lat`/`lng` — na
  primeira edição pós-deploy, o mini-mapa abre sem pin (mesmo fallback de
  cliente novo) e o usuário precisa reposicionar manualmente. Não há
  migração retroativa automática.
- Há um erro de build pré-existente e **não relacionado** a este módulo em
  `product-inventory.ts`/`.html` (`orderNumber`/`HistoricoItem`), de
  trabalho em andamento na feature de Histórico Geral. Não foi tocado por
  nenhuma entrega deste módulo.
- `GoogleMapsLoaderService.load()` cacheia a Promise pra sempre — se o
  script falhar/der timeout uma vez, um novo mount do `MapPickerComponent`
  na mesma sessão de página herda o erro antigo em vez de tentar de novo.
  Não é bug bloqueante (recarregar a página resolve), sinalizado pelo
  style na revisão, sem task aberta pra corrigir ainda.

## O que cada agent entregou

- **killua**: arquitetura das duas rodadas — desenho original do
  `MapPickerComponent`/`GeocodingService` (PR #1), e depois o desenho da
  troca de motor pra Google Maps JS (mapeamento método a método
  Leaflet→Google, escolha de marker clássico sobre `AdvancedMarkerElement`
  pra não depender de Map ID, estratégia de carregamento do SDK via
  `GoogleMapsLoaderService`).
- **hanzo**: `MapPickerComponent` (as duas versões), reforma da aba
  Clientes em `product-inventory.ts/html`, remoção da tela morta
  `src/components/customers/` (nunca teve rota registrada — achado
  descoberto só depois do primeiro merge, corrigido no PR #2), wiring do
  preenchimento automático de `numero`.
- **levi**: `GeocodingService` completo — extração original (Nominatim
  reverso), depois migração da reversa pra Google Geocoding API, extração
  de `street_number`.
- **style**: gate em todas as rodadas. Achados reais ao longo do módulo:
  payload de `save()` gravando `lat`/`lng` como `undefined` (Firestore
  rejeita em runtime — corrigido com spread condicional, mesmo padrão já
  usado em `order.ts`); ordem de prioridade errada na extração de
  componentes de endereço do Google (`.find()`+`.some()` dependia da ordem
  do array de resposta em vez da prioridade declarada — corrigido
  invertendo os loops); duplicação de `setCenter`+`setZoom` em 5 pontos do
  `MapPickerComponent` pós-migração pro Google Maps (extraído método
  `centerMap`).

## Notas operacionais

- **PR #1** — mini-mapa + geocodificação reversa (Nominatim), aplicado por
  engano em `src/components/customers/`, tela sem rota registrada
  (código morto, nunca esteve acessível pro usuário).
- **PR #2** — correção: mesmo tratamento aplicado na tela real (aba
  Clientes dentro de Gestão, `product-inventory.ts`), remoção da tela
  morta do PR #1. Também corrigiu um `package-lock.json` fora de
  sincronia (`@popperjs/core` faltando, regressão de um `npm install
  --legacy-peer-deps` rodado durante o PR #1).
- **PR #3** — melhoria: reverse geocoding migrado de Nominatim pra Google
  Geocoding API (precisão de endereço brasileiro); motor visual do
  mini-mapa migrado de Leaflet pra Google Maps JS API (marker clássico);
  preenchimento automático de `numero` via `street_number` do Google.
  Troca de chave do Google Maps no meio do ciclo (a primeira chave só
  tinha Geocoding API ativa, sem Maps JavaScript API, causando
  `ApiNotActivatedMapError` no mapa visual).
- Todos os três PRs tiveram merge limpo (fast-forward, sem conflito),
  confirmado por análise pós-merge sem divergência entre revisado e
  mergeado. Branches locais e remotas apagadas após cada merge.
- **PR #10** — correção: busca no `MapPickerComponent` não reconhecia
  coordenada `lat, lng` digitada direto (só endereço em texto via
  Nominatim), então centralizar num ponto específico via busca não
  funcionava. Adicionado reconhecimento por regex antes de cair no
  geocoder. Sem mudança de regra de negócio. Testado: `tsc --noEmit`,
  `build:staging`, suíte completa (105/105) contra emulador Firestore/Auth.
  Publicado em staging antes do merge; merge em `main` disparou o deploy
  automático de produção (`firebase-hosting-merge.yml`, projeto
  `projetosfelipe-9e458`) com sucesso. Merge limpo (fast-forward),
  confirmado por análise pós-merge sem divergência. Branch apagada após o
  merge.
- **PR #11** — melhoria: cliente sem endereço identificado pela
  geocodificação reversa (área rural, ponto sem cadastro no provedor de
  mapas) mostrava os campos readonly Rua/Bairro/Cidade vazios e
  acinzentados, parecendo formulário quebrado — `salvarCliente()` já
  aceitava gravar só com `lat`/`lng` (só `name` é obrigatório), o problema
  era puramente visual. Novo getter `clienteEnderecoDisponivel` esconde o
  bloco de endereço quando nada foi resolvido, mostrando em vez disso um
  campo opcional de "Referência" (reaproveita `clienteComplemento`, já
  persistido) + aviso de que dá pra salvar assim mesmo. Card da lista de
  clientes passou a indicar "📍 Localização no mapa" quando há `lat`/`lng`
  sem `cidade`/`address` (antes não mostrava nada nesse caso). Review
  (skill `code-review`) encontrou 3 achados reais na primeira versão —
  todos com a mesma causa raiz (estado não limpo na falha do reverse
  geocode): `clienteNumero`/`clienteComplemento` órfãos persistidos ao
  mover o pin de uma posição resolvida pra uma sem endereço, e endereço
  parcial (só rua, sem bairro/cidade) ainda reproduzindo o bug original
  num subconjunto de casos — todos corrigidos antes do merge. Testado:
  build limpo, `product-inventory.spec.ts` isolado 12/12 GREEN (achado à
  parte, não deste PR: `order.spec.ts` tem um teste `[RED]`
  pré-existente — `requiresInstallments`, nunca implementado em
  `OrdersComponent` — que deixa a suíte completa flaky no build
  incremental do karma). Merge limpo, branch apagada.
- **PR #12** — correção: CSP (header de segurança introduzido em
  20/08/2026, hardening geral) só liberava `script-src` pra
  `https://maps.googleapis.com`; o loader do Google Maps JS API busca
  chunks adicionais de `maps.gstatic.com` (desde ~v3.44), faltando essa
  origem. Adicionado `maps.gstatic.com` a `script-src`/`connect-src` e
  `worker-src 'self' blob:` em `firebase.json`. **Não era a causa raiz**
  do "Esta página não carregou o Google Maps corretamente" relatado pelo
  usuário — diagnosticado via teste isolado da API key com Chrome
  headless (fora da aplicação, sem os headers CSP do app): erro real era
  `BillingNotEnabledMapError`, projeto `projetosfelipe-9e458` sem conta de
  faturamento vinculada no Google Cloud, resolvido pelo usuário
  diretamente no Cloud Console (fora do escopo do repo). O fix de CSP
  ficou de qualquer forma — é a recomendação oficial do Google e uma
  correção real, só não era o bug relatado. Confirmado corrigido nos dois
  lados: usuário reportou funcionando, reteste isolado da chave retornou
  `MAP_INIT_OK` sem erro. Header CSP conferido via `curl -I` em staging e
  produção após deploy. Merge limpo, branch apagada.
