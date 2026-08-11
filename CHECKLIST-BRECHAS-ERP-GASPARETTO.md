# Checklist de Brechas e Pontos em Aberto — ERP Gasparetto

> Levantado a partir da análise direta do código-fonte (`src/services`, `src/models`, `firestore.rules`, `app.config.ts`). Cada item abaixo é algo que hoje **funciona sem controle, sem confirmação ou de forma inconsistente**. Marque conforme for revisando com o Felipe/Gasparetto.

---

## 🔴 Segurança (prioridade alta)

- [ ] **Firestore totalmente aberto.** `firestore.rules` tem `allow read, write: if true;` — qualquer pessoa com a URL do projeto consegue ler e escrever em qualquer coleção (produtos, vendas, clientes, contas), sem login. Isso vale tanto para uso normal quanto para adulteração maliciosa de estoque/preço/vendas.
  - *Ação sugerida:* decidir se o sistema vai ganhar autenticação (item abaixo) antes de travar as regras, ou travar as regras já com uma chave/PIN simples como paliativo.

- [ ] **Login configurado mas não implementado.** `provideAuth`/`getAuth()` estão registrados em `app.config.ts`, mas nenhum componente ou guard usa autenticação. Não existe tela de login.
  - *Ação sugerida:* confirmar se autenticação é requisito real (ex.: diferenciar operador de caixa x dono) ou se o sistema é para ficar sempre "aberto" num tablet fixo do estabelecimento.

- [ ] **Controle de acesso hoje é só visual.** Módulos habilitados/desabilitados via `ConfigService` (tela de Configurações) escondem telas, mas não impedem acesso direto às coleções do Firestore por fora do app.

- [ ] **Chave da Google Maps Places API exposta sem restrição visível** em `index.html`. Confirmar no Google Cloud Console se essa chave tem restrição por domínio/referrer — senão pode ser usada por terceiros e gerar custo.

---

## 🟡 Regras de negócio com comportamento não confirmado

- [ ] **Custo do produto (`buyPrice`) é sempre o da última compra**, não uma média ponderada. Se o fornecedor variar muito o preço, o custo mostrado nos relatórios pode não refletir a realidade do estoque atual.
  - *Pergunta para o dono:* isso é aceitável ou o cálculo deveria ser por média ponderada (custo médio)?

- [ ] **Rótulo de status de conta inconsistente.** No banco, o status intermediário de uma conta é `'recebido'`, mas na tela ele aparece como **"A Pagar"** — nomes trocados entre código e UI.
  - *Pergunta para o dono:* isso é só um nome de campo mal escolhido (sem impacto) ou já causou confusão na prática?

- [ ] **Comanda fechada não vira venda automaticamente.** Não há, no código, nenhuma rotina que transforme uma comanda fechada (`status: 'closed'`) em um registro de venda (`sales`). O estoque já sai quando o item é lançado na comanda, mas não há confirmação de que o valor da comanda entra no relatório de vendas/faturamento.
  - *Pergunta para o dono:* o fechamento de comanda deveria gerar uma venda formal (para entrar nos relatórios de faturamento)? Se sim, é uma lacuna real a corrigir.

- [ ] **Conta recorrente não gera a próxima ocorrência sozinha.** O campo `recurring` + `recurrencePeriod` existe em `bills` e `purchaseProducts`, mas não há rotina automática que crie a conta do mês/semana seguinte — hoje é só um campo informativo.
  - *Pergunta para o dono:* contas recorrentes (aluguel, fornecedor fixo) precisam ser lançadas manualmente toda vez, ou espera-se geração automática?

- [ ] **Sistema é single-tenant** (documento único `config/company` no Firestore), apesar do nome "company" sugerir suporte a múltiplas empresas.
  - *Pergunta para o dono:* existe plano de vender/replicar esse ERP para outros clientes (multi-tenant) no futuro? Se sim, vale planejar a migração de schema antes de crescer mais.

---

## 🟢 Qualidade / manutenção (menor urgência, mas acumula risco)

- [ ] **Sem testes automatizados** cobrindo as regras críticas (baixa de estoque, transição de status de pedido, cálculo de total). Qualquer alteração futura nessas áreas pode quebrar algo sem que ninguém perceba até o uso real.

- [ ] **Sem identidade visual formal (logo).** Não foi encontrado logo/favicon customizado no projeto além da paleta de cores em CSS — só ícones de emoji Unicode são usados como iconografia.
  - *Pergunta para o dono:* existe logo oficial da marca que deveria estar no app (tela inicial, PWA, favicon)?

- [ ] **Nomenclatura de arquivos de service é inconsistente** (`bill-service.ts` vs `config.service.ts`) — não é um risco de negócio, mas dificulta manutenção por quem só olhar a estrutura de pastas depois.

---

## Como usar este checklist

Sugestão de ordem de revisão: primeiro os itens 🔴 (segurança — afetam todo mundo que usa o link do sistema), depois 🟡 (podem estar gerando números errados sem ninguém notar), por último 🟢 (organização, sem pressa).
