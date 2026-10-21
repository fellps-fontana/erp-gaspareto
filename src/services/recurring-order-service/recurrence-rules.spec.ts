import {
  AgendaDeRecorrencia,
  CursorDeGeracao,
  DIAS_DE_ANTECEDENCIA,
  DIAS_DE_CATCH_UP,
  MAXIMO_DE_OCORRENCIAS_POR_EXECUCAO,
  RecorrenciaInvalidaError,
  calcularJanelaDeGeracao,
  dataDoAgendamento,
  hojeCivil,
  idDaOcorrencia,
  listarDatasDeOcorrencia,
  proximaDataDeOcorrencia,
  validarAgenda,
} from './recurrence-rules';

// Calendario de referencia (2026): 2026-01-05 = segunda, 2026-01-07 = quarta.

function agenda(extra: Partial<AgendaDeRecorrencia> = {}): AgendaDeRecorrencia {
  return { frequency: 'weekly', startDate: '2026-01-05', ...extra };
}

// Devolve o codigo da RecorrenciaInvalidaError, null se nao lancou,
// ou a mensagem de qualquer outro erro (ex: NotImplemented do esqueleto).
function codigoDoErro(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    if (e instanceof RecorrenciaInvalidaError) {
      return e.codigo;
    }
    return `OUTRO_ERRO: ${(e as Error).message}`;
  }
}

