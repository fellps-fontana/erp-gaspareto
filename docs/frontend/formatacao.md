# Formatação (locale, moeda, números, datas)

O app roda com locale **pt-BR** e moeda padrão **BRL**, registrados globalmente
em `src/app/app.config.ts` (`registerLocaleData(localePt)`, `LOCALE_ID = 'pt-BR'`,
`DEFAULT_CURRENCY_CODE = 'BRL'`). Todos os pipes do Angular (`currency`,
`number`, `date`) usam esse locale.

## Padrão vigente

- **Valor em reais (exibição):** sempre `{{ valor | currency }}` → `R$ 1.234,56`.
  Nunca `R$ {{ valor | number:'1.2-2' }}`, `toFixed(2)` ou interpolação crua.
  Sem centavos: `{{ valor | currency:'BRL':'symbol':'1.0-0' }}`.
- **Em TypeScript** (ex.: tooltip de gráfico, mensagem montada no código):
  `value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })`.
- **Quantidade/percentual:** `| number:'1.0-3'` etc. (já sai com vírgula decimal).
- **Datas:** formatos numéricos explícitos (`dd/MM/yyyy`, `HH:mm`).
- **Campos de digitação** (`input type="number"`) não passam por pipe; o valor
  gravado no banco é `number` puro — a formatação é só de exibição.

## Testes

Specs que verificam texto formatado devem prover o mesmo locale no TestBed
(`registerLocaleData(localePt)` + providers `LOCALE_ID`/`DEFAULT_CURRENCY_CODE`),
como em `product-inventory.spec.ts`. O `currency` pt-BR usa NBSP (U+00A0)
entre `R$` e o número — use `\s` na regex.
