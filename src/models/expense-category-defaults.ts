import { ExpenseCategoryType } from './expense-model';

export interface DefaultExpenseCategoryDef {
  systemKey: string;
  name: string;
  type: ExpenseCategoryType;
}

export const DEFAULT_EXPENSE_CATEGORIES: readonly DefaultExpenseCategoryDef[] = [
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

/** ID determinístico da categoria padrão (idempotência app + migração). */
export function defaultCategoryId(companyId: string, systemKey: string): string {
  return `${companyId}_${systemKey}`;
}
