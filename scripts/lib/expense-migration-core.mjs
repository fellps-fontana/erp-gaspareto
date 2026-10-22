// Núcleo puro da migração bills/purchaseProducts -> expenses (regra-de-negocio.md §14).
// Sem I/O: recebe docs legados em memória, devolve o plano. Rodado por
// scripts/migrate-bills-to-expenses.mjs e testado via node:test.

export const DEFAULT_CATEGORY_DEFS = [
  { systemKey: 'compra_mercadoria', name: 'Compra de mercadoria', type: 'custo_producao' },
  { systemKey: 'insumos_embalagem', name: 'Insumos/Embalagem', type: 'custo_producao' },
  { systemKey: 'aluguel', name: 'Aluguel', type: 'despesa_operacional' },
  { systemKey: 'energia_agua_gas', name: 'Energia/Água/Gás', type: 'despesa_operacional' },
  { systemKey: 'internet_telefone', name: 'Internet/Telefone', type: 'despesa_operacional' },
  { systemKey: 'transporte_combustivel', name: 'Transporte/Combustível', type: 'despesa_operacional' },
  { systemKey: 'pessoal', name: 'Pessoal', type: 'despesa_operacional' },
  { systemKey: 'impostos_taxas', name: 'Impostos/Taxas', type: 'despesa_operacional' },
  { systemKey: 'taxas_cartao', name: 'Taxas de cartão', type: 'despesa_operacional' },
  { systemKey: 'marketing', name: 'Marketing', type: 'despesa_operacional' },
  { systemKey: 'manutencao_equipamentos', name: 'Manutenção/Equipamentos', type: 'despesa_operacional' },
  { systemKey: 'outros', name: 'Outros', type: 'despesa_operacional' },
];

/** Timestamp-like ({toDate()} | {seconds} | Date | ISO) -> 'YYYY-MM-DD' em America/Sao_Paulo. */
export function toDateKeySaoPaulo(tsLike) { throw new Error('not implemented'); }

/** minúsculo, sem acento, espaços colapsados. */
export function normalizeText(text) { throw new Error('not implemented'); }

/** Palavra-chave -> systemKey | null. 'taxas_cartao' tem precedência sobre 'impostos_taxas'. */
export function matchCategoryKey(text) { throw new Error('not implemented'); }

/** bill (+ purchaseProduct ligado, se houver) -> { systemKey, revisar, motivo? } pela precedência da §14. */
export function resolveBillCategory(bill, purchaseProduct) { throw new Error('not implemented'); }

/** bill legado -> { id: 'mig_bill_<id>', data } (status/datas/categoria/flags conforme §14). */
export function mapBillToExpense(bill, ctx) { throw new Error('not implemented'); }

/** purchaseProduct recurring + bills ligados -> { id: 'mig_pp_<id>', data } | null (null se recurring=false). */
export function mapPurchaseProductToSeries(purchaseProduct, linkedBills, ctx) { throw new Error('not implemented'); }

/**
 * Plano completo p/ UMA empresa: { categories, series, expenses, report }.
 * `existingIds` ({categories, series, expenses}: Set) -> itens já existentes são pulados e contados em report.skipped.
 */
export function planMigration({ companyId, bills, purchaseProducts, existingIds }) { throw new Error('not implemented'); }
