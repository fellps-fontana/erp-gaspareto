import {
  ChargeNotice, ChargeNoticeKind, ChargeStatus, CivilDate, Competence,
  SubscriptionCharge, SubscriptionConfig, SubscriptionConfigInput
} from '../../models/subscription-model';
import {
  diasNoMes, diferencaEmDias, ehDataCivilValida, formatarCivil
} from '../recurring-order-service/recurrence-rules';

/** Dias de antecedencia do aviso de vencimento (regra-de-negocio.md secao 14). */
export const DIAS_DE_AVISO = 5;
export const STATUS_A_PAGAR: ChargeStatus = 'a_pagar';
export const STATUS_PAGO: ChargeStatus = 'pago';

export type CodigoMensalidadeInvalida =
  | 'VALOR_INVALIDO'
  | 'DIA_VENCIMENTO_INVALIDO'
  | 'INICIO_INVALIDO'
  | 'JA_PAGA'
  | 'NAO_PAGA'
  | 'DATA_PAGAMENTO_INVALIDA'
  | 'COBRANCA_NAO_ENCONTRADA';

/** Erro de regra da mensalidade; `codigo` e o contrato estavel lido por UI e testes. */
export class MensalidadeInvalidaError extends Error {
  constructor(public readonly codigo: CodigoMensalidadeInvalida, message: string) {
    super(message);
    this.name = 'MensalidadeInvalidaError';
  }
}

/**
 * Geracao terminou com falha em parte das empresas: as demais foram processadas
 * (idempotencia torna seguro repetir). `criadas` conta as cobrancas gravadas.
 */
export class GeracaoParcialError extends Error {
  constructor(
    public readonly criadas: number,
    public readonly empresasComFalha: readonly string[],
  ) {
    super(`Falha ao gerar mensalidade de ${empresasComFalha.length} empresa(s).`);
    this.name = 'GeracaoParcialError';
  }
}

/**
 * Trecho unico de texto do aviso, em minusculas, sem prefixo:
 * sem_aviso -> 'a pagar'; pago -> 'paga'; vence 0 -> 'vence hoje';
 * vence 1 -> 'vence em 1 dia'; vence N -> 'vence em N dias';
 * em_atraso 1 -> 'em atraso há 1 dia'; em_atraso N -> 'em atraso há N dias'.
 */
export function textoDoAviso(avisoExibido: ChargeNotice): string {
  if (avisoExibido.kind === AVISO_PAGO) {
    return TEXTO_PAGO;
  }
  if (avisoExibido.kind === AVISO_VENCE) {
    return textoDeVencimento(avisoExibido.days);
  }
  if (avisoExibido.kind === AVISO_EM_ATRASO) {
    return `em atraso há ${textoDeDias(avisoExibido.days)}`;
  }
  return TEXTO_SEM_AVISO;
}

const AVISO_SEM_AVISO: ChargeNoticeKind = 'sem_aviso';
const AVISO_VENCE: ChargeNoticeKind = 'vence';
const AVISO_EM_ATRASO: ChargeNoticeKind = 'em_atraso';
const AVISO_PAGO: ChargeNoticeKind = 'pago';
const TEXTO_SEM_AVISO = 'a pagar';
const TEXTO_PAGO = 'paga';
const TEXTO_VENCE_HOJE = 'vence hoje';
const DIAS_NO_SINGULAR = 1;
const DIA_VENCIMENTO_MINIMO = 1;
const DIA_VENCIMENTO_MAXIMO = 31;
const MESES_POR_ANO = 12;
const CENTAVOS_POR_UNIDADE = 100;
const TOLERANCIA_EM_CENTAVOS = 1e-6;

/** yyyy-MM-dd -> yyyy-MM. */
export function competenciaDe(data: CivilDate): Competence {
  return data.slice(0, 7);
}

/** Dia `diaVencimento` da competencia; mes sem o dia usa o ultimo dia do mes. */
export function dataDeVencimento(competencia: Competence, diaVencimento: number): CivilDate {
  const { ano, mes } = partesDaCompetencia(competencia);
  const dia = Math.min(diaVencimento, diasNoMes(ano, mes - 1));
  return formatarCivil(ano, mes - 1, dia);
}

/** `{companyId}_{yyyyMM}` — id deterministico que garante a idempotencia. */
export function idDaCobranca(companyId: string, competencia: Competence): string {
  return `${companyId}_${competencia.replace('-', '')}`;
}

