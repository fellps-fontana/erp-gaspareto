/**
 * Agregacoes puras do Relatorio (Vendas/Balanco): cards, modais de detalhe e Top 5.
 *
 * Sem Angular e sem Firestore. Fonte unica de filtro: filtrarVendas. Card, modais e
 * graficos derivam do MESMO VendaFiltrada[] — por isso a soma das linhas de cada
 * modal bate com o card (invariante obrigatoria).
 * Referencia: regra-de-negocio.md secoes 3 (vendas, cancelada fora) e 5.3 (competencia).
 *
 * Dinheiro: cada linha de item e arredondada a centavos por calcularTotalItemPorPeso
 * (mesma regra do peso, product-weight-rules) e toda soma e feita em centavos inteiros.
 * Quantidade soma em milesimos (no maximo 3 casas, MAX_CASAS_DECIMAIS_PESO).
 */
import { Product } from '../../models/product-model';
import { PAYMENT_METHOD_LABELS, PaymentMethod, Sale, SaleItem } from '../../models/sell-model';
import {
  calcularTotalItemPorPeso,
  MAX_CASAS_DECIMAIS_PESO,
} from '../product-service/product-weight-rules';

// ---------- tipos de entrada ----------

export type OrigemVenda = 'pdv' | 'order';

/** Sale + status gravado pelo sale-service (o model Sale ainda nao declara o campo). */
export type VendaRelatorio = Sale & { status?: string };

/** Mesma semantica dos filtro* do componente: '' = sem filtro; 'todos' = sem filtro. */
export interface FiltroRelatorio {
  inicio: Date; // inclusivo
  fim: Date; // inclusivo
  produtoId: string;
  origem: OrigemVenda | 'todos';
  clienteId: string;
  formaPagamento: PaymentMethod | 'todos';
}

export type ProdutoRef = Pick<Product, 'title' | 'soldByWeight'>;
export type ProdutosPorId = ReadonlyMap<string, ProdutoRef>;
export type NomesClientes = ReadonlyMap<string, string>; // customerId -> nome

// ---------- tipos de saida ----------

export const LIMITE_TOP = 5;
export const ROTULO_OUTROS = 'Outros';
export const ROTULO_BALCAO = 'Balcão';
export const ROTULO_SEM_CLIENTE = 'Sem cliente';
export const ROTULO_CLIENTE_NAO_ENCONTRADO = 'Cliente não encontrado';
export const ROTULO_FORMA_PENDENTE = 'Em aberto';
export const ROTULO_PRODUTO_SEM_NOME = 'Produto S/N';

/** Venda que passou no filtro; itens ja reduzidos ao produto filtrado, se houver. */
export interface VendaFiltrada {
  venda: VendaRelatorio;
  data: Date;
  itens: SaleItem[];
  valor: number; // soma de valorDoItem (NUNCA venda.total; frete fora)
  custo: number; // soma de custoDoItem
}

export interface CardsRelatorio {
  faturamento: number;
  custoTotal: number;
  lucro: number; // lucro BRUTO = faturamento - custoTotal
  qtdVendas: number; // vendas que entraram no filtro
  margem: number; // % ; 0 se faturamento <= 0
}

export interface VendaListada {
  id: string;
  data: Date;
  origem: OrigemVenda;
  clienteNome: string; // 'Balcão' | 'Sem cliente' | nome | 'Cliente não encontrado'
  formaPagamento: PaymentMethod | null;
  formaPagamentoLabel: string; // label pt-BR ou 'Em aberto'
  valor: number;
}

export interface FatiaProduto {
  idProduct: string | null; // null = fatia 'Outros'
  nome: string;
  valor: number;
  percentual: number; // 0-100 sobre a soma das fatias (produtos com valor > 0)
}

export interface ValorDia {
  dia: string; // 'yyyy-MM-dd' civil local (a UI formata)
  valor: number;
}

