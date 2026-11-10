/**
 * Montagem do modelo recorrente e do pedido de cada ocorrencia (regra-de-negocio.md secao 5.4).
 * Funcoes puras: precos vem dos produtos atuais passados por parametro.
 */
import { Timestamp } from '@angular/fire/firestore';
import { Order, OrderItem } from '../../models/order-model';
import {
  RecurringOrder, RecurringOrderItem
} from '../../models/recurring-order-model';
import { calcularTotalDoPedido } from '../order-service/order-payment-rules';
import {
  AgendaDeRecorrencia, CivilDate, MODELO_ATIVO, RecorrenciaInvalidaError, dataDoAgendamento,
  validarAgenda
} from './recurrence-rules';

export interface ProdutoAtual {
  id: string;
  companyId: string;
  title: string;
  sellPrice: number;
  buyPrice: number;
  soldByWeight?: boolean;
}

export type ProblemaDaOcorrencia = { code: 'PRODUTO_INDISPONIVEL'; detail: string };

export type NovoPedidoRecorrente =
  Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'companyId'> & { status: 'pending' };

export type ResultadoOcorrencia =
  | { ok: true; pedido: NovoPedidoRecorrente }
  | { ok: false; problema: ProblemaDaOcorrencia };

export type NovoModeloRecorrente = Omit<RecurringOrder, 'id' | 'companyId' | 'createdAt'>;

type MoldeOpcional = Pick<Order,
  'customerId' | 'customerPhone' | 'address' | 'addressLat' | 'addressLng'
  | 'observations' | 'vendedorId' | 'vendedorName'>;

const STATUS_PEDIDO_GERADO = 'pending' as const;
const PRODUTO_INDISPONIVEL = 'PRODUTO_INDISPONIVEL' as const;

/** Remove as chaves cujo valor e undefined (Firestore rejeita undefined). */
function semUndefined<T extends object>(objeto: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(objeto).filter(([, valor]) => valor !== undefined)
  ) as Partial<T>;
}

function camposOpcionaisDoMolde(molde: MoldeOpcional): Partial<MoldeOpcional> {
  return semUndefined({
    customerId: molde.customerId,
    customerPhone: molde.customerPhone,
    address: molde.address,
    addressLat: molde.addressLat,
    addressLng: molde.addressLng,
    observations: molde.observations,
    vendedorId: molde.vendedorId,
    vendedorName: molde.vendedorName
  });
}

const quantidadeEhValida = (quantidade: number): boolean =>
  Number.isFinite(quantidade) && quantidade > 0;

const precoEhValido = (preco: number): boolean => Number.isFinite(preco) && preco >= 0;

export function validarItensDoModelo(itens: readonly Pick<OrderItem, 'quantity'>[]): void {
  if (itens.length === 0 || !itens.every(item => quantidadeEhValida(item.quantity))) {
    throw new RecorrenciaInvalidaError(
      'ITENS_INVALIDOS',
      'Pedido recorrente exige itens nao vazios com quantidade maior que zero.'
    );
  }
}

/** Item do modelo (sem preco). Serve ao pedido de origem e a copias de itens ja gravados. */
export function itemDoModelo(
  item: Pick<OrderItem, 'idProduct' | 'productName' | 'quantity' | 'soldByWeight'>
): RecurringOrderItem {
  return {
    idProduct: item.idProduct,
    productName: item.productName,
    quantity: item.quantity,
    ...semUndefined({ soldByWeight: item.soldByWeight })
  };
}

function copiarDiasDaSemana(weekdays: number[] | undefined): number[] | undefined {
  return weekdays === undefined ? undefined : [...weekdays];
}

/** Remove precos, valida a agenda, status 'active', generateFrom = startDate. */
export function montarModeloDoPedido(pedido: Order, agenda: AgendaDeRecorrencia): NovoModeloRecorrente {
  validarAgenda(agenda);
  validarItensDoModelo(pedido.items);
  return {
    status: MODELO_ATIVO,
    frequency: agenda.frequency,
    startDate: agenda.startDate,
    generateFrom: agenda.startDate,
    customerName: pedido.customerName,
    shippingCost: pedido.shippingCost,
    deliveryType: pedido.deliveryType,
    items: pedido.items.map(itemDoModelo),
    ...semUndefined({
      sourceOrderId: pedido.id,
      weekdays: copiarDiasDaSemana(agenda.weekdays),
      endDate: agenda.endDate
    }),
    ...camposOpcionaisDoMolde(pedido)
  };
}

/** Produto so e utilizavel se existe, e da mesma empresa, mesmo tipo (peso/unidade), com preco e custo validos. */
function produtoEstaDisponivel(
  produto: ProdutoAtual | undefined,
  companyId: string,
  item: RecurringOrderItem
): produto is ProdutoAtual {
  return produto !== undefined
    && produto.companyId === companyId
    && Boolean(produto.soldByWeight) === Boolean(item.soldByWeight)
    && precoEhValido(produto.sellPrice)
    && precoEhValido(produto.buyPrice);
}

function problemaDeProdutoIndisponivel(item: RecurringOrderItem): ResultadoOcorrencia {
  return {
    ok: false,
    problema: {
      code: PRODUTO_INDISPONIVEL,
      detail: `Produto "${item.productName}" indisponivel para a recorrencia.`
    }
  };
}

