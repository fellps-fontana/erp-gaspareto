/**
 * Regras de data do pedido recorrente (regra-de-negocio.md secao 5.4).
 * Funcoes puras: "hoje" sempre entra por parametro.
 */
import { RecurrenceFrequency, RecurringOrderStatus } from '../../models/recurring-order-model';

export type CivilDate = string; // 'yyyy-MM-dd'

export type CodigoRecorrenciaInvalida =
  | 'FREQUENCIA_INVALIDA'
  | 'DIAS_DA_SEMANA_INVALIDOS'
  | 'DATA_INVALIDA'
  | 'FIM_ANTES_DO_INICIO'
  | 'ITENS_INVALIDOS';

export class RecorrenciaInvalidaError extends Error {
  constructor(public readonly codigo: CodigoRecorrenciaInvalida, message: string) {
    super(message);
  }
}

export interface AgendaDeRecorrencia {
  frequency: RecurrenceFrequency;
  startDate: CivilDate;
  weekdays?: number[];
  endDate?: CivilDate;
}

export interface JanelaDeGeracao {
  from: CivilDate;
  to: CivilDate; // inclusiva
}

export interface CursorDeGeracao {
  generateFrom: CivilDate;
  lastGeneratedDate?: CivilDate;
  endDate?: CivilDate;
}

/** Status 'active' do modelo: unica fonte para build-rules e service. */
export const MODELO_ATIVO: RecurringOrderStatus = 'active';

export const DIAS_DE_ANTECEDENCIA = 2;
export const DIAS_DE_CATCH_UP = 3;
export const MAXIMO_DE_OCORRENCIAS_POR_EXECUCAO = 14;

const FREQUENCIAS_VALIDAS: RecurrenceFrequency[] = ['weekly', 'biweekly', 'monthly', 'weekdays'];
const FREQUENCIA_POR_DIAS_DA_SEMANA: RecurrenceFrequency = 'weekdays';
const FREQUENCIA_MENSAL: RecurrenceFrequency = 'monthly';
const UM_DIA = 1;
const INTERVALO_EM_DIAS_POR_FREQUENCIA: Partial<Record<RecurrenceFrequency, number>> = {
  weekly: 7,
  biweekly: 14,
};
const DIAS_POR_SEMANA = 7;
const PRIMEIRO_DIA_DA_SEMANA = 0;
const ULTIMO_DIA_DA_SEMANA = 6;
const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;
const PADRAO_DATA_CIVIL = /^\d{4}-\d{2}-\d{2}$/;

/** Lanca RecorrenciaInvalidaError. */
export function validarAgenda(agenda: AgendaDeRecorrencia): void {
  validarFrequencia(agenda.frequency);
  validarDiasDaSemana(agenda);
  validarDataCivil(agenda.startDate);
  if (agenda.endDate !== undefined) {
    validarDataCivil(agenda.endDate);
    if (agenda.endDate < agenda.startDate) {
      falhar('FIM_ANTES_DO_INICIO', 'endDate anterior ao startDate');
    }
  }
}

export function hojeCivil(agora: Date): CivilDate {
  return formatarCivil(agora.getFullYear(), agora.getMonth(), agora.getDate());
}

/** null quando nao ha nada a gerar (fim ja passou ou from > to). */
export function calcularJanelaDeGeracao(
  cursor: CursorDeGeracao,
  hoje: CivilDate
): JanelaDeGeracao | null {
  const from = inicioDaJanela(cursor, hoje);
  const to = menorData(somarDias(hoje, DIAS_DE_ANTECEDENCIA), cursor.endDate);
  return from > to ? null : { from, to };
}

/** Datas crescentes dentro da janela, respeitando startDate/endDate e o teto por execucao. */
export function listarDatasDeOcorrencia(
  agenda: AgendaDeRecorrencia,
  janela: JanelaDeGeracao
): CivilDate[] {
  const limite = menorData(janela.to, agenda.endDate);
  const datas: CivilDate[] = [];
  let data = primeiraOcorrenciaAPartirDe(agenda, janela.from);
  while (data <= limite && datas.length < MAXIMO_DE_OCORRENCIAS_POR_EXECUCAO) {
    datas.push(data);
    data = primeiraOcorrenciaAPartirDe(agenda, somarDias(data, UM_DIA));
  }
  return datas;
}