export interface LinhaCliente {
  tipo: 'cliente' | 'balcao' | 'sem-cliente';
  clienteId: string | null;
  nome: string;
  qtdVendas: number;
  valor: number;
}

export type DetalheFaturamento =
  | { modo: 'geral'; total: number; vendas: VendaListada[]; pizza: FatiaProduto[] }
  | { modo: 'produto'; total: number; porDia: ValorDia[]; porCliente: LinhaCliente[] };

export interface LinhaCmv {
  idProduct: string;
  nome: string;
  porPeso: boolean; // true = quantidade em kg
  quantidade: number;
  custoUnitarioMedio: number; // custoTotal / quantidade (media ponderada); 0 se quantidade 0
  custoTotal: number;
  custoZero: boolean; // algum item da linha com priceAtCost ausente/0
}

export interface LinhaLucro {
  idProduct: string;
  nome: string;
  faturamento: number;
  custo: number;
  lucro: number;
  margem: number; // % ; 0 se faturamento <= 0
}

export interface ItemRanking {
  idProduct: string;
  nome: string;
  quantidade: number;
}

/** Dois rankings independentes: unidade e kg NUNCA se somam nem se ordenam juntos. */
export interface RankingQuantidade {
  unidade: ItemRanking[];
  peso: ItemRanking[];
}

export type ModoTop = 'unidade' | 'peso';

// ---------- constantes internas ----------

const STATUS_CANCELADA = 'canceled';
const ORIGEM_PDV: OrigemVenda = 'pdv';
const ORIGEM_PEDIDO: OrigemVenda = 'order';
const SEM_FILTRO = '';
const TODOS = 'todos';
const CENTAVOS_POR_UNIDADE = 100;
const MULTIPLICADOR_QUANTIDADE = 10 ** MAX_CASAS_DECIMAIS_PESO;
const LOCALE_NOMES = 'pt-BR';

// ---------- conversoes e somas ----------

const paraCentavos = (valor: number): number => Math.round(valor * CENTAVOS_POR_UNIDADE);
const deCentavos = (centavos: number): number => centavos / CENTAVOS_POR_UNIDADE;
const somaEmCentavos = (valores: readonly number[]): number =>
  valores.reduce((acc, valor) => acc + paraCentavos(valor), 0);
const paraMilesimos = (quantidade: number): number =>
  Math.round(quantidade * MULTIPLICADOR_QUANTIDADE);
const deMilesimos = (milesimos: number): number => milesimos / MULTIPLICADOR_QUANTIDADE;
const percentual = (parte: number, base: number): number => (base > 0 ? (parte / base) * 100 : 0);

// ---------- item ----------

/** priceAtSale * quantity, arredondado a centavos (regra do peso, product-weight-rules). */
export function valorDoItem(item: SaleItem): number {
  return calcularTotalItemPorPeso(item.priceAtSale, item.quantity);
}

/** (priceAtCost ausente/nao finito => 0) * quantity, arredondado a centavos. */
export function custoDoItem(item: SaleItem): number {
  return calcularTotalItemPorPeso(item.priceAtCost, item.quantity);
}

/** item.soldByWeight quando definido (inclusive false); senao produto?.soldByWeight; senao false. */
export function itemEhPorPeso(item: SaleItem, produto: ProdutoRef | undefined): boolean {
  return item.soldByWeight ?? produto?.soldByWeight ?? false;
}

/** Sale.date Timestamp (toDate) ou Date (ou valor aceito por new Date). Invalida => Invalid Date. */
export function dataDaVenda(venda: VendaRelatorio): Date {
  const data: unknown = venda.date;
  if (ehTimestamp(data)) {
    return data.toDate();
  }
  if (data === null || data === undefined) {
    return new Date(NaN);
  }
  return new Date(data as string | number | Date);
}

function ehTimestamp(valor: unknown): valor is { toDate(): Date } {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    typeof (valor as { toDate?: unknown }).toDate === 'function'
  );
}