describe('recurrence-rules', () => {

  describe('validarAgenda', () => {

    it('nao lanca para agenda weekly valida', () => {
      expect(codigoDoErro(() => validarAgenda(agenda()))).toBeNull();
    });

    it('nao lanca para agenda weekdays valida com dias 1 e 3', () => {
      const a = agenda({ frequency: 'weekdays', weekdays: [1, 3] });
      expect(codigoDoErro(() => validarAgenda(a))).toBeNull();
    });

    it('aceita endDate igual ao startDate (inclusivo)', () => {
      const a = agenda({ endDate: '2026-01-05' });
      expect(codigoDoErro(() => validarAgenda(a))).toBeNull();
    });

    it('lanca FREQUENCIA_INVALIDA para frequencia fora do enum', () => {
      const a = agenda({ frequency: 'daily' as AgendaDeRecorrencia['frequency'] });
      expect(codigoDoErro(() => validarAgenda(a))).toBe('FREQUENCIA_INVALIDA');
    });

    it('lanca DIAS_DA_SEMANA_INVALIDOS para weekdays vazio', () => {
      const a = agenda({ frequency: 'weekdays', weekdays: [] });
      expect(codigoDoErro(() => validarAgenda(a))).toBe('DIAS_DA_SEMANA_INVALIDOS');
    });

    it('lanca DIAS_DA_SEMANA_INVALIDOS para weekdays ausente em frequency weekdays', () => {
      const a = agenda({ frequency: 'weekdays' });
      expect(codigoDoErro(() => validarAgenda(a))).toBe('DIAS_DA_SEMANA_INVALIDOS');
    });

    it('lanca DIAS_DA_SEMANA_INVALIDOS para valor 7 (fora de 0..6)', () => {
      const a = agenda({ frequency: 'weekdays', weekdays: [1, 7] });
      expect(codigoDoErro(() => validarAgenda(a))).toBe('DIAS_DA_SEMANA_INVALIDOS');
    });

    it('lanca DIAS_DA_SEMANA_INVALIDOS para valor -1 (fora de 0..6)', () => {
      const a = agenda({ frequency: 'weekdays', weekdays: [-1] });
      expect(codigoDoErro(() => validarAgenda(a))).toBe('DIAS_DA_SEMANA_INVALIDOS');
    });

    it('lanca DIAS_DA_SEMANA_INVALIDOS para valor nao inteiro', () => {
      const a = agenda({ frequency: 'weekdays', weekdays: [1.5] });
      expect(codigoDoErro(() => validarAgenda(a))).toBe('DIAS_DA_SEMANA_INVALIDOS');
    });

    it('lanca DIAS_DA_SEMANA_INVALIDOS para weekdays preenchido fora de frequency weekdays', () => {
      const a = agenda({ frequency: 'weekly', weekdays: [1] });
      expect(codigoDoErro(() => validarAgenda(a))).toBe('DIAS_DA_SEMANA_INVALIDOS');
    });

    it('lanca DATA_INVALIDA para startDate inexistente (2026-02-30)', () => {
      const a = agenda({ startDate: '2026-02-30' });
      expect(codigoDoErro(() => validarAgenda(a))).toBe('DATA_INVALIDA');
    });

    it('lanca DATA_INVALIDA para startDate com formato errado (dd-MM-yyyy)', () => {
      const a = agenda({ startDate: '10-03-2026' });
      expect(codigoDoErro(() => validarAgenda(a))).toBe('DATA_INVALIDA');
    });

    it('lanca DATA_INVALIDA para startDate com separador errado (barra)', () => {
      const a = agenda({ startDate: '2026/03/10' });
      expect(codigoDoErro(() => validarAgenda(a))).toBe('DATA_INVALIDA');
    });

    it('lanca DATA_INVALIDA para endDate inexistente (2026-02-30)', () => {
      const a = agenda({ endDate: '2026-02-30' });
      expect(codigoDoErro(() => validarAgenda(a))).toBe('DATA_INVALIDA');
    });

    it('lanca FIM_ANTES_DO_INICIO quando endDate e um dia antes do startDate', () => {
      const a = agenda({ startDate: '2026-01-05', endDate: '2026-01-04' });
      expect(codigoDoErro(() => validarAgenda(a))).toBe('FIM_ANTES_DO_INICIO');
    });
  });

  describe('hojeCivil', () => {

    it('devolve a data civil local com zero a esquerda (2026-01-05 as 23:59)', () => {
      expect(hojeCivil(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    });

    it('devolve a mesma data civil a meia-noite local (2026-01-05 00:00)', () => {
      expect(hojeCivil(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05');
    });
  });

  describe('dataDoAgendamento', () => {

    it('devolve meia-noite local da data civil informada', () => {
      const d = dataDoAgendamento('2026-03-10');
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(2);
      expect(d.getDate()).toBe(10);
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
      expect(d.getSeconds()).toBe(0);
      expect(d.getMilliseconds()).toBe(0);
    });
  });

  describe('listarDatasDeOcorrencia', () => {

    describe('weekly e biweekly', () => {

      it('weekly gera a cada 7 dias a partir de startDate dentro da janela', () => {
        const datas = listarDatasDeOcorrencia(
          agenda({ frequency: 'weekly' }),
          { from: '2026-01-01', to: '2026-01-31' }
        );
        expect(datas).toEqual(['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26']);
      });

      it('weekly com janela no meio da serie mantem a fase de startDate', () => {
        const datas = listarDatasDeOcorrencia(
          agenda({ frequency: 'weekly' }),
          { from: '2026-01-13', to: '2026-01-31' }
        );
        expect(datas).toEqual(['2026-01-19', '2026-01-26']);
      });

      it('biweekly gera a cada 14 dias ancorado em startDate com janela no meio', () => {
        const datas = listarDatasDeOcorrencia(
          agenda({ frequency: 'biweekly' }),
          { from: '2026-01-10', to: '2026-02-10' }
        );
        expect(datas).toEqual(['2026-01-19', '2026-02-02']);
      });

      it('janela sem nenhuma ocorrencia devolve lista vazia', () => {
        const datas = listarDatasDeOcorrencia(
          agenda({ frequency: 'weekly' }),
          { from: '2026-01-06', to: '2026-01-11' }
        );
        expect(datas).toEqual([]);
      });
    });

    describe('monthly', () => {

      it('startDate dia 31 ancora no ultimo dia do mes curto (28 fev, 31 mar, 30 abr)', () => {
        const datas = listarDatasDeOcorrencia(
          agenda({ frequency: 'monthly', startDate: '2026-01-31' }),
          { from: '2026-01-01', to: '2026-04-30' }
        );
        expect(datas).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
      });

      it('startDate dia 31 usa 29 fev em ano bissexto (2028)', () => {
        const datas = listarDatasDeOcorrencia(
          agenda({ frequency: 'monthly', startDate: '2028-01-31' }),
          { from: '2028-02-01', to: '2028-02-29' }
        );
        expect(datas).toEqual(['2028-02-29']);
      });
    });

    describe('weekdays', () => {

      it('weekdays [1,3] gera segunda e quarta a partir de startDate (segunda)', () => {
        const datas = listarDatasDeOcorrencia(
          agenda({ frequency: 'weekdays', weekdays: [1, 3], startDate: '2026-01-05' }),
          { from: '2026-01-05', to: '2026-01-14' }
        );
        expect(datas).toEqual(['2026-01-05', '2026-01-07', '2026-01-12', '2026-01-14']);
      });

      it('weekdays nunca gera data anterior a startDate, mesmo sendo dia marcado', () => {
        // startDate e terca (2026-01-06). Segunda 05 e anterior ao startDate e nao entra.
        const datas = listarDatasDeOcorrencia(
          agenda({ frequency: 'weekdays', weekdays: [1, 3], startDate: '2026-01-06' }),
          { from: '2026-01-01', to: '2026-01-10' }
        );
        expect(datas).toEqual(['2026-01-07']);
      });
    });

    describe('limites da agenda e da janela', () => {

      it('nunca gera data antes de startDate mesmo com janela anterior ao inicio', () => {
        const datas = listarDatasDeOcorrencia(
          agenda({ frequency: 'weekly', startDate: '2026-01-05' }),
          { from: '2025-12-01', to: '2026-01-10' }
        );
        expect(datas).toEqual(['2026-01-05']);
      });

      it('endDate e inclusivo: data igual ao endDate entra na lista', () => {
        const datas = listarDatasDeOcorrencia(
          agenda({ frequency: 'weekly', endDate: '2026-01-12' }),
          { from: '2026-01-01', to: '2026-01-31' }
        );
        expect(datas).toEqual(['2026-01-05', '2026-01-12']);
      });

      it('endDate entre ocorrencias corta a lista na ultima data anterior a ele', () => {
        const datas = listarDatasDeOcorrencia(
          agenda({ frequency: 'weekly', endDate: '2026-01-11' }),
          { from: '2026-01-01', to: '2026-01-31' }
        );
        expect(datas).toEqual(['2026-01-05']);
      });

      it('respeita o teto MAXIMO_DE_OCORRENCIAS_POR_EXECUCAO (14) com janela longa', () => {
        const datas = listarDatasDeOcorrencia(
          agenda({ frequency: 'weekly', startDate: '2026-01-05' }),
          { from: '2026-01-01', to: '2026-12-31' }
        );
        expect(MAXIMO_DE_OCORRENCIAS_POR_EXECUCAO).toBe(14);
        expect(datas.length).toBe(14);
      });

      it('com teto atingido devolve as 14 primeiras datas em ordem crescente', () => {
        // 14 semanas a partir de 2026-01-05 terminam em 2026-04-06.
        const datas = listarDatasDeOcorrencia(
          agenda({ frequency: 'weekly', startDate: '2026-01-05' }),
          { from: '2026-01-01', to: '2026-12-31' }
        );
        expect(datas[0]).toBe('2026-01-05');
        expect(datas[13]).toBe('2026-04-06');
      });
    });
  });

  describe('proximaDataDeOcorrencia', () => {

    it('devolve a proxima data estritamente depois de apos (weekly)', () => {
      expect(proximaDataDeOcorrencia(agenda({ frequency: 'weekly' }), '2026-01-05'))
        .toBe('2026-01-12');
    });

    it('devolve a proxima data quando apos nao e uma ocorrencia', () => {
      expect(proximaDataDeOcorrencia(agenda({ frequency: 'weekly' }), '2026-01-06'))
        .toBe('2026-01-12');
    });

    it('devolve startDate quando apos e anterior ao inicio da agenda', () => {
      expect(proximaDataDeOcorrencia(agenda({ frequency: 'weekly' }), '2025-12-20'))
        .toBe('2026-01-05');
    });

    it('monthly com startDate dia 31 ancora em startDate (apos 28 fev vai para 31 mar)', () => {
      expect(proximaDataDeOcorrencia(
        agenda({ frequency: 'monthly', startDate: '2026-01-31' }),
        '2026-02-28'
      )).toBe('2026-03-31');
    });

    it('devolve null quando nao ha proxima data por causa do endDate', () => {
      expect(proximaDataDeOcorrencia(
        agenda({ frequency: 'weekly', endDate: '2026-01-12' }),
        '2026-01-12'
      )).toBeNull();
    });
  });

  describe('calcularJanelaDeGeracao', () => {

    it('janela padrao: from = hoje - DIAS_DE_CATCH_UP e to = hoje + DIAS_DE_ANTECEDENCIA', () => {
      // hoje 2026-01-10: from = 2026-01-07 (hoje - 3), to = 2026-01-12 (hoje + 2).
      const cursor: CursorDeGeracao = { generateFrom: '2026-01-01' };
      expect(calcularJanelaDeGeracao(cursor, '2026-01-10'))
        .toEqual({ from: '2026-01-07', to: '2026-01-12' });
      expect(DIAS_DE_CATCH_UP).toBe(3);
      expect(DIAS_DE_ANTECEDENCIA).toBe(2);
    });

    it('from usa o dia seguinte a lastGeneratedDate quando ele e maior que hoje - 3', () => {
      const cursor: CursorDeGeracao = { generateFrom: '2026-01-01', lastGeneratedDate: '2026-01-09' };
      expect(calcularJanelaDeGeracao(cursor, '2026-01-10'))
        .toEqual({ from: '2026-01-10', to: '2026-01-12' });
    });

    it('from nao volta alem de hoje - 3 mesmo com lastGeneratedDate muito antiga (catch-up limitado)', () => {
      const cursor: CursorDeGeracao = { generateFrom: '2025-12-01', lastGeneratedDate: '2026-01-01' };
      expect(calcularJanelaDeGeracao(cursor, '2026-01-10'))
        .toEqual({ from: '2026-01-07', to: '2026-01-12' });
    });

    it('from usa generateFrom quando ele e maior que hoje - 3', () => {
      const cursor: CursorDeGeracao = { generateFrom: '2026-01-09' };
      expect(calcularJanelaDeGeracao(cursor, '2026-01-10'))
        .toEqual({ from: '2026-01-09', to: '2026-01-12' });
    });

    it('to e limitado pelo endDate quando ele vem antes de hoje + 2', () => {
      const cursor: CursorDeGeracao = { generateFrom: '2026-01-01', endDate: '2026-01-11' };
      expect(calcularJanelaDeGeracao(cursor, '2026-01-10'))
        .toEqual({ from: '2026-01-07', to: '2026-01-11' });
    });

    it('endDate igual a hoje ainda permite janela (to = hoje)', () => {
      const cursor: CursorDeGeracao = { generateFrom: '2026-01-01', endDate: '2026-01-10' };
      expect(calcularJanelaDeGeracao(cursor, '2026-01-10'))
        .toEqual({ from: '2026-01-07', to: '2026-01-10' });
    });

    it('devolve null quando o endDate ja passou bem antes da janela de catch-up', () => {
      const cursor: CursorDeGeracao = { generateFrom: '2025-12-01', endDate: '2026-01-01' };
      expect(calcularJanelaDeGeracao(cursor, '2026-01-10')).toBeNull();
    });

    it('catch-up vale ate o endDate: endDate 2026-01-09 com hoje 2026-01-10 gera 07 a 09', () => {
      // Regra 5.4: janela = [maior(generateFrom, lastGeneratedDate+1, hoje-3), menor(hoje+2, endDate)].
      const cursor: CursorDeGeracao = { generateFrom: '2025-12-01', endDate: '2026-01-09' };
      expect(calcularJanelaDeGeracao(cursor, '2026-01-10'))
        .toEqual({ from: '2026-01-07', to: '2026-01-09' });
    });

    it('devolve null quando from > to (lastGeneratedDate cobre toda a janela)', () => {
      // to = 2026-01-12; lastGeneratedDate = to -> from = 2026-01-13.
      const cursor: CursorDeGeracao = { generateFrom: '2026-01-01', lastGeneratedDate: '2026-01-12' };
      expect(calcularJanelaDeGeracao(cursor, '2026-01-10')).toBeNull();
    });

    it('devolve null quando generateFrom ja esta depois de to', () => {
      const cursor: CursorDeGeracao = { generateFrom: '2026-01-20' };
      expect(calcularJanelaDeGeracao(cursor, '2026-01-10')).toBeNull();
    });

    it('virada de ano: hoje 2025-12-31 gera janela 2025-12-28 a 2026-01-02', () => {
      const cursor: CursorDeGeracao = { generateFrom: '2025-12-01' };
      expect(calcularJanelaDeGeracao(cursor, '2025-12-31'))
        .toEqual({ from: '2025-12-28', to: '2026-01-02' });
    });

    it('virada de mes: hoje 2026-01-31 gera janela 2026-01-28 a 2026-02-02', () => {
      const cursor: CursorDeGeracao = { generateFrom: '2026-01-01' };
      expect(calcularJanelaDeGeracao(cursor, '2026-01-31'))
        .toEqual({ from: '2026-01-28', to: '2026-02-02' });
    });
  });

  describe('idDaOcorrencia', () => {

    it('monta rec_{id}_{yyyyMMdd} a partir do id do modelo e da data civil', () => {
      expect(idDaOcorrencia('abc', '2026-03-07')).toBe('rec_abc_20260307');
    });

    it('mantem dois digitos de dia e mes sem perder zero a esquerda', () => {
      expect(idDaOcorrencia('xyz', '2026-12-01')).toBe('rec_xyz_20261201');
    });
  });
});
