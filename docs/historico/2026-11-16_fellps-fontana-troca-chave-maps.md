# fellps-fontana/troca-chave-maps
- Periodo: 2026-11-16 -> 2026-11-16
- Sessoes: SESSAO: 2026-11-16 10:40
- Fluxo: Correcao

## Demanda
Continuacao do PR #50/#51. A chave do Google Maps do front (`…WL98`) era de outra conta Google
e nao podia ser restringida. O usuario criou uma chave nova no projeto `projetosfelipe-9e458`,
restrita por referrer (dominios do Hosting de prod/homolog + localhost:4200) e por API (Maps JavaScript + Geocoding).

## Tasks
### (inline) — Troca da chave do Maps
- Agent: Kira (tarefa minima: troca de string em 3 arquivos)
- Status final: CONCLUIDA
- Voltou da revisao: nao
- Observacao: chave nova testada antes da troca. Geocoding REST sem referrer: REQUEST_DENIED. Maps JS com referrer de prod: carrega. Deploy em homolog d55ccb5.

## Entrega por agent
- Kira: troca da chave em index.html e environments, deploy homolog, documentacao.

## Decisoes
- Chave propria do ERP no projeto de prod, em vez de tentar restringir a chave da outra conta.

## Pendencias / debito tecnico
- A chave antiga continua ativa, sem restricao, na outra conta, e presente no historico git publico. O custo de uso e do dono dessa conta.
- Cota diaria da Geocoding no projeto de prod: configuracao manual, a conferir.

## Documentacao atualizada
- docs/backend/clientes.md — dono da chave e pendencias atualizados.

## Commits
```
d55ccb5 fix(maps): troca chave do Google Maps por chave do projeto de prod, restrita por referrer
```

## Arquivos alterados
```
 src/enviroments/enviroments.staging.ts | 2 +-
 src/enviroments/enviroments.ts         | 2 +-
 src/index.html                         | 2 +-
 3 files changed, 3 insertions(+), 3 deletions(-)
```