// ---------- filtro unico ----------

/**
 * UNICO ponto de filtro. Ordem de exclusao: status 'canceled'; data fora de [inicio, fim] (ou
 * invalida); origem; clienteId; formaPagamento (venda sem forma NAO passa se o filtro != 'todos');
 * produto (reduz os itens; venda sem item restante, ou sem itens, sai). Preserva a ordem de entrada.
 */
export function filtrarVendas(
  vendas: readonly VendaRelatorio[],
  filtro: FiltroRelatorio,
): VendaFiltrada[] {
  return vendas.flatMap((venda) => {
    const filtrada = montarVendaFiltrada(venda, filtro);
    return filtrada ? [filtrada] : [];
  });
}

/** Mesmo filtro, ignorando produto/origem/cliente/forma (uso do Balanco). */
export function filtroSomentePeriodo(filtro: FiltroRelatorio): FiltroRelatorio {
  return {
    inicio: filtro.inicio,
    fim: filtro.fim,
    produtoId: SEM_FILTRO,
    origem: TODOS,
    clienteId: SEM_FILTRO,
    formaPagamento: TODOS,
  };
}

function montarVendaFiltrada(venda: VendaRelatorio, filtro: FiltroRelatorio): VendaFiltrada | null {
  if (venda.status === STATUS_CANCELADA) {
    return null;
  }
  const data = dataDaVenda(venda);
  if (!estaNoPeriodo(data, filtro) || !passaFiltrosDeVenda(venda, filtro)) {
    return null;
  }
  const itens = itensDoProduto(venda, filtro.produtoId);
  if (itens.length === 0) {
    return null;
  }
  return {
    venda,
    data,
    itens,
    valor: deCentavos(somaEmCentavos(itens.map(valorDoItem))),
    custo: deCentavos(somaEmCentavos(itens.map(custoDoItem))),
  };
}

function estaNoPeriodo(data: Date, filtro: FiltroRelatorio): boolean {
  const instante = data.getTime();
  return (
    !Number.isNaN(instante) &&
    instante >= filtro.inicio.getTime() &&
    instante <= filtro.fim.getTime()
  );
}

function passaFiltrosDeVenda(venda: VendaRelatorio, filtro: FiltroRelatorio): boolean {
  return (
    passaOrigem(venda, filtro.origem) &&
    passaCliente(venda, filtro.clienteId) &&
    passaForma(venda, filtro.formaPagamento)
  );
}

function passaOrigem(venda: VendaRelatorio, origem: OrigemVenda | 'todos'): boolean {
  return !ehFiltroAtivo(origem) || venda.sale_type === origem;
}

function passaCliente(venda: VendaRelatorio, clienteId: string): boolean {
  if (!ehFiltroAtivo(clienteId)) {
    return true;
  }
  return venda.sale_type === ORIGEM_PEDIDO && venda.customerId === clienteId;
}

function passaForma(venda: VendaRelatorio, forma: PaymentMethod | 'todos'): boolean {
  return !ehFiltroAtivo(forma) || venda.paymentMethod === forma;
}

function itensDoProduto(venda: VendaRelatorio, produtoId: string): SaleItem[] {
  const itens = venda.items ?? [];
  return ehFiltroAtivo(produtoId) ? itens.filter((item) => item.idProduct === produtoId) : itens;
}

function ehFiltroAtivo(valor: string): boolean {
  return valor !== SEM_FILTRO && valor !== TODOS;
}

// ---------- cards ----------

export function calcularCards(vendas: readonly VendaFiltrada[]): CardsRelatorio {
  const faturamentoC = somaEmCentavos(vendas.map((venda) => venda.valor));
  const custoC = somaEmCentavos(vendas.map((venda) => venda.custo));
  const lucroC = faturamentoC - custoC;
  return {
    faturamento: deCentavos(faturamentoC),
    custoTotal: deCentavos(custoC),
    lucro: deCentavos(lucroC),
    qtdVendas: vendas.length,
    margem: percentual(lucroC, faturamentoC),
  };
}

