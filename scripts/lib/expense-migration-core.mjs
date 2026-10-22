// Nucleo puro da migracao bills/purchaseProducts -> expenses (regra-de-negocio.md secao 14).
// Sem I/O: recebe docs legados em memoria, devolve o plano. Usado por
// scripts/migrate-bills-to-expenses.mjs e testado via node:test.

export const DEFAULT_CATEGORY_DEFS = [
  { systemKey: 'compra_mercadoria', name: 'Compra de mercadoria', type: 'custo_producao' },
  { systemKey: 'insumos_embalagem', name: 'Insumos/Embalagem', type: 'custo_producao' },
  { systemKey: 'aluguel', name: 'Aluguel', type: 'despesa_operacional' },
  { systemKey: 'energia_agua_gas', name: 'Energia/Água/Gás', type: 'despesa_operacional' },
  { systemKey: 'internet_telefone', name: 'Internet/Telefone', type: 'despesa_operacional' },
  {
    systemKey: 'transporte_combustivel',
    name: 'Transporte/Combustível',
    type: 'despesa_operacional',
  },
  { systemKey: 'pessoal', name: 'Pessoal', type: 'despesa_operacional' },
  { systemKey: 'impostos_taxas', name: 'Impostos/Taxas', type: 'despesa_operacional' },
  { systemKey: 'taxas_cartao', name: 'Taxas de cartão', type: 'despesa_operacional' },
  { systemKey: 'marketing', name: 'Marketing', type: 'despesa_operacional' },
  {
    systemKey: 'manutencao_equipamentos',
    name: 'Manutenção/Equipamentos',
    type: 'despesa_operacional',
  },
  { systemKey: 'outros', name: 'Outros', type: 'despesa_operacional' },
];

export const ORIGIN_MIGRACAO = 'migracao';
export const ID_PREFIX_SERIES = 'mig_pp_';

const ID_PREFIX_BILL = 'mig_bill_';
const SAO_PAULO_TZ = 'America/Sao_Paulo';
const SAO_PAULO_DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: SAO_PAULO_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const LEGACY_PAGO = 'pago';
const LEGACY_RECEBIDO_FIELD = 'receivedAt';
const EXPENSE_STATUS = Object.freeze({ A_PAGAR: 'a_pagar', PAGO: 'pago' });
const COMPRA_PREFIX = 'compra:';
const CATEGORY_COMPRA = 'compra_mercadoria';
const CATEGORY_OUTROS = 'outros';
const PERIOD_BY_LEGACY = Object.freeze({ weekly: 'semanal', monthly: 'mensal' });
const DEFAULT_PERIOD = 'mensal';

const MOTIVO = Object.freeze({
  SEM_CASAMENTO: 'categoria nao identificada pelo nome',
  RECEBIDO_SEM_CASAMENTO: 'recebido sem categoria identificada: compra de mercadoria por padrao',
  VENCIMENTO_FALLBACK: 'sem vencimento: data usada veio de outro campo',
  PAGO_SEM_PAGAMENTO: 'pago sem data de pagamento: vencimento usado como pagamento',
  RECORRENTE_SEM_SERIE: 'recorrente sem serie: migrado como despesa simples',
  PERIODO_DESCONHECIDO: 'periodo de recorrencia desconhecido: usado mensal',
  SEM_DATA: 'sem data utilizavel (dueDate, paidAt, receivedAt e createdAt ausentes)',
  VALOR_INVALIDO: 'valor nao numerico',
  SERIE_SEM_DATA: 'recorrente sem data: sem bills com vencimento e sem createdAt',
});

const anyOf =
  (...words) =>
  (tokens) =>
    words.some((word) => tokens.has(word));
const and =
  (...tests) =>
  (tokens) =>
    tests.every((test) => test(tokens));
const or =
  (...tests) =>
  (tokens) =>
    tests.some((test) => test(tokens));

const TAXA_WORDS = anyOf('taxa', 'taxas');
const CARTAO_WORDS = anyOf('cartao', 'cartoes');