export function validarConfig(
  config: Pick<SubscriptionConfig, 'amount' | 'dueDay' | 'contractStart'>
): void {
  if (!ehValorMonetarioValido(config.amount)) {
    falhar('VALOR_INVALIDO', 'amount deve ser numero finito maior que zero, com no maximo 2 casas');
  }
  if (!ehDiaDeVencimentoValido(config.dueDay)) {
    falhar('DIA_VENCIMENTO_INVALIDO', 'dueDay deve ser inteiro entre 1 e 31');
  }
  if (!ehDataCivilValida(config.contractStart)) {
    falhar('INICIO_INVALIDO', `contractStart invalido: ${config.contractStart}`);
  }
}

/**
 * generateFrom gravado no save: primeiro save = mes do contractStart; reativar
 * (active false -> true) = mes de hoje; nos demais casos o cursor e mantido.
 */
export function generateFromAoSalvar(
  existente: Pick<SubscriptionConfig, 'active' | 'generateFrom'> | undefined,
  entrada: Pick<SubscriptionConfigInput, 'active' | 'contractStart'>,
  hoje: CivilDate
): Competence {
  if (existente === undefined) {
    return competenciaDe(entrada.contractStart);
  }
  const reativando = !existente.active && entrada.active;
  return reativando ? competenciaDe(hoje) : existente.generateFrom;
}

/**
 * Competencias a gerar, em ordem crescente. Desde o inicio (max de contractStart e
 * generateFrom) ate o mes seguinte ao de hoje: mes posterior ao seguinte nunca
 * satisfaz a janela de aviso, entao nao precisa ser avaliado.
 */
export function competenciasAGerar(
  config: SubscriptionConfig, hoje: CivilDate, existentes: ReadonlySet<Competence>
): Competence[] {
  if (!config.active) {
    return [];
  }
  const inicio = maiorCompetencia(competenciaDe(config.contractStart), config.generateFrom);
  const ultimaElegivel = somarMesesACompetencia(competenciaDe(hoje), 1);
  return competenciasEntre(inicio, ultimaElegivel)
    .filter(competencia => !existentes.has(competencia))
    .filter(competencia => entrouNaJanelaDeGeracao(competencia, config.dueDay, hoje));
}

export function montarCobranca(
  config: SubscriptionConfig, competencia: Competence
): Omit<SubscriptionCharge, 'id' | 'createdAt'> {
  return {
    companyId: config.companyId,
    competence: competencia,
    dueDate: dataDeVencimento(competencia, config.dueDay),
    amount: config.amount,
    status: STATUS_A_PAGAR,
    paidDate: null,
    paidAmount: null,
  };
}

/** Campos gravados ao marcar como paga (sem pagamento parcial). Lanca JA_PAGA. */
export function camposDoPagamento(
  cobranca: Pick<SubscriptionCharge, 'status' | 'amount'>,
  dataPagamento: CivilDate
): Pick<SubscriptionCharge, 'status' | 'paidDate' | 'paidAmount'> {
  if (cobranca.status === STATUS_PAGO) {
    falhar('JA_PAGA', 'cobranca ja esta paga');
  }
  if (!ehDataCivilValida(dataPagamento)) {
    falhar('DATA_PAGAMENTO_INVALIDA', `paidDate invalida: '${dataPagamento}'`);
  }
  return { status: STATUS_PAGO, paidDate: dataPagamento, paidAmount: cobranca.amount };
}

/** Campos gravados ao desfazer pagamento. Lanca NAO_PAGA se a cobranca nao esta paga. */
export function camposDoDesfazimento(
  cobranca: Pick<SubscriptionCharge, 'status'>
): Pick<SubscriptionCharge, 'status' | 'paidDate' | 'paidAmount'> {
  if (cobranca.status !== STATUS_PAGO) {
    falhar('NAO_PAGA', 'cobranca nao esta paga');
  }
  return { status: STATUS_A_PAGAR, paidDate: null, paidAmount: null };
}

export function avisoDaCobranca(
  cobranca: Pick<SubscriptionCharge, 'status' | 'dueDate'>, hoje: CivilDate
): ChargeNotice {
  if (cobranca.status === STATUS_PAGO) {
    return aviso(AVISO_PAGO, 0);
  }
  const diasAteVencimento = diferencaEmDias(hoje, cobranca.dueDate);
  if (diasAteVencimento < 0) {
    return aviso(AVISO_EM_ATRASO, -diasAteVencimento);
  }
  if (diasAteVencimento > DIAS_DE_AVISO) {
    return aviso(AVISO_SEM_AVISO, 0);
  }
  return aviso(AVISO_VENCE, diasAteVencimento);
}