/** Soma item.quantity dos itens do produto (unidades ou kg, 3 casas) nas vendas filtradas. */
export function somarQuantidadeDoProduto(
  vendas: readonly VendaFiltrada[],
  produtoId: string,
): number {
  const milesimos = itensDe(vendas)
    .filter((item) => item.idProduct === produtoId)
    .reduce((acc, item) => acc + paraMilesimos(item.quantity), 0);
  return deMilesimos(milesimos);
}

// ---------- modal Faturamento ----------

/** 'produto' se filtro.produtoId nao vazio, senao 'geral'. */
export function modoDetalheFaturamento(filtro: FiltroRelatorio): 'geral' | 'produto' {
  return ehFiltroAtivo(filtro.produtoId) ? 'produto' : 'geral';
}

export function montarDetalheFaturamento(
  vendas: readonly VendaFiltrada[],
  filtro: FiltroRelatorio,
  produtos: ProdutosPorId,
  clientes: NomesClientes,
): DetalheFaturamento {
  const total = calcularCards(vendas).faturamento;
  if (modoDetalheFaturamento(filtro) === 'produto') {
    return {
      modo: 'produto',
      total,
      porDia: serieDiaria(vendas, filtro.inicio, filtro.fim),
      porCliente: agruparPorCliente(vendas, clientes),
    };
  }
  return {
    modo: 'geral',
    total,
    vendas: listarVendas(vendas, clientes),
    pizza: fatiasPorProduto(vendas, produtos),
  };
}

/** Ordenada por data desc (desempate por id). valor = VendaFiltrada.valor. */
export function listarVendas(
  vendas: readonly VendaFiltrada[],
  clientes: NomesClientes,
): VendaListada[] {
  return vendas
    .map((venda) => toVendaListada(venda, clientes))
    .sort((a, b) => b.data.getTime() - a.data.getTime() || compararId(a.id, b.id));
}

function toVendaListada(vendaFiltrada: VendaFiltrada, clientes: NomesClientes): VendaListada {
  const { venda } = vendaFiltrada;
  return {
    id: venda.id ?? '',
    data: vendaFiltrada.data,
    origem: venda.sale_type,
    clienteNome: identificarCliente(venda, clientes).nome,
    formaPagamento: venda.paymentMethod ?? null,
    formaPagamentoLabel: rotuloForma(venda.paymentMethod),
    valor: vendaFiltrada.valor,
  };
}

function rotuloForma(paymentMethod: PaymentMethod | undefined): string {
  return paymentMethod ? PAYMENT_METHOD_LABELS[paymentMethod] : ROTULO_FORMA_PENDENTE;
}

/** Agrupa por idProduct, valor desc (desempate nome, id); top `limite` + 'Outros' (so se sobrar). Valor <= 0 nao gera fatia. */
export function fatiasPorProduto(
  vendas: readonly VendaFiltrada[],
  produtos: ProdutosPorId,
  limite: number = LIMITE_TOP,
): FatiaProduto[] {
  const resumos = resumirPorProduto(vendas, produtos)
    .filter((resumo) => resumo.valorC > 0)
    .sort(compararPorValor);
  const total = resumos.reduce((acc, resumo) => acc + resumo.valorC, 0);
  const principais = resumos
    .slice(0, limite)
    .map((resumo) => toFatia(resumo.idProduct, resumo.nome, resumo.valorC, total));
  const restantes = resumos.slice(limite);
  if (restantes.length === 0) {
    return principais;
  }
  const outrosC = restantes.reduce((acc, resumo) => acc + resumo.valorC, 0);
  return [...principais, toFatia(null, ROTULO_OUTROS, outrosC, total)];
}

