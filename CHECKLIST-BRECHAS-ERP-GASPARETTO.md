# Checklist de Brechas e Pontos em Aberto — ERP Gasparetto

> Levantado a partir da análise direta do código-fonte (`src/services`, `src/models`, `firestore.rules`, `app.config.ts`). Cada item abaixo é algo que hoje **funciona sem controle, sem confirmação ou de forma inconsistente**. Marque conforme for revisando com o Felipe/Gasparetto.

---

## 🔴 Segurança (prioridade alta)

> Auditoria de segurança completa realizada em 2026-08-20 — ver histórico da conversa/PR
> correspondente. Os 3 primeiros itens abaixo (Firestore aberto, login ausente, controle
> de acesso só visual) **já foram corrigidos** desde que este checklist foi escrito:
> `firestore.rules` hoje exige autenticação + isolamento por `companyId` em toda coleção
> operacional, com bypass de super-admin revalidado a cada request; `AuthService` +
> `AuthGuard` implementam login real; papéis (`owner/admin/employee`) e `isSuperAdmin`
> são reforçados na regra, não só na UI. Mantidos aqui riscados só como registro histórico.

- [x] ~~Firestore totalmente aberto~~ — resolvido, ver `firestore.rules` e `regra-de-negocio.md` seções 10 e 13.
- [x] ~~Login configurado mas não implementado~~ — resolvido, ver `src/services/auth-service/`.
- [x] ~~Controle de acesso hoje é só visual~~ — resolvido, autorização real está em `firestore.rules`.

- [ ] **Chave da Google Maps Places API exposta sem restrição visível** em `index.html`. Confirmar no Google Cloud Console se essa chave tem restrição por domínio/referrer — senão pode ser usada por terceiros e gerar custo. **Ainda em aberto — requer ação no console, fora do escopo de código.**

- [ ] **Rotacionar chave de Service Account do Admin SDK.** Foi encontrado (2026-08-20) o arquivo `projetosfelipe-9e458-firebase-adminsdk-fbsvc-a95e38cc29.json` na raiz do repo, com uma chave real de produção em texto puro (nunca commitada, mas presente em disco). Revogar no console do Firebase/GCP (IAM) e apagar o arquivo local. **Ação exclusiva do dono do projeto — precisa de acesso ao console.**

- [ ] **Sem App Check / CAPTCHA no signup self-service.** Nada impede criação automatizada em massa de contas/empresas trial além das proteções nativas do Firebase Auth. Avaliar Firebase App Check (reCAPTCHA) se o cadastro público continuar aberto.

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