/** So itens com aviso (vence em ate 5 dias ou em atraso), ordenados por dueDate. */
export function cobrancasComAviso<T extends Pick<SubscriptionCharge, 'status' | 'dueDate'>>(
  cobrancas: readonly T[], hoje: CivilDate
): { cobranca: T; aviso: ChargeNotice }[] {
  return cobrancas
    .map(cobranca => ({ cobranca, aviso: avisoDaCobranca(cobranca, hoje) }))
    .filter(({ aviso }) => exibeAviso(aviso.kind))
    .sort((a, b) => compararDatas(a.cobranca.dueDate, b.cobranca.dueDate));
}

function falhar(codigo: CodigoMensalidadeInvalida, mensagem: string): never {
  throw new MensalidadeInvalidaError(codigo, mensagem);
}

function aviso(kind: ChargeNoticeKind, days: number): ChargeNotice {
  return { kind, days };
}

function exibeAviso(kind: ChargeNoticeKind): boolean {
  return kind === AVISO_VENCE || kind === AVISO_EM_ATRASO;
}

function textoDeVencimento(dias: number): string {
  if (dias === 0) {
    return TEXTO_VENCE_HOJE;
  }
  return `vence em ${textoDeDias(dias)}`;
}

/** Unica pluralizacao do aviso: 1 dia / N dias. */
function textoDeDias(dias: number): string {
  return dias === DIAS_NO_SINGULAR ? `${dias} dia` : `${dias} dias`;
}

function ehValorMonetarioValido(valor: number): boolean {
  return ehValorValido(valor) && ehComNoMaximoDuasCasas(valor);
}

function ehValorValido(valor: number): boolean {
  return Number.isFinite(valor) && valor > 0;
}

/** Tolerancia de ponto flutuante: 0.1 + 0.2 conta como 0.30 (2 casas). */
function ehComNoMaximoDuasCasas(valor: number): boolean {
  const centavos = valor * CENTAVOS_POR_UNIDADE;
  return Math.abs(centavos - Math.round(centavos)) <= TOLERANCIA_EM_CENTAVOS;
}

function ehDiaDeVencimentoValido(dia: number): boolean {
  return Number.isInteger(dia) && dia >= DIA_VENCIMENTO_MINIMO && dia <= DIA_VENCIMENTO_MAXIMO;
}

/** Mes atual ja gera; mes seguinte so quando a janela de aviso dele ja abriu. */
function entrouNaJanelaDeGeracao(
  competencia: Competence, dueDay: number, hoje: CivilDate
): boolean {
  if (competencia <= competenciaDe(hoje)) {
    return true;
  }
  const dueDate = dataDeVencimento(competencia, dueDay);
  return diferencaEmDias(hoje, dueDate) <= DIAS_DE_AVISO;
}

function partesDaCompetencia(competencia: Competence): { ano: number; mes: number } {
  const [ano, mes] = competencia.split('-').map(Number);
  return { ano, mes };
}

function somarMesesACompetencia(competencia: Competence, meses: number): Competence {
  const { ano, mes } = partesDaCompetencia(competencia);
  const indice = ano * MESES_POR_ANO + (mes - 1) + meses;
  const anoAlvo = Math.floor(indice / MESES_POR_ANO);
  const mesIndiceAlvo = indice % MESES_POR_ANO;
  return competenciaDe(formatarCivil(anoAlvo, mesIndiceAlvo, 1));
}

/** Competencias de `de` ate `ate` (inclusive); vazio quando de > ate. */
function competenciasEntre(de: Competence, ate: Competence): Competence[] {
  const competencias: Competence[] = [];
  let competencia = de;
  while (competencia <= ate) {
    competencias.push(competencia);
    competencia = somarMesesACompetencia(competencia, 1);
  }
  return competencias;
}

/** Comparacao lexicografica de yyyy-MM funciona porque o formato e fixo. */
function maiorCompetencia(a: Competence, b: Competence): Competence {
  return a > b ? a : b;
}

function compararDatas(a: CivilDate, b: CivilDate): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}
