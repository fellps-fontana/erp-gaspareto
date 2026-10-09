import { filtrarPorTermo, normalizarBusca } from './busca-por-nome';

interface Cli {
  name: string;
  phone?: string;
}

describe('busca-por-nome', () => {
  const clientes: Cli[] = [
    { name: 'João Silva', phone: '(11) 99999-1234' },
    { name: 'Maria Souza', phone: '(21) 98888-0000' },
  ];
  const campos = (c: Cli) => [c.name, c.phone];

  it('normalizarBusca remove acento, caixa e espaços das pontas', () => {
    expect(normalizarBusca('  JOÃO ')).toBe('joao');
    expect(normalizarBusca(undefined)).toBe('');
  });

  it('termo vazio devolve a lista completa', () => {
    expect(filtrarPorTermo(clientes, '   ', campos).length).toBe(2);
  });

  it('ignora caixa e acento', () => {
    const r = filtrarPorTermo(clientes, 'joao', campos);
    expect(r.map(c => c.name)).toEqual(['João Silva']);
    expect(filtrarPorTermo(clientes, 'MARIA', campos).length).toBe(1);
  });

  it('acha pelo segundo campo (telefone)', () => {
    const r = filtrarPorTermo(clientes, '98888', campos);
    expect(r.map(c => c.name)).toEqual(['Maria Souza']);
  });

  it('sem match devolve lista vazia', () => {
    expect(filtrarPorTermo(clientes, 'zzz', campos)).toEqual([]);
  });
});
