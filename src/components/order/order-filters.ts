/**
 * Regra pura de filtro da tela de Pedidos (status + ordenação + cidade).
 *
 * Mora na pasta do componente (não em `src/services/`) porque é regra de
 * EXIBIÇÃO exclusiva desta tela — não é reaproveitada por PDV, Comandas nem
 * relatórios. Sem Angular e sem Firestore: funções puras, testáveis isoladas.
 *
 * NÃO é regra crítica: não toca estoque, dinheiro nem transição de estado
 * (regra-de-negocio.md seção 5). Apenas decide o que aparece na lista.
 *
 * O "filtro por cidade" é um join 100% client-side entre `order.customerId` e
 * `customer.cidade` (regra-de-negocio.md seção 9) — a cidade nunca é copiada
 * para o documento do pedido. Opera sobre listas JÁ isoladas por `companyId`
 * pelos services (regra-de-negocio.md seção 10): estas funções não filtram
 * tenant, confiam no isolamento a montante.
 */

/** Valor sentinela do seletor: "Todas as cidades" (nenhum filtro de cidade). */
export const TODAS_AS_CIDADES = '';

export interface CustomerCidadeRef {
  id?: string;
  cidade?: string;
}

export interface OrderCidadeRef {
  customerId?: string;
}

/**
 * Chave de comparação/dedupe de cidade:
 * trim -> colapsa espaços internos -> remove acentos -> minúsculas.
 * `undefined | null | '' | só-espaços` => `''`.
 */
export function normalizarCidade(cidade: string | null | undefined): string {
  if (!cidade) return '';
  const limpa = cidade.trim().replace(/\s+/g, ' ');
  if (!limpa) return '';
  return limpa
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Rótulos de exibição das cidades distintas dos customers referenciados por
 * algum pedido da lista.
 * - dedupe pela chave `normalizarCidade`; rótulo = primeira grafia encontrada
 *   (só com trim — preserva acento e caixa original);
 * - ordenado por `localeCompare(b, 'pt-BR')`;
 * - ignora: pedido sem `customerId`, `customerId` sem customer correspondente,
 *   customer com cidade vazia/ausente;
 * - `orders` ou `customers` vazio => `[]`.
 */
export function cidadesComPedido(
  orders: readonly OrderCidadeRef[],
  customers: readonly CustomerCidadeRef[]
): string[] {
  if (orders.length === 0 || customers.length === 0) return [];

  const customerPorId = new Map<string, CustomerCidadeRef>();
  for (const customer of customers) {
    if (customer.id) customerPorId.set(customer.id, customer);
  }

  const rotuloPorChave = new Map<string, string>();
  for (const order of orders) {
    if (!order.customerId) continue;
    const customer = customerPorId.get(order.customerId);
    if (!customer) continue;
    const rotulo = customer.cidade?.trim();
    if (!rotulo) continue;
    const chave = normalizarCidade(rotulo);
    if (!chave) continue;
    if (!rotuloPorChave.has(chave)) rotuloPorChave.set(chave, rotulo);
  }

  return [...rotuloPorChave.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/**
 * Mantém só os pedidos cujo `customerId` aponta para um customer com a cidade
 * selecionada (comparação por `normalizarCidade`).
 * - `cidadeSelecionada === TODAS_AS_CIDADES` => `[...orders]` sem filtrar;
 * - pedido sem `customerId`, customer ausente ou customer sem cidade => removido;
 * - `orders` vazio => `[]`.
 * Genérico em `T` para preservar o tipo `Order` completo na saída.
 */
export function filtrarPorCidade<T extends OrderCidadeRef>(
  orders: readonly T[],
  customers: readonly CustomerCidadeRef[],
  cidadeSelecionada: string
): T[] {
  if (orders.length === 0) return [];
  if (cidadeSelecionada === TODAS_AS_CIDADES) return [...orders];

  const alvo = normalizarCidade(cidadeSelecionada);

  const cidadePorCustomerId = new Map<string, string>();
  for (const customer of customers) {
    if (!customer.id) continue;
    const chave = normalizarCidade(customer.cidade);
    if (chave) cidadePorCustomerId.set(customer.id, chave);
  }

  return orders.filter(order => {
    if (!order.customerId) return false;
    return cidadePorCustomerId.get(order.customerId) === alvo;
  });
}
