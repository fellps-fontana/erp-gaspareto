import {
  calcularTotalItemPorPeso,
  normalizarPeso,
  validarPeso,
  bloqueiaAdicaoPorPeso,
  LinhaProdutoRef
} from './product-weight-rules';

/**
 * FRENTE 1 — Testes RED para regras puras de "produto por kilo"
 * Regra CRITICA: envolve dinheiro (total do item) e linha única por venda.
 *
 * Todos os testes aqui devem FALHAR por NotImplemented até levi implementar.
 */

describe('ProductWeightRules - Funcoes puras para "produto por kilo" [CRITICA]', () => {

  describe('calcularTotalItemPorPeso(precoPorKg, pesoKg) - Total em dinheiro de uma venda por peso', () => {

    describe('Caso feliz: entrada numerica valida', () => {
      it('[RED] deve retornar 29.99 para preco 19.99 kg e peso 1.5 kg (prova-flutuante)', () => {
        const result = calcularTotalItemPorPeso(19.99, 1.5);
        expect(result).toBe(29.99);
      });

      it('[RED] deve retornar 0.01 para preco 10 kg e peso 0.001 kg', () => {
        const result = calcularTotalItemPorPeso(10, 0.001);
        expect(result).toBe(0.01);
      });

      it('[RED] deve retornar 0 para peso 0', () => {
        const result = calcularTotalItemPorPeso(10, 0);
        expect(result).toBe(0);
      });

      it('[RED] deve retornar arredondado para 2 casas: 19.99 * 2.5 = 49.975 => 49.98', () => {
        const result = calcularTotalItemPorPeso(19.99, 2.5);
        expect(result).toBeCloseTo(49.975, 2);
      });

      it('[RED] deve retornar arredondado para 2 casas: 100 * 0.123 = 12.3 => 12.30', () => {
        const result = calcularTotalItemPorPeso(100, 0.123);
        expect(result).toBe(12.30);
      });
    });

    describe('Casos de borda: entrada invalida ou negativa', () => {
      it('[RED] deve retornar 0 para peso negativo (-1)', () => {
        const result = calcularTotalItemPorPeso(10, -1);
        expect(result).toBe(0);
      });

      it('[RED] deve retornar 0 para preco nao numerica (string "abc")', () => {
        const result = calcularTotalItemPorPeso(NaN, 1.5);
        expect(result).toBe(0);
      });

      it('[RED] deve retornar 0 para peso nao numerica (string "xyz")', () => {
        const result = calcularTotalItemPorPeso(10, NaN);
        expect(result).toBe(0);
      });

      it('[RED] deve retornar 0 para ambos NaN', () => {
        const result = calcularTotalItemPorPeso(NaN, NaN);
        expect(result).toBe(0);
      });

      it('[RED] deve retornar 0 para preco negativo', () => {
        const result = calcularTotalItemPorPeso(-10, 1.5);
        expect(result).toBe(0);
      });
    });

  });

  describe('normalizarPeso(valor) - Normaliza entrada vindo de input, arredonda para max 3 casas decimais', () => {

    describe('Caso feliz: string/number com casas decimais validas', () => {
      it('[RED] deve retornar 1.75 para string "1.750"', () => {
        const result = normalizarPeso('1.750');
        expect(result).toBe(1.75);
      });

      it('[RED] deve retornar 1.755 para 1.7549 (arredonda 4a casa para cima)', () => {
        const result = normalizarPeso(1.7549);
        expect(result).toBe(1.755);
      });

      it('[RED] deve retornar 1.754 para 1.7541 (arredonda 4a casa para baixo)', () => {
        const result = normalizarPeso(1.7541);
        expect(result).toBe(1.754);
      });

      it('[RED] deve retornar numero com maximo 3 casas decimais: Number.isInteger(normalizarPeso(x) * 1000) === true', () => {
        const testValues = [1.7549, 2.5555, 0.001, 10, 1.1234];
        testValues.forEach(value => {
          const result = normalizarPeso(value);
          const verifiesDecimal = Number.isInteger(result * 1000);
          expect(verifiesDecimal).toBe(true,
            `normalizarPeso(${value}) = ${result}; (${result} * 1000) deve ser inteiro`
          );
        });
      });

      it('[RED] deve aceitar 1 casa decimal: 1.5 => 1.5', () => {
        const result = normalizarPeso(1.5);
        expect(result).toBe(1.5);
      });

      it('[RED] deve aceitar 2 casas decimais: 1.75 => 1.75', () => {
        const result = normalizarPeso(1.75);
        expect(result).toBe(1.75);
      });

      it('[RED] deve aceitar inteiro: 2 => 2', () => {
        const result = normalizarPeso(2);
        expect(result).toBe(2);
      });
    });

    describe('Casos de borda: entrada invalida', () => {
      it('[RED] deve retornar NaN para string invalida "abc"', () => {
        const result = normalizarPeso('abc');
        expect(Number.isNaN(result)).toBe(true);
      });

      it('[RED] deve retornar NaN para undefined', () => {
        const result = normalizarPeso(undefined as any);
        expect(Number.isNaN(result)).toBe(true);
      });

      it('[RED] deve retornar NaN para null', () => {
        const result = normalizarPeso(null as any);
        expect(Number.isNaN(result)).toBe(true);
      });

      it('[RED] deve retornar NaN para Infinity', () => {
        const result = normalizarPeso(Infinity);
        expect(Number.isNaN(result)).toBe(true);
      });
    });

  });

  describe('validarPeso(valor) - Valida peso para venda por kg', () => {

    describe('Casos validos', () => {
      it('[RED] deve retornar { valido: true } para peso 1.75 (3 casas decimais)', () => {
        const result = validarPeso(1.75);
        expect(result.valido).toBe(true);
      });

      it('[RED] deve retornar { valido: true } para peso 2 (inteiro)', () => {
        const result = validarPeso(2);
        expect(result.valido).toBe(true);
      });

      it('[RED] deve retornar { valido: true } para peso 0.005 (3 casas)', () => {
        const result = validarPeso(0.005);
        expect(result.valido).toBe(true);
      });

      it('[RED] deve retornar { valido: true } para peso string "1.5"', () => {
        const result = validarPeso('1.5');
        expect(result.valido).toBe(true);
      });

      it('[RED] deve retornar { valido: true } para peso string "2"', () => {
        const result = validarPeso('2');
        expect(result.valido).toBe(true);
      });
    });

    describe('Casos invalidos: <= 0 ou nao numerica', () => {
      it('[RED] deve retornar { valido: false, erro: "..." } para peso 0', () => {
        const result = validarPeso(0);
        expect(result.valido).toBe(false);
        expect(result.erro).toBeDefined();
        expect(typeof result.erro).toBe('string');
      });

      it('[RED] deve retornar { valido: false, erro: "..." } para peso negativo -1', () => {
        const result = validarPeso(-1);
        expect(result.valido).toBe(false);
        expect(result.erro).toBeDefined();
      });

      it('[RED] deve retornar { valido: false, erro: "..." } para string invalida "abc"', () => {
        const result = validarPeso('abc');
        expect(result.valido).toBe(false);
        expect(result.erro).toBeDefined();
      });
    });

    describe('Casos de borda: 4 ou mais casas decimais', () => {
      it('[RED] deve retornar { valido: false, erro: "..." } para 1.7549 (4 casas)', () => {
        const result = validarPeso(1.7549);
        expect(result.valido).toBe(false);
        expect(result.erro).toBeDefined();
      });

      it('[RED] deve retornar { valido: false, erro: "..." } para string "1.12345" (5 casas)', () => {
        const result = validarPeso('1.12345');
        expect(result.valido).toBe(false);
        expect(result.erro).toBeDefined();
      });
    });

  });

  describe('bloqueiaAdicaoPorPeso(itensAtuais, idProduct, soldByWeight)', () => {

    describe('Produto por peso (soldByWeight === true): linha unica', () => {
      it('[RED] deve retornar true quando produto por peso JA ESTA na comanda', () => {
        const itens: LinhaProdutoRef[] = [{ idProduct: 'a' }];
        const result = bloqueiaAdicaoPorPeso(itens, 'a', true);
        expect(result).toBe(true);
      });

      it('[RED] deve retornar false quando produto por peso AUSENTE da comanda', () => {
        const itens: LinhaProdutoRef[] = [{ idProduct: 'b' }];
        const result = bloqueiaAdicaoPorPeso(itens, 'a', true);
        expect(result).toBe(false);
      });

      it('[RED] deve retornar false quando lista VAZIA e produto por peso', () => {
        const itens: LinhaProdutoRef[] = [];
        const result = bloqueiaAdicaoPorPeso(itens, 'a', true);
        expect(result).toBe(false);
      });

      it('[RED] deve retornar false quando multiplos outros produtos, nenhum e o alvo', () => {
        const itens: LinhaProdutoRef[] = [{ idProduct: 'a' }, { idProduct: 'b' }, { idProduct: 'c' }];
        const result = bloqueiaAdicaoPorPeso(itens, 'd', true);
        expect(result).toBe(false);
      });
    });

    describe('Produto por unidade (soldByWeight === false): nunca bloqueia', () => {
      it('[RED] deve retornar false quando produto por unidade JA ESTA na comanda', () => {
        const itens: LinhaProdutoRef[] = [{ idProduct: 'a' }];
        const result = bloqueiaAdicaoPorPeso(itens, 'a', false);
        expect(result).toBe(false);
      });

      it('[RED] deve retornar false quando produto por unidade ausente', () => {
        const itens: LinhaProdutoRef[] = [{ idProduct: 'b' }];
        const result = bloqueiaAdicaoPorPeso(itens, 'a', false);
        expect(result).toBe(false);
      });

      it('[RED] deve retornar false para lista vazia e produto por unidade', () => {
        const itens: LinhaProdutoRef[] = [];
        const result = bloqueiaAdicaoPorPeso(itens, 'a', false);
        expect(result).toBe(false);
      });
    });

  });

});
