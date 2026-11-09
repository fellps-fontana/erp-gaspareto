import type { Timestamp } from '@angular/fire/firestore';
import type {
  ChargeNotice, ChargeStatus, CivilDate, SubscriptionConfig
} from '../../models/subscription-model';
import {
  avisoDaCobranca,
  camposDoPagamento,
  cobrancasComAviso,
  competenciaDe,
  competenciasAGerar,
  dataDeVencimento,
  idDaCobranca,
  montarCobranca,
  textoDoAviso,
  validarConfig,
} from './subscription-rules';

// Calendario de referencia (2026): 2026-11-09 = segunda-feira.

function configDe(extra: Partial<SubscriptionConfig> = {}): SubscriptionConfig {
  return {
    companyId: 'abc',
    amount: 150,
    dueDay: 10,
    active: true,
    contractStart: '2026-01-15',
    generateFrom: '2026-01',
    createdAt: {} as Timestamp,
    updatedAt: {} as Timestamp,
    ...extra,
  };
}

function cobranca(id: string, status: ChargeStatus, dueDate: CivilDate) {
  return { id, status, dueDate };
}

// Devolve o codigo do erro lancado (propriedade codigo), null se nao lancou,
// ou a mensagem de qualquer outro erro (ex: NOT_IMPLEMENTED do esqueleto).
function codigoDoErro(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    const codigo = (e as { codigo?: unknown }).codigo;
    return typeof codigo === 'string' ? codigo : `OUTRO_ERRO: ${(e as Error).message}`;
  }
}

