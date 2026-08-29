/**
 * Regras puras de "produto vendido por peso" (Product.soldByWeight).
 *
 * Sem Firestore e sem Angular — funções puras, testáveis isoladas.
 * Regra CRÍTICA: envolve dinheiro (total do item) e "linha única" por venda.
 * Referência: regra-de-negocio/02-estoque.md, 03-vendas.md, 04-comandas.md,
 * 05-pedidos.md (feature "produto por kilo").
 *
 * Contrato:
 * - Product.soldByWeight === true  => a "quantidade" da linha
 *   (OrderItem/ComandaItem/SaleItem.quantity) representa PESO em kg.
 * - Product.soldByWeight === true  => Product.sellPrice representa PREÇO POR KG.
 * - O produto entra UMA vez por venda/pedido/comanda (linha única).
 */

/** Linha mínima para as guardas (qualquer *Item que tenha idProduct). */
export interface LinhaProdutoRef {
  idProduct: string;
}

export interface ResultadoValidacaoPeso {
  valido: boolean;
  /** Mensagem pt-BR pronta para notif.warning quando valido === false. */
  erro?: string;
}

/** Maximo de casas decimais aceitas para o peso (aceita tambem 1 e 2 casas). */
export const MAX_CASAS_DECIMAIS_PESO = 3;

/**
 * Epsilon para compensar ruido de representacao em ponto flutuante.
 * Na magnitude de centavos (0-100), o ruido FP e ~1e-13. Este epsilon de 1e-9
 * e suficiente para que halfway exatos (ex: 19.99 * 2.5 = 49.975) arredondem
 * para cima (regra "tie goes up"), e pequeno demais para promover um valor
 * que esteja de fato abaixo do meio-centavo (ex: 9.99 * 1.501 = 14.99499 fica
 * 14.99, nao 15.00).
 */
const FLOATING_POINT_EPSILON = 1e-9;

/**
 * Total em dinheiro de uma linha vendida por peso: precoPorKg * pesoKg,
 * arredondado a 2 casas (centavos), a prova de erro de ponto flutuante
 * (ex.: 19.99 * 1.5 deve dar 29.99, nao 29.98 por ruido de FP).
 * Entradas nao numericas ou <= 0 => 0.
 */
export function calcularTotalItemPorPeso(precoPorKg: number, pesoKg: number): number {
  if (!Number.isFinite(precoPorKg) || !Number.isFinite(pesoKg)) {
    return 0;
  }
  if (precoPorKg <= 0 || pesoKg <= 0) {
    return 0;
  }
  return Math.round((precoPorKg * pesoKg + FLOATING_POINT_EPSILON) * 100) / 100;
}

/**
 * Normaliza um peso vindo de input (string ou number): Number(valor) e
 * ARREDONDA para no máximo MAX_CASAS_DECIMAIS_PESO casas decimais.
 * Retorna NaN se não for número finito.
 */
export function normalizarPeso(valor: number | string): number {
  if (valor === null || valor === undefined) {
    return NaN;
  }
  const num = Number(valor);
  if (!Number.isFinite(num)) {
    return NaN;
  }
  return Math.round(num * Math.pow(10, MAX_CASAS_DECIMAIS_PESO)) / Math.pow(10, MAX_CASAS_DECIMAIS_PESO);
}

/**
 * Valida um peso para venda por kg:
 * - número finito
 * - > 0
 * - no máximo MAX_CASAS_DECIMAIS_PESO casas decimais
 */
export function validarPeso(valor: number | string): ResultadoValidacaoPeso {
  const num = Number(valor);

  if (!Number.isFinite(num)) {
    return {
      valido: false,
      erro: 'Peso deve ser um número válido.'
    };
  }

  if (num <= 0) {
    return {
      valido: false,
      erro: 'Peso deve ser maior que zero.'
    };
  }

  // Verifica se tem mais de 3 casas decimais (FP-safe):
  // compara contra o numero normalizado a 3 casas
  const normalizado = Number(num.toFixed(3));
  if (Math.abs(num - normalizado) > 1e-9) {
    return {
      valido: false,
      erro: `Peso pode ter no máximo ${MAX_CASAS_DECIMAIS_PESO} casas decimais.`
    };
  }

  return { valido: true };
}

/**
 * Regra de linha única: retorna true se a adição de `idProduct` deve ser
 * BLOQUEADA porque o produto é vendido por peso (soldByWeight) e já existe
 * uma linha dele em `itensAtuais` (cart, order.items ou comanda.items).
 * Para produto por unidade (soldByWeight === false) nunca bloqueia.
 */
export function bloqueiaAdicaoPorPeso(
  itensAtuais: readonly LinhaProdutoRef[],
  idProduct: string,
  soldByWeight: boolean
): boolean {
  if (!soldByWeight) {
    return false;
  }
  return itensAtuais.some(item => item.idProduct === idProduct);
}