function toFatia(
  idProduct: string | null,
  nome: string,
  valorC: number,
  totalC: number,
): FatiaProduto {
  return { idProduct, nome, valor: deCentavos(valorC), percentual: percentual(valorC, totalC) };
}

/** Um ponto por dia de inicio a fim (inclusive), dias sem venda = 0. Alimenta barras do modal e o grafico de evolucao. */
export function serieDiaria(vendas: readonly VendaFiltrada[], inicio: Date, fim: Date): ValorDia[] {
  const centavosPorDia = somarCentavosPorDia(vendas);
  const serie: ValorDia[] = [];
  const ultimoDia = inicioDoDia(fim);
  for (let cursor = inicioDoDia(inicio); cursor <= ultimoDia; cursor = diaSeguinte(cursor)) {
    const dia = chaveDia(cursor);
    serie.push({ dia, valor: deCentavos(centavosPorDia.get(dia) ?? 0) });
  }
  return serie;
}

function somarCentavosPorDia(vendas: readonly VendaFiltrada[]): Map<string, number> {
  const centavosPorDia = new Map<string, number>();
  for (const venda of vendas) {
    const dia = chaveDia(venda.data);
    centavosPorDia.set(dia, (centavosPorDia.get(dia) ?? 0) + paraCentavos(venda.valor));
  }
  return centavosPorDia;
}

function inicioDoDia(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

function diaSeguinte(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate() + 1);
}

