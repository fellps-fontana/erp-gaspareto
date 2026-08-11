# Módulo: Clientes (cadastro e localização)

## Visão geral

Cadastro de cliente captura a localização de entrega via mini-mapa
(Leaflet + OpenStreetMap) em vez de CEP digitado (ViaCEP). O usuário marca a
posição exata com um pin (clique ou arraste); a geocodificação reversa
(Nominatim) resolve rua/bairro/cidade/uf automaticamente como preview, e
tudo é persistido junto de `lat`/`lng` no cliente. A geocodificação
(direta e reversa) foi consolidada num `GeocodingService` compartilhado,
também usado pela tela de Rotas de entrega — antes a integração com
Nominatim existia duplicada como método privado em `delivery-route.ts`.

## Regras de negócio implementadas

Ver `.claude/context/regra-de-negocio.md` seção 9 (Clientes) e seção 6
(Rotas de entrega). Resumo:

- Endereço estruturado (`rua`, `bairro`, `cidade`, `uf`, `cep`) nasce de
  geocodificação reversa a partir de uma posição real (`lat`/`lng`), não
  de CEP digitado. `numero`/`complemento` continuam manuais — geocodificação
  não resolve número de residência.
- Falha na geocodificação reversa **nunca bloqueia o salvamento**: `lat`/`lng`
  sempre persistem se o pin foi posicionado; só o preview de
  rua/bairro/cidade/uf fica vazio e o usuário é avisado.
- Pedido (`order.ts`) e rota de entrega (`delivery-route.ts`) **não mudaram
  de contrato** — já liam `customer.lat`/`customer.lng` e já propagavam
  para `order.addressLat`/`addressLng` quando presentes. A feature fechou
  o buraco de quem nunca gravava esses campos no cadastro (o `save()` de
  clientes simplesmente não incluía `lat`/`lng` no payload até agora).

## Modelo de dados / telas entregues

- **Model:** `Customer` (`src/models/customer-model.ts`) sem mudança de
  schema — `lat`/`lng`/`cep` já existiam, só passaram a ser efetivamente
  gravados/usados.
- **Componente novo:** `MapPickerComponent`
  (`src/components/map-picker/`) — presentational puro (Leaflet direto,
  sem wrapper Angular), `@Input lat/lng/zoom`, `@Output positionChange`.
  Busca por texto no topo recentraliza o mapa (via `geocode` direto) sem
  criar/mover o pin sozinho. Sem fallback de centro dedicado: tenta
  geolocalização do navegador, senão abre num centro fixo genérico do
  Brasil (zoom baixo).
- **Serviço novo:** `GeocodingService`
  (`src/services/geocoding-service/`) — `geocode(address)` (movido sem
  mudança de comportamento do que já existia em `delivery-route.ts`) e
  `reverseGeocode(lat, lng)` (novo). UF extraída via `ISO3166-2-lvl4` do
  Nominatim, não por nome de estado.
- **Tela alterada:** `src/components/customers/` — fluxo de CEP
  (`onCepInput`/`fetchCep`) removido, substituído por `<app-map-picker>` +
  `onMapPositionChange`. Campo CEP não é mais input do usuário na UI.
- **`delivery-route.ts`:** só trocou o método privado de geocodificação
  pela injeção do `GeocodingService` — resto do comportamento (throttle,
  montagem da URL do Google Maps, haversine) inalterado.
- Ícones do marker Leaflet servidos em `public/leaflet/`.

## Lacunas conhecidas / pendências

- Clientes cadastrados antes desta feature não têm `lat`/`lng` — na
  primeira edição pós-deploy, o mini-mapa abre sem pin (mesmo fallback de
  cliente novo) e o usuário precisa reposicionar manualmente. Não há
  migração retroativa automática.
- Há um erro de build pré-existente e **não relacionado** a este módulo em
  `product-inventory.html` (`Property 'numero' does not exist on type
  'HistoricoItem'`), aparentemente de trabalho em andamento na feature de
  Histórico Geral já em `homologacao`. Não foi tocado por esta entrega.

## O que cada agent entregou

- **killua**: arquitetura — decisão de Leaflet+OSM (evita dependência de
  billing do Google Maps JS API, cujo script órfão em `src/index.html` foi
  identificado mas deixado fora de escopo), consolidação da geocodificação
  num serviço único, contrato do `MapPickerComponent` e do
  `GeocodingService`, fluxo de fallback de erro.
- **hanzo**: `MapPickerComponent`, reforma de `customers.ts/html/css`
  (remoção do fluxo CEP, integração do mini-mapa, busca por texto).
- **levi**: `GeocodingService` (extração + `reverseGeocode` novo),
  refatoração de `delivery-route.ts`.
- **style**: revisão completa (7 critérios) — 1 achado bloqueante na
  primeira rodada (payload de `save()` gravava `lat`/`lng` como
  `undefined`, o que o Firestore rejeita em runtime, quebrando salvar
  cliente novo sem tocar no mapa ou editar cliente antigo sem lat/lng
  prévio). Corrigido por hanzo com o mesmo padrão de spread condicional já
  usado em `order.ts` para `addressLat`/`addressLng`; reaprovado na
  segunda rodada.

## Notas operacionais

- PR #1 (`worktree-customer-map-picker-homolog` → `homologacao`), merge
  limpo (fast-forward, sem conflito), branch local e remota apagadas após
  a análise pós-merge não encontrar divergência entre o que foi revisado e
  o que de fato chegou em `homologacao`.
