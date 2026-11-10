// Guardas e leituras compartilhadas pelos services de Despesas.
// Sem estado: o Firestore e o companyId chegam por parametro.

import { Firestore } from '@angular/fire/firestore';
import { doc, getDoc } from 'firebase/firestore';
import { ExpenseCategory } from '../../models/expense-model';

export const COLECAO_DESPESAS = 'expenses';
export const COLECAO_CATEGORIAS = 'expenseCategories';
export const COLECAO_SERIES = 'expenseSeries';

const CODIGO_PERMISSAO_NEGADA = 'permission-denied';

export const MSG_CATEGORIA_INVALIDA = 'Categoria inválida para esta empresa.';
export const MSG_CATEGORIA_ARQUIVADA = 'Categoria arquivada não pode ser usada em nova despesa.';

/** Garante companyId da sessao; a mensagem e do service chamador. */
export function exigirCompanyId(
  companyId: string | null | undefined,
  mensagemSemEmpresa: string,
): string {
  if (!companyId) {
    throw new Error(mensagemSemEmpresa);
  }
  return companyId;
}

/**
 * Categoria inexistente ou de outra empresa e negada pela rule (permission-denied):
 * vira mensagem de dominio. Outros erros de leitura seguem para quem chamou.
 */
export async function lerCategoriaDaEmpresa(
  firestore: Firestore,
  companyId: string,
  categoryId: string,
): Promise<ExpenseCategory> {
  let categoria: ExpenseCategory | undefined;
  if (categoryId) {
    try {
      const snap = await getDoc(doc(firestore, COLECAO_CATEGORIAS, categoryId));
      categoria = snap.data() as ExpenseCategory | undefined;
    } catch (erro) {
      if (!ehNegacaoDePermissao(erro)) {
        throw erro;
      }
    }
  }
  if (categoria === undefined || categoria.companyId !== companyId) {
    throw new Error(MSG_CATEGORIA_INVALIDA);
  }
  return categoria;
}

/** Categoria nova so aceita categoria nao arquivada. */
export function assertCategoriaAtiva(categoria: ExpenseCategory): void {
  if (categoria.archived) {
    throw new Error(MSG_CATEGORIA_ARQUIVADA);
  }
}

export function ehNegacaoDePermissao(erro: unknown): boolean {
  return (erro as { code?: unknown } | null)?.code === CODIGO_PERMISSAO_NEGADA;
}