// Ordem importa: a primeira regra que casa vence.
const CATEGORY_RULES = Object.freeze([
  { systemKey: 'taxas_cartao', matches: or(anyOf('maquininha'), and(TAXA_WORDS, CARTAO_WORDS)) },
  { systemKey: 'aluguel', matches: anyOf('aluguel') },
  { systemKey: 'energia_agua_gas', matches: anyOf('energia', 'luz', 'agua', 'gas') },
  {
    systemKey: 'internet_telefone',
    matches: anyOf('internet', 'telefone', 'telefonia', 'celular'),
  },
  {
    systemKey: 'transporte_combustivel',
    matches: anyOf('combustivel', 'gasolina', 'diesel', 'transporte', 'pedagio'),
  },
  {
    systemKey: 'pessoal',
    matches: anyOf('salario', 'salarios', 'folha', 'pessoal', 'funcionario', 'funcionarios'),
  },
  {
    systemKey: 'impostos_taxas',
    matches: anyOf('imposto', 'impostos', 'taxa', 'taxas', 'iptu', 'ipva'),
  },
  {
    systemKey: 'marketing',
    matches: anyOf('marketing', 'publicidade', 'propaganda', 'anuncio', 'anuncios'),
  },
  {
    systemKey: 'manutencao_equipamentos',
    matches: anyOf('manutencao', 'conserto', 'reparo', 'equipamento', 'equipamentos'),
  },
  {
    systemKey: 'insumos_embalagem',
    matches: anyOf('insumo', 'insumos', 'embalagem', 'embalagens', 'descartavel', 'descartaveis'),
  },
  { systemKey: 'compra_mercadoria', matches: anyOf('mercadoria', 'mercadorias') },
]);

// Fallback de vencimento (D3): primeiro campo presente vence.
const DUE_DATE_FALLBACKS = Object.freeze([
  { field: 'paidAt', applies: (bill) => bill.status === LEGACY_PAGO },
  { field: LEGACY_RECEBIDO_FIELD, applies: () => true },
  { field: 'createdAt', applies: () => true },
]);

class UnmigratableError extends Error {
  constructor(kind, id, motivo) {
    super(motivo);
    this.kind = kind;
    this.id = id;
    this.motivo = motivo;
  }
}

function toJsDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  if (typeof value?.toDate === 'function') return value.toDate();
  return new Date(value.seconds * 1000);
}

