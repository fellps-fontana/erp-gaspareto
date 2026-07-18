# Identidade Visual — ERP Gaspareto

> Extraído de `src/styles.css` (design tokens globais) e do uso real desses
> tokens nos componentes (`product-inventory.ts`, `theme-service.ts`). Projeto
> tem UI própria (não é headless/API), então este arquivo é obrigatório.

## Sistema de temas

- Suporta tema **claro e escuro**, com o **escuro como padrão** (tokens de
  `:root` já são os do tema escuro; o claro é sobrescrito em
  `body:not(.dark-theme)`).
- Alternância via `ThemeService`: toggla a classe `dark-theme` no `<body>` e
  persiste a escolha em `localStorage` (`erp-gaspareto-theme`).
- Transição suave entre temas: `0.3s cubic-bezier(0.4, 0, 0.2, 1)` aplicada em
  `background-color` e `color` no `html, body`.

## Cores

### Paleta fixa (não muda com o tema)

| Token | Valor | Uso |
|---|---|---|
| `--color-primary` | `#f4c042` (amarelo/dourado) | Cor de marca — botões primários, destaques, ícones ativos |
| `--color-primary-dark` | `#d4a022` | Hover/estado ativo do primary |
| `--color-secondary` | `#00FF7F` (verde neon) | Ações secundárias |
| `--color-secondary-dark` | `#2ecc71` | Hover do secondary |
| `--color-danger` | `#e74c3c` | Exclusão, erro, cancelamento |
| `--color-danger-dark` | `#c0392b` | Hover do danger |
| `--color-info` | `#3498db` | Informativo |
| `--color-success` | `#27ae60` | Sucesso (toast) |
| `--color-warning` | `#f39c12` | Aviso (toast) |
| `--text-on-primary` | `#121212` | Texto sobre fundo `--color-primary` (quase preto, não branco) |

⚠️ `--color-primary` (`#f4c042`) é reutilizado tanto como cor de marca quanto
como cor padrão de produto novo (`novoProduto.color = '#f4c042'` no
componente de estoque) — é a cor de identidade do sistema.

### Tema escuro (padrão)

| Token | Valor |
|---|---|
| `--bg-app` | `#121212` |
| `--bg-card` | `#1e1e1e` |
| `--bg-input` | `#252525` |
| `--bg-muted` | `#2a2a2a` |
| `--text-primary` | `#ffffff` |
| `--text-secondary` | `#aaaaaa` |
| `--border-color` | `#333333` |

### Tema claro

| Token | Valor |
|---|---|
| `--bg-app` | `#f0f2f5` |
| `--bg-card` | `#ffffff` |
| `--bg-input` | `#f5f5f5` |
| `--bg-muted` | `#e8eaed` |
| `--text-primary` | `#1a1a1a` |
| `--text-secondary` | `#5f6368` |
| `--border-color` | `#dadce0` |

Ambos os temas têm variáveis semânticas equivalentes (`--border-strong`,
`--text-muted`, `--text-inverse`, `--bg-soft`, `--header-bg`) e um conjunto
específico para o "resumo de pedidos" (`--orders-summary-*`) — usar essas
variáveis semânticas em vez de cor fixa ao estilizar componente novo, para
que o dark/light funcione automaticamente.

## Tipografia

- Fonte: `'Segoe UI', Roboto, Helvetica, Arial, sans-serif` (definida em
  `html, body`), sem import de fonte externa (Google Fonts etc.) — é a stack
  padrão do sistema operacional.

## Espaçamento e forma

| Token | Valor |
|---|---|
| `--sp-xs` | 4px |
| `--sp-sm` | 8px |
| `--sp-md` | 16px |
| `--sp-lg` | 24px |
| `--sp-xl` | 32px |
| `--radius-sm` | 4px |
| `--radius-md` | 8px |
| `--radius-lg` | 12px |
| `--radius-xl` | 16px |
| `--radius-pill` | 50px |

- Cards usam `--radius-lg` + `--bg-card` + `box-shadow` (`--shadow-card` /
  `--shadow-home-card`, mais forte no tema escuro).
- Botões usam `--radius-md`, padding `12px 24px`, `font-weight: 600`,
  `display: inline-flex` com `gap: 8px` (para ícone + texto).

## Componentes visuais globais (definidos em `styles.css`)

- **Botões:** classes utilitárias `.btn` + variante — `.btn-primary`
  (fundo `--color-primary`, texto `--text-on-primary`, hover escurece e sobe
  1px), `.btn-secondary` (fundo `--color-secondary`), `.btn-danger` (fundo
  `--color-danger`, texto branco), `.btn-outline` (transparente, borda
  `--border-color`, hover realça texto/borda).
- **Inputs/select/textarea:** fundo `--bg-input`, borda `--border-color`,
  `border-radius: --radius-md`, foco troca borda para `--color-primary`
  (sem box-shadow de foco).
- **Card base:** `.card-base` — fundo `--bg-card`, `--radius-lg`, padding
  `--sp-md`, sombra fixa `0 4px 12px rgba(0,0,0,0.2)` (não usa a variável
  `--shadow-card` aqui — ⚠️ pequena inconsistência, considerar ao criar novo
  card).
- **Toast de notificação** (`NotificationService`): pílula fixa no topo
  centralizada (`border-radius: 40px`), cores sólidas por tipo
  (`--erp-toast--success` `#27ae60`, `--error` `#e74c3c`, `--warning`
  `#f39c12`), entra com `translateY` + easing `cubic-bezier(0.34, 1.56, 0.64, 1)`
  (leve "bounce"), some sozinho após 3s.

## Tom da interface (inferido do uso nos componentes)

- Mensagens de feedback ao usuário são em português, diretas, com emoji no
  final (`✅ Produto atualizado`, `❌ Erro ao excluir`, `⚠️ Preencha os campos
  obrigatórios`) — parte da identidade de "voz" do produto, não só de código.
- Gráficos (Chart.js) seguem a paleta: linha de vendas em `--color-primary`
  (`#f4c042`), barras de "top produtos" usam a paleta completa
  (`#f4c042, #3498db, #2ecc71, #e74c3c, #9b59b6`) em sequência fixa.
- Cadastro de produto tem campo de cor livre (`Product.color`), com
  `#f4c042` como padrão — sugere que produtos podem ser identificados
  visualmente por cor na UI (ex.: cards ou etiquetas), mas o componente que
  consome esse campo não foi revisado em detalhe.

## ⚠️ Pontos sem confirmação

- Não há logo/identidade de marca (imagem, favicon customizado) localizada
  na análise — só a paleta de cores em CSS. Confirmar se existe um logo em
  `public/` a ser referenciado neste documento.
- Não há guia de iconografia formal — os componentes usam emojis Unicode como
  ícone (`🍺`, `🍷`, `🍕`, `🗑️`, `✅`) em vez de um icon set (ex.: Bootstrap
  Icons, Lucide). Confirmar se é decisão deliberada de manter emojis como
  linguagem visual ou se há plano de migrar para um icon set.