/** Item do pedido gerado: nome, preco e custo atuais do produto; quantidade do modelo. */
function itemDoPedido(item: RecurringOrderItem, produto: ProdutoAtual): OrderItem {
  return {
    idProduct: item.idProduct,
    productName: produto.title,
    quantity: item.quantity,
    priceAtSale: produto.sellPrice,
    priceAtCost: produto.buyPrice,
    ...(produto.soldByWeight ? { soldByWeight: true } : {})
  };
}

function pedidoComItens(
  modelo: RecurringOrder,
  data: CivilDate,
  itens: OrderItem[]
): NovoPedidoRecorrente {
  const { itemsTotal, total } = calcularTotalDoPedido(itens, modelo.shippingCost);
  return {
    status: STATUS_PEDIDO_GERADO,
    customerName: modelo.customerName,
    shippingCost: modelo.shippingCost,
    deliveryType: modelo.deliveryType,
    items: itens,
    itemsTotal,
    total,
    scheduledDate: Timestamp.fromDate(dataDoAgendamento(data)),
    occurrenceDate: data,
    ...semUndefined({ recurringOrderId: modelo.id }),
    ...camposOpcionaisDoMolde(modelo)
  };
}

/**
 * Preco/custo atuais; produto ausente, de outra empresa, de tipo divergente (peso/unidade),
 * ou preco ou custo nao finito/negativo (ausente incluso) => PRODUTO_INDISPONIVEL e a ocorrencia
 * inteira e pulada. Zero e aceito. Preenche recurringOrderId, occurrenceDate, scheduledDate e totais.
 */
export function montarPedidoDaOcorrencia(
  modelo: RecurringOrder,
  data: CivilDate,
  produtos: ReadonlyMap<string, ProdutoAtual>
): ResultadoOcorrencia {
  const itens: OrderItem[] = [];
  for (const item of modelo.items) {
    const produto = produtos.get(item.idProduct);
    if (!produtoEstaDisponivel(produto, modelo.companyId, item)) {
      return problemaDeProdutoIndisponivel(item);
    }
    itens.push(itemDoPedido(item, produto));
  }
  return { ok: true, pedido: pedidoComItens(modelo, data, itens) };
}

/** Alteracao do modelo: null em endDate/weekdays significa remover o campo. */
export type AlteracaoDoModelo = Partial<Pick<RecurringOrder,
  'items' | 'frequency' | 'shippingCost' | 'observations' |
  'address' | 'addressLat' | 'addressLng' | 'deliveryType'>> & {
  weekdays?: number[] | null;
  endDate?: string | null;
};

/** Campos a gravar: valor null = remover o campo (o service traduz para deleteField). */
export type CamposAlterados = Record<string, unknown>;

const CAMPOS_EDITAVEIS: readonly string[] = [
  'items', 'frequency', 'weekdays', 'endDate', 'shippingCost', 'observations',
  'address', 'addressLat', 'addressLng', 'deliveryType'
];
const CAMPOS_DA_AGENDA: readonly string[] = ['frequency', 'weekdays', 'endDate'];

/** Campos permitidos do modelo, validados; agenda revalidada com startDate atual. */
export function dadosValidadosDaAlteracao(
  modelo: RecurringOrder,
  alteracao: AlteracaoDoModelo
): CamposAlterados {
  const dados = camposEditaveis(alteracao);
  const campos: CamposAlterados = { ...dados };
  if (dados.items !== undefined) {
    validarItensDoModelo(dados.items);
    campos['items'] = dados.items.map(item => itemDoModelo(item));
  }
  if (CAMPOS_DA_AGENDA.some(campo => campo in dados)) {
    CAMPOS_DA_AGENDA.forEach(campo => delete campos[campo]);
    Object.assign(campos, camposDaAgenda(modelo, dados));
  }
  return campos;
}

function camposEditaveis(alteracao: AlteracaoDoModelo): AlteracaoDoModelo {
  return Object.fromEntries(
    Object.entries(alteracao).filter(
      ([campo, valor]) => valor !== undefined && CAMPOS_EDITAVEIS.includes(campo)
    )
  ) as AlteracaoDoModelo;
}

/** Valida a agenda final (modelo + alteracao) e devolve so os campos da agenda. */
function camposDaAgenda(modelo: RecurringOrder, dados: AlteracaoDoModelo): CamposAlterados {
  const agenda = agendaAposAlteracao(modelo, dados);
  validarAgenda(agenda);
  return {
    frequency: agenda.frequency,
    weekdays: agenda.weekdays ?? null,
    endDate: agenda.endDate ?? null
  };
}

function agendaAposAlteracao(modelo: RecurringOrder, dados: AlteracaoDoModelo): AgendaDeRecorrencia {
  const frequency = dados.frequency ?? modelo.frequency;
  return {
    frequency,
    startDate: modelo.startDate,
    weekdays: weekdaysAposAlteracao(modelo, dados, frequency),
    endDate: dados.endDate === null ? undefined : (dados.endDate ?? modelo.endDate)
  };
}

/** weekdays so existe em frequency 'weekdays': trocar de frequency remove os dias gravados. */
function weekdaysAposAlteracao(
  modelo: RecurringOrder,
  dados: AlteracaoDoModelo,
  frequency: RecurringOrder['frequency']
): number[] | undefined {
  if (dados.weekdays === null) {
    return undefined;
  }
  if (dados.weekdays !== undefined) {
    return dados.weekdays;
  }
  return frequency === 'weekdays' ? modelo.weekdays : undefined;
}