/** Primeira ocorrencia estritamente depois de `apos`; null se passar do endDate. */
export function proximaDataDeOcorrencia(
  agenda: AgendaDeRecorrencia,
  apos: CivilDate
): CivilDate | null {
  const proxima = primeiraOcorrenciaAPartirDe(agenda, somarDias(apos, UM_DIA));
  return agenda.endDate !== undefined && proxima > agenda.endDate ? null : proxima;
}

/** True quando nao ha nenhuma ocorrencia depois do cursor (encerramento automatico da agenda). */
export function agendaEsgotada(agenda: AgendaDeRecorrencia, cursor: CursorDeGeracao): boolean {
  return proximaDataDeOcorrencia(agenda, aposOCursor(cursor)) === null;
}

/** `rec_{id}_{yyyyMMdd}` */
export function idDaOcorrencia(recurringOrderId: string, data: CivilDate): string {
  return `rec_${recurringOrderId}_${data.replace(/-/g, '')}`;
}

/** Meia-noite local da data civil. */
export function dataDoAgendamento(data: CivilDate): Date {
  const [ano, mes, dia] = data.split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

function validarFrequencia(frequency: RecurrenceFrequency): void {
  if (!FREQUENCIAS_VALIDAS.includes(frequency)) {
    falhar('FREQUENCIA_INVALIDA', `frequency desconhecida: ${frequency}`);
  }
}

function validarDiasDaSemana(agenda: AgendaDeRecorrencia): void {
  if (agenda.frequency !== FREQUENCIA_POR_DIAS_DA_SEMANA) {
    if (agenda.weekdays !== undefined) {
      falhar('DIAS_DA_SEMANA_INVALIDOS', 'weekdays so e permitido em frequency weekdays');
    }
    return;
  }
  const dias = agenda.weekdays;
  if (!dias || dias.length === 0 || !dias.every(ehDiaDaSemanaValido)) {
    falhar('DIAS_DA_SEMANA_INVALIDOS', 'weekdays deve ter valores inteiros entre 0 e 6');
  }
}

function ehDiaDaSemanaValido(dia: number): boolean {
  return Number.isInteger(dia) && dia >= PRIMEIRO_DIA_DA_SEMANA && dia <= ULTIMO_DIA_DA_SEMANA;
}

function validarDataCivil(data: CivilDate): void {
  if (!ehDataCivilValida(data)) {
    falhar('DATA_INVALIDA', `data civil invalida: ${data}`);
  }
}

function ehDataCivilValida(data: CivilDate): boolean {
  return PADRAO_DATA_CIVIL.test(data) && utcParaCivil(civilParaUtc(data)) === data;
}

function falhar(codigo: CodigoRecorrenciaInvalida, mensagem: string): never {
  throw new RecorrenciaInvalidaError(codigo, mensagem);
}

/** Ultimo dia coberto pelo cursor: o maior entre lastGeneratedDate e o dia anterior a generateFrom. */
function aposOCursor(cursor: CursorDeGeracao): CivilDate {
  return maiorData(cursor.lastGeneratedDate, somarDias(cursor.generateFrom, -UM_DIA));
}

function inicioDaJanela(cursor: CursorDeGeracao, hoje: CivilDate): CivilDate {
  const diaSeguinteAUltimaGerada = cursor.lastGeneratedDate
    ? somarDias(cursor.lastGeneratedDate, UM_DIA)
    : undefined;
  return maiorData(
    cursor.generateFrom,
    diaSeguinteAUltimaGerada,
    somarDias(hoje, -DIAS_DE_CATCH_UP)
  );
}

/** Primeira ocorrencia da agenda que nao seja anterior a `aPartirDe` (e nao antes de startDate). */
function primeiraOcorrenciaAPartirDe(
  agenda: AgendaDeRecorrencia,
  aPartirDe: CivilDate
): CivilDate {
  const dataMinima = maiorData(agenda.startDate, aPartirDe);
  const intervaloEmDias = INTERVALO_EM_DIAS_POR_FREQUENCIA[agenda.frequency];
  if (intervaloEmDias !== undefined) {
    return primeiraOcorrenciaPorIntervalo(agenda.startDate, dataMinima, intervaloEmDias);
  }
  if (agenda.frequency === FREQUENCIA_MENSAL) {
    return primeiraOcorrenciaMensal(agenda.startDate, dataMinima);
  }
  return primeiroDiaMarcadoAPartirDe(agenda, dataMinima);
}

function primeiraOcorrenciaPorIntervalo(
  startDate: CivilDate,
  dataMinima: CivilDate,
  intervaloEmDias: number
): CivilDate {
  const passos = Math.ceil(diferencaEmDias(startDate, dataMinima) / intervaloEmDias);
  return somarDias(startDate, passos * intervaloEmDias);
}

function primeiraOcorrenciaMensal(startDate: CivilDate, dataMinima: CivilDate): CivilDate {
  const inicio = civilParaUtc(startDate);
  const alvo = civilParaUtc(dataMinima);
  let indice = (alvo.getUTCFullYear() - inicio.getUTCFullYear()) * 12
    + (alvo.getUTCMonth() - inicio.getUTCMonth());
  let candidata = dataMensalAncorada(startDate, indice);
  if (candidata < dataMinima) {
    indice += 1;
    candidata = dataMensalAncorada(startDate, indice);
  }
  return candidata;
}

/** Dia de startDate no mes (startDate + indice meses); mes curto usa o ultimo dia. */
function dataMensalAncorada(startDate: CivilDate, indiceDeMeses: number): CivilDate {
  const inicio = civilParaUtc(startDate);
  const mesesDesdeInicio = inicio.getUTCMonth() + indiceDeMeses;
  const primeiroDoMes = new Date(Date.UTC(inicio.getUTCFullYear(), mesesDesdeInicio, 1));
  const ano = primeiroDoMes.getUTCFullYear();
  const mes = primeiroDoMes.getUTCMonth();
  const dia = Math.min(inicio.getUTCDate(), diasNoMes(ano, mes));
  return formatarCivil(ano, mes, dia);
}

function primeiroDiaMarcadoAPartirDe(agenda: AgendaDeRecorrencia, dataMinima: CivilDate): CivilDate {
  const marcados = agenda.weekdays ?? [];
  for (let passo = 0; passo < DIAS_POR_SEMANA; passo++) {
    const data = somarDias(dataMinima, passo);
    if (marcados.includes(diaDaSemana(data))) {
      return data;
    }
  }
  falhar('DIAS_DA_SEMANA_INVALIDOS', 'weekdays sem nenhum dia valido');
}

function formatarCivil(ano: number, mesIndice: number, dia: number): CivilDate {
  const anoTexto = String(ano).padStart(4, '0');
  const mesTexto = String(mesIndice + 1).padStart(2, '0');
  const diaTexto = String(dia).padStart(2, '0');
  return `${anoTexto}-${mesTexto}-${diaTexto}`;
}

/** Aritmetica em UTC: datas civis nao sofrem com fuso nem horario de verao. */
function civilParaUtc(data: CivilDate): Date {
  const [ano, mes, dia] = data.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function utcParaCivil(d: Date): CivilDate {
  return formatarCivil(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function somarDias(data: CivilDate, dias: number): CivilDate {
  return utcParaCivil(new Date(civilParaUtc(data).getTime() + dias * MILISSEGUNDOS_POR_DIA));
}

function diferencaEmDias(de: CivilDate, ate: CivilDate): number {
  return (civilParaUtc(ate).getTime() - civilParaUtc(de).getTime()) / MILISSEGUNDOS_POR_DIA;
}

function diaDaSemana(data: CivilDate): number {
  return civilParaUtc(data).getUTCDay();
}

function diasNoMes(ano: number, mesIndice: number): number {
  return new Date(Date.UTC(ano, mesIndice + 1, 0)).getUTCDate();
}

function maiorData(...datas: (CivilDate | undefined)[]): CivilDate {
  return datas
    .filter((data): data is CivilDate => data !== undefined)
    .reduce((maior, data) => (data > maior ? data : maior));
}

function menorData(...datas: (CivilDate | undefined)[]): CivilDate {
  return datas
    .filter((data): data is CivilDate => data !== undefined)
    .reduce((menor, data) => (data < menor ? data : menor));
}