function chaveDia(data: Date): string {
  const ano = String(data.getFullYear()).padStart(4, '0');
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const diaDoMes = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${diaDoMes}`;
}

/** Balcao (pdv) e Sem cliente (order sem customerId) sao linhas proprias. Valor desc (desempate nome). */
export function agruparPorCliente(
  vendas: readonly VendaFiltrada[],
  clientes: NomesClientes,
): LinhaCliente[] {
  return agrupar(vendas, (venda) => chaveDoCliente(identificarCliente(venda.venda, clientes)))
    .map((grupo) => linhaDoCliente(grupo, clientes))
    .sort(compararLinhasCliente);
}

type IdentidadeCliente = Pick<LinhaCliente, 'tipo' | 'clienteId' | 'nome'>;

function identificarCliente(venda: VendaRelatorio, clientes: NomesClientes): IdentidadeCliente {
  if (venda.sale_type === ORIGEM_PDV) {
    return { tipo: 'balcao', clienteId: null, nome: ROTULO_BALCAO };
  }
  if (!venda.customerId) {
    return { tipo: 'sem-cliente', clienteId: null, nome: ROTULO_SEM_CLIENTE };
  }
  return {
    tipo: 'cliente',
    clienteId: venda.customerId,
    nome: clientes.get(venda.customerId) ?? ROTULO_CLIENTE_NAO_ENCONTRADO,
  };
}

function chaveDoCliente(identidade: IdentidadeCliente): string {
  return `${identidade.tipo}|${identidade.clienteId ?? ''}`;
}

function linhaDoCliente(grupo: readonly VendaFiltrada[], clientes: NomesClientes): LinhaCliente {
  return {
    ...identificarCliente(grupo[0].venda, clientes),
    qtdVendas: grupo.length,
    valor: deCentavos(somaEmCentavos(grupo.map((venda) => venda.valor))),
  };
}

// ---------- modais CMV e Lucro Bruto ----------

/** Chave (idProduct, porPeso). Ordem: custoZero primeiro, depois custoTotal desc, depois nome. */
export function montarDetalheCmv(
  vendas: readonly VendaFiltrada[],
  produtos: ProdutosPorId,
): LinhaCmv[] {
  return agruparPorModoEProduto(itensDe(vendas), produtos).map(toLinhaCmv).sort(compararLinhasCmv);
}

/** Chave idProduct. Ordem: lucro desc (desempate nome, id). Inclui lucro negativo/zero. */
export function montarDetalheLucro(
  vendas: readonly VendaFiltrada[],
  produtos: ProdutosPorId,
): LinhaLucro[] {
  return resumirPorProduto(vendas, produtos).sort(compararPorLucro).map(toLinhaLucro);
}

function toLinhaCmv(grupo: GrupoModo): LinhaCmv {
  const { resumo, porPeso } = grupo;
  const quantidade = deMilesimos(resumo.milesimos);
  const custoTotal = deCentavos(resumo.custoC);
  return {
    idProduct: resumo.idProduct,
    nome: resumo.nome,
    porPeso,
    quantidade,
    custoUnitarioMedio: quantidade > 0 ? custoTotal / quantidade : 0,
    custoTotal,
    custoZero: resumo.custoZero,
  };
}

function toLinhaLucro(resumo: ResumoProduto): LinhaLucro {
  return {
    idProduct: resumo.idProduct,
    nome: resumo.nome,
    faturamento: deCentavos(resumo.valorC),
    custo: deCentavos(resumo.custoC),
    lucro: deCentavos(resumo.lucroC),
    margem: percentual(resumo.lucroC, resumo.valorC),
  };
}

// ---------- Top 5 (quantidade) ----------

/** Chave (idProduct, porPeso). Cada lista: quantidade desc (desempate nome, id), no maximo `limite`. Sem 'Outros'. */
export function rankingTopQuantidade(
  vendas: readonly VendaFiltrada[],
  produtos: ProdutosPorId,
  limite: number = LIMITE_TOP,
): RankingQuantidade {
  const grupos = agruparPorModoEProduto(itensDe(vendas), produtos);
  return {
    unidade: rankingDoModo(grupos, false, limite),
    peso: rankingDoModo(grupos, true, limite),
  };
}

function rankingDoModo(
  grupos: readonly GrupoModo[],
  porPeso: boolean,
  limite: number,
): ItemRanking[] {
  return grupos
    .filter((grupo) => grupo.porPeso === porPeso)
    .map((grupo) => ({
      idProduct: grupo.resumo.idProduct,
      nome: grupo.resumo.nome,
      quantidade: deMilesimos(grupo.resumo.milesimos),
    }))
    .sort(compararItensRanking)
    .slice(0, limite);
}

/** Preferido, exceto se a lista dele esta vazia e a outra nao (cai na outra). Ambas vazias => preferido. */
export function modoTopEfetivo(ranking: RankingQuantidade, preferido: ModoTop): ModoTop {
  const outro: ModoTop = preferido === 'unidade' ? 'peso' : 'unidade';
  const preferidoVazio = ranking[preferido].length === 0;
  const outroTemDados = ranking[outro].length > 0;
  return preferidoVazio && outroTemDados ? outro : preferido;
}

// ---------- agregacao por produto e por modo (unidade/peso) ----------

/** Resumo de um grupo de itens do mesmo produto (ou do mesmo produto no mesmo modo). Dinheiro em centavos. */
interface ResumoProduto {
  idProduct: string;
  nome: string;
  valorC: number;
  custoC: number;
  lucroC: number;
  milesimos: number; // quantidade em milesimos (3 casas)
  custoZero: boolean;
}

interface GrupoModo {
  porPeso: boolean;
  resumo: ResumoProduto;
}

function itensDe(vendas: readonly VendaFiltrada[]): SaleItem[] {
  return vendas.flatMap((venda) => venda.itens);
}

function resumirPorProduto(
  vendas: readonly VendaFiltrada[],
  produtos: ProdutosPorId,
): ResumoProduto[] {
  return agrupar(itensDe(vendas), (item) => item.idProduct).map((grupo) =>
    resumirItens(grupo, produtos),
  );
}

function agruparPorModoEProduto(itens: readonly SaleItem[], produtos: ProdutosPorId): GrupoModo[] {
  return agrupar(itens, (item) => chaveDoModoEProduto(item, produtos)).map((grupo) => ({
    porPeso: itemEhPorPeso(grupo[0], produtos.get(grupo[0].idProduct)),
    resumo: resumirItens(grupo, produtos),
  }));
}

function chaveDoModoEProduto(item: SaleItem, produtos: ProdutosPorId): string {
  const modo = itemEhPorPeso(item, produtos.get(item.idProduct)) ? 'peso' : 'unidade';
  return `${modo}|${item.idProduct}`;
}

function resumirItens(itens: readonly SaleItem[], produtos: ProdutosPorId): ResumoProduto {
  const { idProduct } = itens[0];
  const valorC = somaEmCentavos(itens.map(valorDoItem));
  const custoC = somaEmCentavos(itens.map(custoDoItem));
  return {
    idProduct,
    nome: nomeDoProduto(idProduct, itens, produtos),
    valorC,
    custoC,
    lucroC: valorC - custoC,
    milesimos: itens.reduce((acc, item) => acc + paraMilesimos(item.quantity), 0),
    custoZero: itens.some(semCustoInformado),
  };
}

function semCustoInformado(item: SaleItem): boolean {
  return !Number.isFinite(item.priceAtCost) || item.priceAtCost <= 0;
}

/** productName do primeiro item com nome preenchido; senao titulo do produto; senao rotulo. */
function nomeDoProduto(
  idProduct: string,
  itens: readonly SaleItem[],
  produtos: ProdutosPorId,
): string {
  const nomeNoItem = itens.map((item) => item.productName).find(textoPreenchido);
  if (nomeNoItem) {
    return nomeNoItem;
  }
  const titulo = produtos.get(idProduct)?.title;
  return textoPreenchido(titulo) ? titulo : ROTULO_PRODUTO_SEM_NOME;
}

function textoPreenchido(texto: string | undefined): texto is string {
  return typeof texto === 'string' && texto.trim() !== '';
}

/** Agrupa preservando a ordem de primeira aparicao de cada chave. */
function agrupar<T>(itens: readonly T[], chaveDe: (item: T) => string): T[][] {
  const grupos = new Map<string, T[]>();
  for (const item of itens) {
    const chave = chaveDe(item);
    const grupo = grupos.get(chave);
    if (grupo) {
      grupo.push(item);
    } else {
      grupos.set(chave, [item]);
    }
  }
  return Array.from(grupos.values());
}

// ---------- comparadores ----------

function compararNomes(a: string, b: string): number {
  return a.localeCompare(b, LOCALE_NOMES);
}

function compararId(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

function compararPorValor(a: ResumoProduto, b: ResumoProduto): number {
  return (
    b.valorC - a.valorC || compararNomes(a.nome, b.nome) || compararId(a.idProduct, b.idProduct)
  );
}

function compararPorLucro(a: ResumoProduto, b: ResumoProduto): number {
  return (
    b.lucroC - a.lucroC || compararNomes(a.nome, b.nome) || compararId(a.idProduct, b.idProduct)
  );
}

function compararLinhasCmv(a: LinhaCmv, b: LinhaCmv): number {
  return (
    Number(b.custoZero) - Number(a.custoZero) ||
    b.custoTotal - a.custoTotal ||
    compararNomes(a.nome, b.nome) ||
    compararId(a.idProduct, b.idProduct) ||
    Number(a.porPeso) - Number(b.porPeso)
  );
}

function compararItensRanking(a: ItemRanking, b: ItemRanking): number {
  return (
    b.quantidade - a.quantidade ||
    compararNomes(a.nome, b.nome) ||
    compararId(a.idProduct, b.idProduct)
  );
}

function compararLinhasCliente(a: LinhaCliente, b: LinhaCliente): number {
  return (
    b.valor - a.valor ||
    compararNomes(a.nome, b.nome) ||
    compararId(chaveDoCliente(a), chaveDoCliente(b))
  );
}