describe('subscription-rules', () => {

  describe('competenciaDe', () => {

    it('extrai yyyy-MM da data civil (2026-11-09 -> 2026-11)', () => {
      expect(competenciaDe('2026-11-09')).toBe('2026-11');
    });

    it('vira o ano corretamente (2026-12-31 -> 2026-12 e 2027-01-01 -> 2027-01)', () => {
      expect(competenciaDe('2026-12-31')).toBe('2026-12');
      expect(competenciaDe('2027-01-01')).toBe('2027-01');
    });
  });

  describe('dataDeVencimento', () => {

    it('devolve o dia exato quando o mes tem o dia (dia 10 em 2026-11 -> 2026-11-10)', () => {
      expect(dataDeVencimento('2026-11', 10)).toBe('2026-11-10');
    });

    it('dia 31 em fevereiro cai no ultimo dia do mes (2026-02 -> 2026-02-28)', () => {
      expect(dataDeVencimento('2026-02', 31)).toBe('2026-02-28');
    });

    it('dia 31 em fevereiro de ano bissexto cai em 29 (2028-02 -> 2028-02-29)', () => {
      expect(dataDeVencimento('2028-02', 31)).toBe('2028-02-29');
    });

    it('dia 31 em abril cai no ultimo dia do mes (2026-04 -> 2026-04-30)', () => {
      expect(dataDeVencimento('2026-04', 31)).toBe('2026-04-30');
    });
  });

  describe('idDaCobranca', () => {

    it("monta {companyId}_{yyyyMM} ('abc', '2026-11' -> 'abc_202611')", () => {
      expect(idDaCobranca('abc', '2026-11')).toBe('abc_202611');
    });
  });

  describe('validarConfig', () => {

    it('nao lanca para config valida', () => {
      expect(codigoDoErro(() => validarConfig(configDe()))).toBeNull();
    });

    it('aceita amount no limite inferior positivo (0.01)', () => {
      expect(codigoDoErro(() => validarConfig(configDe({ amount: 0.01 })))).toBeNull();
    });

    it('aceita dueDay nos limites 1 e 31', () => {
      expect(codigoDoErro(() => validarConfig(configDe({ dueDay: 1 })))).toBeNull();
      expect(codigoDoErro(() => validarConfig(configDe({ dueDay: 31 })))).toBeNull();
    });

    [0, -1, NaN, Infinity].forEach(valor => {
      it(`lanca VALOR_INVALIDO para amount ${valor}`, () => {
        expect(codigoDoErro(() => validarConfig(configDe({ amount: valor }))))
          .toBe('VALOR_INVALIDO');
      });
    });

    [0, 32, 10.5].forEach(dia => {
      it(`lanca DIA_VENCIMENTO_INVALIDO para dueDay ${dia}`, () => {
        expect(codigoDoErro(() => validarConfig(configDe({ dueDay: dia }))))
          .toBe('DIA_VENCIMENTO_INVALIDO');
      });
    });

    it('lanca INICIO_INVALIDO para contractStart inexistente (2026-02-30)', () => {
      expect(codigoDoErro(() => validarConfig(configDe({ contractStart: '2026-02-30' }))))
        .toBe('INICIO_INVALIDO');
    });

    it('lanca INICIO_INVALIDO para contractStart com formato errado (10/03/2026)', () => {
      expect(codigoDoErro(() => validarConfig(configDe({ contractStart: '10/03/2026' }))))
        .toBe('INICIO_INVALIDO');
    });

    // amount tem no maximo 2 casas decimais. 0.1 + 0.2 da 0.30000000000000004 em float
    // mas e 0.30 em centavos: precisa ser aceito.
    [120, 120.5, 0.1 + 0.2].forEach(valor => {
      it(`aceita amount com ate 2 casas decimais (${valor})`, () => {
        expect(codigoDoErro(() => validarConfig(configDe({ amount: valor })))).toBeNull();
      });
    });

    it('lanca VALOR_INVALIDO para amount com 3 casas decimais (120.555)', () => {
      expect(codigoDoErro(() => validarConfig(configDe({ amount: 120.555 }))))
        .toBe('VALOR_INVALIDO');
    });
  });

  describe('competenciasAGerar', () => {

    it('primeira cobranca e o mes de contractStart mesmo com dueDay ja passado no mes', () => {
      // dueDay 3 ja passou em 2026-11; ainda assim a competencia 2026-11 nasce
      const config = configDe({ contractStart: '2026-11-15', generateFrom: '2026-11', dueDay: 3 });
      expect(competenciasAGerar(config, '2026-11-20', new Set())).toEqual(['2026-11']);
    });

    it('nunca gera antes do mes de contractStart mesmo com generateFrom anterior', () => {
      const config = configDe({ contractStart: '2026-08-01', generateFrom: '2026-01', dueDay: 10 });
      expect(competenciasAGerar(config, '2026-09-09', new Set())).toEqual(['2026-08', '2026-09']);
    });

    it('nunca gera antes de generateFrom quando ele e posterior ao contractStart', () => {
      const config = configDe({ contractStart: '2026-01-10', generateFrom: '2026-06', dueDay: 10 });
      expect(competenciasAGerar(config, '2026-08-15', new Set()))
        .toEqual(['2026-06', '2026-07', '2026-08']);
    });

    it('devolve vazio quando active = false', () => {
      const config = configDe({ active: false, contractStart: '2026-08-01', dueDay: 10 });
      expect(competenciasAGerar(config, '2026-11-09', new Set())).toEqual([]);
    });

    it('antecipa a competencia seguinte quando hoje e exatamente dueDate - 5 dias', () => {
      // dueDay 3 de 2026-12 = 2026-12-03; 5 dias antes = 2026-11-28
      const config = configDe({ contractStart: '2026-11-01', generateFrom: '2026-11', dueDay: 3 });
      expect(competenciasAGerar(config, '2026-11-28', new Set()))
        .toEqual(['2026-11', '2026-12']);
    });

    it('nao antecipa a competencia seguinte um dia antes de dueDate - 5 dias', () => {
      const config = configDe({ contractStart: '2026-11-01', generateFrom: '2026-11', dueDay: 3 });
      expect(competenciasAGerar(config, '2026-11-27', new Set())).toEqual(['2026-11']);
    });

    it('nao antecipa para contrato futuro antes da janela de aviso', () => {
      // primeira competencia 2026-12, dueDate 2026-12-10, janela abre em 2026-12-05
      const config = configDe({ contractStart: '2026-12-10', generateFrom: '2026-12', dueDay: 10 });
      expect(competenciasAGerar(config, '2026-11-30', new Set())).toEqual([]);
    });

    it('faz catch-up de todos os meses faltantes em ordem crescente', () => {
      const config = configDe({ contractStart: '2026-08-01', generateFrom: '2026-08', dueDay: 10 });
      expect(competenciasAGerar(config, '2026-11-09', new Set()))
        .toEqual(['2026-08', '2026-09', '2026-10', '2026-11']);
    });

    it('exclui competencias ja existentes', () => {
      const config = configDe({ contractStart: '2026-08-01', generateFrom: '2026-08', dueDay: 10 });
      expect(competenciasAGerar(config, '2026-11-09', new Set(['2026-09'])))
        .toEqual(['2026-08', '2026-10', '2026-11']);
    });

    it('chamar de novo com o resultado anterior como existentes devolve vazio (idempotente)', () => {
      const config = configDe({ contractStart: '2026-08-01', generateFrom: '2026-08', dueDay: 10 });
      const primeira = competenciasAGerar(config, '2026-11-09', new Set());
      expect(competenciasAGerar(config, '2026-11-09', new Set(primeira))).toEqual([]);
    });
  });

  describe('montarCobranca', () => {

    it('gera a_pagar com amount snapshot, dueDate calculada e pagamento nulo', () => {
      const config = configDe({ companyId: 'abc', amount: 150, dueDay: 31 });
      expect(montarCobranca(config, '2026-02')).toEqual({
        companyId: 'abc',
        competence: '2026-02',
        dueDate: '2026-02-28',
        amount: 150,
        status: 'a_pagar',
        paidDate: null,
        paidAmount: null,
      });
    });
  });

  describe('avisoDaCobranca', () => {

    it('cobranca paga nao tem aviso (kind pago), mesmo com dueDate ja passado', () => {
      expect(avisoDaCobranca({ status: 'pago', dueDate: '2026-11-20' }, '2026-11-30'))
        .toEqual({ kind: 'pago', days: 0 });
    });

    it('a_pagar com 6 dias de antecedencia nao tem aviso (sem_aviso)', () => {
      expect(avisoDaCobranca({ status: 'a_pagar', dueDate: '2026-11-20' }, '2026-11-14'))
        .toEqual({ kind: 'sem_aviso', days: 0 });
    });

    it('a_pagar com 5 dias de antecedencia vira vence com days 5', () => {
      expect(avisoDaCobranca({ status: 'a_pagar', dueDate: '2026-11-20' }, '2026-11-15'))
        .toEqual({ kind: 'vence', days: 5 });
    });

    it('a_pagar no dia do vencimento vira vence com days 0', () => {
      expect(avisoDaCobranca({ status: 'a_pagar', dueDate: '2026-11-20' }, '2026-11-20'))
        .toEqual({ kind: 'vence', days: 0 });
    });

    it('a_pagar 1 dia depois do vencimento vira em_atraso com days 1', () => {
      expect(avisoDaCobranca({ status: 'a_pagar', dueDate: '2026-11-20' }, '2026-11-21'))
        .toEqual({ kind: 'em_atraso', days: 1 });
    });

    it('calcula a diferenca de dias atravessando a virada do mes (vence em 5 dias)', () => {
      expect(avisoDaCobranca({ status: 'a_pagar', dueDate: '2026-12-03' }, '2026-11-28'))
        .toEqual({ kind: 'vence', days: 5 });
    });

    it('calcula o atraso atravessando a virada do ano (em_atraso ha 2 dias)', () => {
      expect(avisoDaCobranca({ status: 'a_pagar', dueDate: '2026-12-31' }, '2027-01-02'))
        .toEqual({ kind: 'em_atraso', days: 2 });
    });
  });

  describe('cobrancasComAviso', () => {

    it('devolve so vence e em_atraso, ordenados por dueDate, sem pagas e sem sem_aviso', () => {
      const cobrancas = [
        cobranca('E', 'a_pagar', '2026-11-19'), // vence em 5
        cobranca('D', 'pago', '2026-11-12'), // paga: fora
        cobranca('B', 'a_pagar', '2026-11-20'), // sem_aviso (6 dias): fora
        cobranca('C', 'a_pagar', '2026-11-16'), // vence em 2
        cobranca('A', 'a_pagar', '2026-11-10'), // em_atraso ha 4
      ];

      const resultado = cobrancasComAviso(cobrancas, '2026-11-14');

      expect(resultado).toEqual([
        { cobranca: cobrancas[4], aviso: { kind: 'em_atraso', days: 4 } },
        { cobranca: cobrancas[3], aviso: { kind: 'vence', days: 2 } },
        { cobranca: cobrancas[0], aviso: { kind: 'vence', days: 5 } },
      ]);
    });

    it('devolve vazio quando nenhuma cobranca tem aviso', () => {
      const cobrancas = [cobranca('X', 'pago', '2026-11-10')];
      expect(cobrancasComAviso(cobrancas, '2026-11-14')).toEqual([]);
    });

    it('nao altera a ordem do array de entrada', () => {
      const cobrancas = [
        cobranca('B', 'a_pagar', '2026-11-16'),
        cobranca('A', 'a_pagar', '2026-11-10'),
      ];

      cobrancasComAviso(cobrancas, '2026-11-14');

      expect(cobrancas.map(c => c.id)).toEqual(['B', 'A']);
    });
  });

  describe('textoDoAviso', () => {

    const casos: [ChargeNotice, string][] = [
      [{ kind: 'sem_aviso', days: 0 }, 'a pagar'],
      [{ kind: 'pago', days: 0 }, 'paga'],
      [{ kind: 'vence', days: 0 }, 'vence hoje'],
      [{ kind: 'vence', days: 1 }, 'vence em 1 dia'],
      [{ kind: 'vence', days: 3 }, 'vence em 3 dias'],
      [{ kind: 'em_atraso', days: 1 }, 'em atraso há 1 dia'],
      [{ kind: 'em_atraso', days: 4 }, 'em atraso há 4 dias'],
    ];

    casos.forEach(([aviso, texto]) => {
      it(`devolve '${texto}' para ${aviso.kind} com days ${aviso.days}`, () => {
        expect(textoDoAviso(aviso)).toBe(texto);
      });
    });
  });

  describe('camposDoPagamento', () => {

    it('grava status pago, a data informada e paidAmount igual ao amount', () => {
      expect(camposDoPagamento({ status: 'a_pagar', amount: 150 }, '2026-11-09'))
        .toEqual({ status: 'pago', paidDate: '2026-11-09', paidAmount: 150 });
    });

    ['', '2026-02-30', '10/03/2026'].forEach(data => {
      it(`lanca DATA_PAGAMENTO_INVALIDA para paidDate '${data}'`, () => {
        expect(codigoDoErro(() => camposDoPagamento({ status: 'a_pagar', amount: 150 }, data)))
          .toBe('DATA_PAGAMENTO_INVALIDA');
      });
    });
  });
});
