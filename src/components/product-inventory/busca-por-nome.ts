/**
 * Regra pura de busca por texto nas listas da tela de Estoque/Clientes/Compras.
 *
 * É regra de EXIBIÇÃO, não crítica: não toca estoque, dinheiro nem transição
 * de estado. Sem Angular e sem Firestore — funções puras, testáveis isoladas.
 * Opera sobre listas já isoladas por `companyId` pelos services.
 */

/** Chave de comparação: trim -> remove acentos -> minúsculas. Vazio => `''`. */
export function normalizarBusca(texto: string | null | undefined): string {
  if (!texto) return '';
  return texto
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Mantém os itens em que ALGUM dos campos informados contém o termo
 * (comparação por `normalizarBusca`). Termo vazio => cópia da lista completa.
 */
export function filtrarPorTermo<T>(
  itens: readonly T[],
  termo: string | null | undefined,
  campos: (item: T) => (string | undefined | null)[]
): T[] {
  const alvo = normalizarBusca(termo);
  if (!alvo) return [...itens];
  return itens.filter(item =>
    campos(item).some(campo => normalizarBusca(campo).includes(alvo))
  );
}