/** Timestamp-like ({toDate()} | {seconds} | Date | ISO) -> 'YYYY-MM-DD' em America/Sao_Paulo. */
export function toDateKeySaoPaulo(tsLike) {
  const parts = Object.fromEntries(
    SAO_PAULO_DATE_FORMAT.formatToParts(toJsDate(tsLike)).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** minusculo, sem acento, espacos colapsados. */
export function normalizeText(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function tokensOf(text) {
  return new Set(
    normalizeText(text)
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
}

/** Palavra-chave -> systemKey | null. 'taxas_cartao' tem precedencia sobre 'impostos_taxas'. */
export function matchCategoryKey(text) {
  const tokens = tokensOf(text);
  const rule = CATEGORY_RULES.find((candidate) => candidate.matches(tokens));
  return rule ? rule.systemKey : null;
}

function categoryDecision(systemKey, motivo) {
  return motivo ? { systemKey, revisar: true, motivo } : { systemKey, revisar: false };
}

/** bill (+ purchaseProduct ligado, se houver) -> { systemKey, revisar, motivo? } pela precedencia da secao 14. */
export function resolveBillCategory(bill, purchaseProduct) {
  if (normalizeText(bill.name).startsWith(COMPRA_PREFIX)) return categoryDecision(CATEGORY_COMPRA);
  const byProduct = purchaseProduct ? matchCategoryKey(purchaseProduct.name) : null;
  const byName = byProduct ?? matchCategoryKey(bill.name);
  if (byName) return categoryDecision(byName);
  if (bill[LEGACY_RECEBIDO_FIELD]) {
    return categoryDecision(CATEGORY_COMPRA, MOTIVO.RECEBIDO_SEM_CASAMENTO);
  }
  return categoryDecision(CATEGORY_OUTROS, MOTIVO.SEM_CASAMENTO);
}

function resolveDueDate(bill) {
  if (bill.dueDate) return { dateKey: toDateKeySaoPaulo(bill.dueDate), fallbackField: null };
  const fallback = DUE_DATE_FALLBACKS.find((f) => f.applies(bill) && bill[f.field]);
  if (!fallback) throw new UnmigratableError('bill', bill.id, MOTIVO.SEM_DATA);
  return { dateKey: toDateKeySaoPaulo(bill[fallback.field]), fallbackField: fallback.field };
}

function parseValue(raw) {
  if (raw === null || raw === undefined || raw === '') return NaN;
  return Number(raw);
}

function resolveValue(bill) {
  const value = parseValue(bill.value);
  if (!Number.isFinite(value)) throw new UnmigratableError('bill', bill.id, MOTIVO.VALOR_INVALIDO);
  return value;
}

function categoryIdOf(companyId, systemKey) {
  return `${companyId}_${systemKey}`;
}

function seriesIdOf(purchaseProductId) {
  return `${ID_PREFIX_SERIES}${purchaseProductId}`;
}

function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
}

function reviewFields(reasons) {
  return reasons.length ? { migracaoRevisar: true, migracaoMotivo: reasons.join('; ') } : {};
}

function billReviewReasons(bill, due, category, ctx) {
  const reasons = [];
  if (category.revisar) reasons.push(category.motivo);
  if (due.fallbackField) reasons.push(MOTIVO.VENCIMENTO_FALLBACK);
  if (bill.status === LEGACY_PAGO && !bill.paidAt) reasons.push(MOTIVO.PAGO_SEM_PAGAMENTO);
  if (bill.recurring === true && !ctx.seriesId) reasons.push(MOTIVO.RECORRENTE_SEM_SERIE);
  return reasons;
}

function paidDateOf(bill, dueDateKey) {
  return bill.paidAt ? toDateKeySaoPaulo(bill.paidAt) : dueDateKey;
}

/** bill legado -> { id: 'mig_bill_<id>', data }. Lanca UnmigratableError se nao houver data ou valor. */
export function mapBillToExpense(bill, ctx) {
  const due = resolveDueDate(bill);
  const value = resolveValue(bill);
  const category = resolveBillCategory(bill, ctx.purchaseProduct);
  const isPaid = bill.status === LEGACY_PAGO;
  const data = compact({
    companyId: ctx.companyId,
    description: String(bill.name ?? ''),
    value,
    categoryId: categoryIdOf(ctx.companyId, category.systemKey),
    dueDate: due.dateKey,
    status: isPaid ? EXPENSE_STATUS.PAGO : EXPENSE_STATUS.A_PAGAR,
    paidDate: isPaid ? paidDateOf(bill, due.dateKey) : undefined,
    goodsReceivedDate: bill.receivedAt ? toDateKeySaoPaulo(bill.receivedAt) : undefined,
    seriesId: ctx.seriesId,
    origin: ORIGIN_MIGRACAO,
    legacyBillId: bill.id,
    createdAt: bill.createdAt,
    ...reviewFields(billReviewReasons(bill, due, category, ctx)),
  });
  return { id: `${ID_PREFIX_BILL}${bill.id}`, data };
}

function periodOf(purchaseProduct) {
  return Object.hasOwn(PERIOD_BY_LEGACY, purchaseProduct.recurrencePeriod)
    ? PERIOD_BY_LEGACY[purchaseProduct.recurrencePeriod]
    : DEFAULT_PERIOD;
}

// Categoria da serie: so pelo nome do produto; fallback pelo nome do ultimo bill ligado.
function seriesCategory(purchaseProduct, latestBill) {
  const systemKey =
    matchCategoryKey(purchaseProduct.name) ??
    (latestBill ? matchCategoryKey(latestBill.name) : null);
  return systemKey
    ? categoryDecision(systemKey)
    : categoryDecision(CATEGORY_OUTROS, MOTIVO.SEM_CASAMENTO);
}

function seriesReviewReasons(purchaseProduct, category) {
  const reasons = [];
  if (category.revisar) reasons.push(category.motivo);
  if (!Object.hasOwn(PERIOD_BY_LEGACY, purchaseProduct.recurrencePeriod)) {
    reasons.push(MOTIVO.PERIODO_DESCONHECIDO);
  }
  return reasons;
}

function sortedByDueDate(bills) {
  return bills
    .map((bill) => ({ bill, dueKey: resolveDueDate(bill).dateKey }))
    .sort((a, b) => a.dueKey.localeCompare(b.dueKey));
}

function anchorWithoutBills(purchaseProduct) {
  if (!purchaseProduct.createdAt) {
    throw new UnmigratableError('purchaseProduct', purchaseProduct.id, MOTIVO.SERIE_SEM_DATA);
  }
  return toDateKeySaoPaulo(purchaseProduct.createdAt);
}

function templateValue(purchaseProduct, latestBill) {
  if (latestBill) return resolveValue(latestBill);
  const value = parseValue(purchaseProduct.defaultValue);
  if (!Number.isFinite(value)) {
    throw new UnmigratableError('purchaseProduct', purchaseProduct.id, MOTIVO.VALOR_INVALIDO);
  }
  return value;
}

function seriesTemplate(purchaseProduct, latestBill, categoryId) {
  return compact({
    description: String(latestBill ? (latestBill.name ?? '') : (purchaseProduct.name ?? '')),
    value: templateValue(purchaseProduct, latestBill),
    categoryId,
  });
}

/** purchaseProduct recurring + bills ligados -> { id: 'mig_pp_<id>', data } | null (null se recurring=false). */
export function mapPurchaseProductToSeries(purchaseProduct, linkedBills, ctx) {
  if (purchaseProduct.recurring !== true) return null;
  const linked = sortedByDueDate(linkedBills);
  const dueKeys = linked.map((item) => item.dueKey);
  const latestBill = linked.length ? linked[linked.length - 1].bill : null;
  const category = seriesCategory(purchaseProduct, latestBill);
  const data = compact({
    companyId: ctx.companyId,
    active: true,
    period: periodOf(purchaseProduct),
    anchorDate: dueKeys[0] ?? anchorWithoutBills(purchaseProduct),
    generatedThrough: dueKeys.length ? dueKeys[dueKeys.length - 1] : undefined,
    template: seriesTemplate(
      purchaseProduct,
      latestBill,
      categoryIdOf(ctx.companyId, category.systemKey),
    ),
    legacyPurchaseProductId: purchaseProduct.id,
    createdAt: purchaseProduct.createdAt,
    ...reviewFields(seriesReviewReasons(purchaseProduct, category)),
  });
  return { id: seriesIdOf(purchaseProduct.id), data };
}

function emptyExistingIds() {
  return { categories: new Set(), series: new Set(), expenses: new Set() };
}

function withoutExisting(items, existing) {
  return items.filter((item) => !existing.has(item.id));
}

function countBy(items, keyOf, initialKeys) {
  const counts = Object.fromEntries(initialKeys.map((key) => [key, 0]));
  for (const item of items) counts[keyOf(item)] += 1;
  return counts;
}

function systemKeyOf(expense, companyId) {
  return expense.data.categoryId.slice(`${companyId}_`.length);
}

function buildCategories(companyId) {
  return DEFAULT_CATEGORY_DEFS.map((def) => ({
    id: categoryIdOf(companyId, def.systemKey),
    data: {
      companyId,
      name: def.name,
      type: def.type,
      archived: false,
      systemKey: def.systemKey,
    },
  }));
}

// Mapeia cada item; item que lanca UnmigratableError vai para a lista de nao migraveis.
function mapAll(items, mapOne) {
  const mapped = [];
  const unmigratable = [];
  for (const item of items) {
    try {
      mapped.push(mapOne(item));
    } catch (err) {
      if (!(err instanceof UnmigratableError)) throw err;
      unmigratable.push({ kind: err.kind, id: err.id, motivo: err.motivo });
    }
  }
  return { mapped, unmigratable };
}

function expenseCtx(companyId, productsById, migratedSeriesIds, bill) {
  const purchaseProduct = productsById.get(bill.purchaseProductId);
  const seriesId = purchaseProduct ? seriesIdOf(purchaseProduct.id) : undefined;
  return {
    companyId,
    purchaseProduct,
    seriesId: migratedSeriesIds.has(seriesId) ? seriesId : undefined,
  };
}

function buildReport(companyId, plan, skippedByKind, unmigratable) {
  const expensesAndSeries = [...plan.expenses, ...plan.series];
  return {
    byStatus: countBy(plan.expenses, (e) => e.data.status, Object.values(EXPENSE_STATUS)),
    byCategory: countBy(
      plan.expenses,
      (e) => systemKeyOf(e, companyId),
      DEFAULT_CATEGORY_DEFS.map((def) => def.systemKey),
    ),
    revisar: expensesAndSeries.filter((item) => item.data.migracaoRevisar === true).length,
    skipped: skippedByKind.categories + skippedByKind.series + skippedByKind.expenses,
    skippedByKind,
    created: {
      categories: plan.categories.length,
      series: plan.series.length,
      expenses: plan.expenses.length,
    },
    unmigratable,
  };
}

/**
 * Plano completo p/ UMA empresa: { categories, series, expenses, report }.
 * `existingIds` ({categories, series, expenses}: Set) -> itens ja existentes sao pulados
 * e contados em report.skipped (total) e report.skippedByKind (por tipo).
 * Bills/purchaseProducts sem data utilizavel ou valor invalido ficam fora do plano e
 * constam em report.unmigratable ([{ kind, id, motivo }]).
 * report.created traz o que SERA criado (o script substitui pelo real no --apply).
 */
export function planMigration({
  companyId,
  bills,
  purchaseProducts,
  existingIds = emptyExistingIds(),
}) {
  const ownBills = bills.filter((bill) => bill.companyId === companyId);
  const ownProducts = purchaseProducts.filter((pp) => pp.companyId === companyId);
  const productsById = new Map(ownProducts.map((pp) => [pp.id, pp]));

  const billCheck = mapAll(ownBills, (bill) => ({
    bill,
    expense: mapBillToExpense(bill, expenseCtx(companyId, productsById, new Set(), bill)),
  }));
  const migratableBills = billCheck.mapped.map((item) => item.bill);

  const seriesResult = mapAll(ownProducts, (pp) =>
    mapPurchaseProductToSeries(
      pp,
      migratableBills.filter((bill) => bill.purchaseProductId === pp.id),
      { companyId },
    ),
  );
  const series = seriesResult.mapped.filter(Boolean);
  const migratedSeriesIds = new Set(series.map((s) => s.id));

  const expenses = migratableBills.map((bill) =>
    mapBillToExpense(bill, expenseCtx(companyId, productsById, migratedSeriesIds, bill)),
  );

  const allCategories = buildCategories(companyId);
  const categories = withoutExisting(allCategories, existingIds.categories ?? new Set());
  const keptSeries = withoutExisting(series, existingIds.series ?? new Set());
  const keptExpenses = withoutExisting(expenses, existingIds.expenses ?? new Set());

  const skippedByKind = {
    categories: allCategories.length - categories.length,
    series: series.length - keptSeries.length,
    expenses: expenses.length - keptExpenses.length,
  };
  const unmigratable = [...billCheck.unmigratable, ...seriesResult.unmigratable];
  const plan = { categories, series: keptSeries, expenses: keptExpenses };
  return { ...plan, report: buildReport(companyId, plan, skippedByKind, unmigratable) };
}
