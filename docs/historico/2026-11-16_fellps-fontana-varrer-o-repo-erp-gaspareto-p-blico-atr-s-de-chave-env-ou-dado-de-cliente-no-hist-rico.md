# fellps-fontana/Varrer-o-repo-erp-gaspareto-público-atrás-de-chave-.env-ou-dado-de-cliente-no-histórico
- Periodo: 2026-11-16 -> 2026-11-16
- Sessoes: SESSAO: 2026-11-16 10:40
- Fluxo: Melhoria

## Demanda
Varrer o historico do repo publico atras de chave, .env ou dado de cliente. Achado principal:
chave do Google Maps sem restricao (Geocoding respondia OK de qualquer origem). Pedido: corrigir
o que e codigo e preparar o front para a chave ser restrita por HTTP referrer.

## Tasks
### (inline) — Higiene do repo publico
- Agent: Kira (tarefa minima)
- Status final: CONCLUIDA
- Voltou da revisao: nao
- Observacao: .gitignore com .env*, .firebase/, .claude/worktrees/; cache do Hosting e gitlinks fora do indice; coordenadas possivelmente reais (link de WhatsApp) trocadas por ponto generico em Chapeco. Spec do map-picker 38/38.

### TASK-063 — reverseGeocode via google.maps.Geocoder
- Agent: hanzo
- Status final: CONCLUIDA
- Voltou da revisao: 1x (style — spec sem casos de zero resultados, timeout e Geocoder ausente; 5000 magico; checagem redundante de results)
- Observacao: 2a rodada aprovada, 6/6 no spec novo.

## Entrega por agent
- hanzo: reverseGeocode trocado de fetch REST (chave na URL) para google.maps.Geocoder; constante REVERSE_GEOCODE_TIMEOUT_MS; spec novo com 6 casos.
- style: cobrou cobertura de timeout/zero resultados/Geocoder ausente e numero magico; aprovou na 2a rodada.
- gon: nao despachado — mudanca reduz exposicao, sem input/auth/dependencia nova.
- Kira: varredura do historico (288 commits, todas as refs), higiene inline, documentacao. Suite completa 1029/1029 nos emuladores.

## Decisoes
- Nao reescrever o historico: as chaves expostas sao de browser (publicas por desenho); a protecao e restricao no GCP.
- Geocoder do Maps JS em vez da Geocoding REST — a REST recusa chave restrita por referrer.
- docs/clientes.md (formato antigo) movido para docs/backend/clientes.md.

## Pendencias / debito tecnico
- Manual no GCP (nao versionado): restringir a chave do front por referrer (prod, homolog, localhost:4200) + APIs (Maps JavaScript, Geocoding) + cota; restringir o secret GOOGLE_GEOCODING_API_KEY por API + cota; apagar a chave antiga AIzaSyBRa... se nao usada. Restricao por referrer so depois do deploy em prod desta branch.
- Coordenadas antigas e chaves continuam no historico git (sem rewrite).
- Nao validado no navegador com a chave real (cobertura via specs com Google mockado) — testar em homolog.

## Documentacao atualizada
- docs/backend/clientes.md — movido de docs/clientes.md; reverseGeocode via Maps JS Geocoder; orientacao de restricao das chaves; pendencia atualizada.

## Commits
```
467482d refactor(geocoding): reverseGeocode via google.maps.Geocoder
3c41a4f chore(seguranca): higiene do repo publico
```

## Arquivos alterados
```
 .claude/worktrees/multi-tenant-context             |   1 -
 .claude/worktrees/objective-rubin-4857d0           |   1 -
 .firebase/hosting.ZGlzdFxlcnAtZ2FzcGFyZXRv.cache   |  20 ----
 ...sting.ZGlzdFxlcnAtZ2FzcGFyZXRvXGJyb3dzZXI.cache |  23 -----
 .gitignore                                         |   9 ++
 src/components/map-picker/map-picker.spec.ts       |  20 ++--
 src/components/map-picker/map-picker.ts            |   2 +-
 .../geocoding-service/geocoding-service.spec.ts    | 102 +++++++++++++++++++++
 .../geocoding-service/geocoding-service.ts         |  44 ++++-----
 9 files changed, 141 insertions(+), 81 deletions(-)
 docs/backend/clientes.md (movido de docs/clientes.md + atualizado)
```
