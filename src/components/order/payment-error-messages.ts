import {
  CodigoPagamentoInvalido,
  PagamentoInvalidoError
} from '../../services/order-service/order-payment-rules';

/** Mensagem pt-BR para cada código de PagamentoInvalidoError (regra-de-negocio.md seção 5.3). */
export const MENSAGENS_PAGAMENTO: Record<CodigoPagamentoInvalido, string> = {
  VALOR_INVALIDO: 'Informe um valor de pagamento maior que zero.',
  ACIMA_DO_SALDO: 'O valor informado é maior que o saldo a receber do pedido.',
  PEDIDO_CANCELADO: 'Pedido cancelado não aceita pagamento.',
  PEDIDO_FINALIZADO: 'Pedido já finalizado: não há saldo a receber.',
  PARCELA_INEXISTENTE: 'A parcela informada não existe neste pedido.',
  CARTAO_NAO_PARCELA: 'Cartão não pode ser lançado como parcela prevista.',
  PARCELAS_NAO_FECHAM: 'A soma das parcelas não fecha com o saldo do pedido.',
  TOTAL_ABAIXO_DO_PAGO: 'O novo total não pode ficar abaixo do que já foi pago.',
  PARCELAS_NAO_REAJUSTADAS: 'Reajuste as parcelas previstas ao novo total do pedido.',
  FORMA_INVALIDA: 'Forma de pagamento inválida.'
};

/** Erro de regra vira a mensagem do código; qualquer outro erro usa o fallback de quem chama. */
export function mensagemDoErroDePagamento(error: unknown, fallback: string): string {
  if (error instanceof PagamentoInvalidoError) {
    return MENSAGENS_PAGAMENTO[error.codigo] ?? error.message;
  }
  return fallback;
}
