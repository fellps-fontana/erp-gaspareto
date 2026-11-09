// Testes unitarios do nucleo puro da migracao bills/purchaseProducts -> expenses.
// Regra: regra-de-negocio.md secao 14 (e secoes 7 e 8.1 para o modelo de destino).
// Rodar: npm run test:migration
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_CATEGORY_DEFS,
  toDateKeySaoPaulo,
  normalizeText,
  matchCategoryKey,
  resolveBillCategory,
  mapBillToExpense,
  mapPurchaseProductToSeries,
  planMigration,
} from '../scripts/lib/expense-migration-core.mjs';

const COMPANY = 'comp-1';
const CTX = { companyId: COMPANY };

// Timestamp-like no formato do Admin SDK (metodo toDate()).
const ts = (iso) => ({ toDate: () => new Date(iso) });

function bill(overrides = {}) {
  return {
    id: 'b1',
    companyId: COMPANY,
    name: 'Conta de energia',
    value: 412.37,
    dueDate: ts('2026-10-15T15:00:00Z'),
    status: 'pendente',
    recurring: false,
    createdAt: ts('2026-10-01T12:00:00Z'),
    ...overrides,
  };
}

function withoutField(obj, field) {
  const copy = { ...obj };
  delete copy[field];
  return copy;
}

function purchaseProduct(overrides = {}) {
  return {
    id: 'pp1',
    companyId: COMPANY,
    name: 'Distribuidora de Bebidas',
    defaultValue: 1850,
    recurring: true,
    recurrencePeriod: 'monthly',
    createdAt: ts('2026-08-01T15:00:00Z'),
    ...overrides,
  };
}

function emptyExistingIds() {
  return { categories: new Set(), series: new Set(), expenses: new Set() };
}

function byId(list, id) {
  return list.find((item) => item.id === id);
}

describe('toDateKeySaoPaulo', () => {
  it('Timestamp 02:30Z do dia seguinte cai no dia anterior em America/Sao_Paulo', () => {
    assert.equal(toDateKeySaoPaulo(ts('2026-10-10T02:30:00Z')), '2026-10-09');
  });

  it('Timestamp exatamente 03:00Z e meia-noite em Sao Paulo, ja no dia seguinte', () => {
    assert.equal(toDateKeySaoPaulo(ts('2026-10-10T03:00:00Z')), '2026-10-10');
  });

  it('Timestamp 02:59:59.999Z ainda cai no dia anterior (limite do fuso)', () => {
    assert.equal(toDateKeySaoPaulo(ts('2026-10-10T02:59:59.999Z')), '2026-10-09');
  });

  it('aceita a forma {seconds} do Firestore com o mesmo resultado', () => {
    const seconds = Date.parse('2026-10-10T02:30:00Z') / 1000;
    assert.equal(toDateKeySaoPaulo({ seconds }), '2026-10-09');
  });

  it('aceita Date e string ISO com o mesmo resultado do Timestamp', () => {
    assert.equal(toDateKeySaoPaulo(new Date('2026-10-10T02:30:00Z')), '2026-10-09');
    assert.equal(toDateKeySaoPaulo('2026-10-10T02:30:00Z'), '2026-10-09');
  });
});

describe('normalizeText', () => {
  it('deixa minusculo, remove acento e colapsa espacos', () => {
    const acento = String.fromCharCode(0xc1);
    assert.equal(normalizeText(`  ${acento}gua   da  CONTA `), 'agua da conta');
  });
});

describe('matchCategoryKey', () => {
  it('"Aluguel do ponto" casa aluguel', () => {
    assert.equal(matchCategoryKey('Aluguel do ponto'), 'aluguel');
  });

  it('"Conta de energia" casa energia_agua_gas', () => {
    assert.equal(matchCategoryKey('Conta de energia'), 'energia_agua_gas');
  });

  it('"Taxa da maquininha" casa taxas_cartao', () => {
    assert.equal(matchCategoryKey('Taxa da maquininha'), 'taxas_cartao');
  });

  it('taxas_cartao tem precedencia sobre impostos_taxas quando o texto tem "taxa" de cartao', () => {
    assert.equal(matchCategoryKey('Taxa de cartao'), 'taxas_cartao');
  });

  it('casamento ignora caixa e acento', () => {
    assert.equal(matchCategoryKey('ALUGUEL'), 'aluguel');
  });

  it('texto sem palavra-chave nao casa nenhuma categoria (retorna null)', () => {
    assert.equal(matchCategoryKey('Festa de aniversario - Bar do Gringo'), null);
  });
});

describe('resolveBillCategory', () => {
  it('"Compra: X" sem produto ligado -> compra_mercadoria sem revisar', () => {
    const r = resolveBillCategory(bill({ name: 'Compra: Coca-Cola', status: 'recebido', receivedAt: ts('2026-10-05T15:00:00Z') }), null);
    assert.equal(r.systemKey, 'compra_mercadoria');
    assert.equal(r.revisar, false);
  });

  it('prefixo "Compra:" tem precedencia sobre o produto de compra ligado', () => {
    const r = resolveBillCategory(bill({ name: 'Compra: Coca-Cola', purchaseProductId: 'pp1' }), purchaseProduct({ name: 'Aluguel' }));
    assert.equal(r.systemKey, 'compra_mercadoria');
  });

  it('bill com purchaseProductId usa o nome do produto antes do nome do proprio bill', () => {
    const r = resolveBillCategory(bill({ name: 'Internet', purchaseProductId: 'pp1' }), purchaseProduct({ name: 'Conta de energia' }));
    assert.equal(r.systemKey, 'energia_agua_gas');
    assert.equal(r.revisar, false);
  });

  it('"Aluguel do ponto" sem produto ligado -> aluguel sem revisar', () => {
    const r = resolveBillCategory(bill({ name: 'Aluguel do ponto' }), null);
    assert.equal(r.systemKey, 'aluguel');
    assert.equal(r.revisar, false);
  });

  it('"Conta de energia" sem produto ligado -> energia_agua_gas', () => {
    const r = resolveBillCategory(bill({ name: 'Conta de energia' }), null);
    assert.equal(r.systemKey, 'energia_agua_gas');
  });

  it('"Taxa da maquininha" -> taxas_cartao, nunca impostos_taxas', () => {
    const r = resolveBillCategory(bill({ name: 'Taxa da maquininha' }), null);
    assert.equal(r.systemKey, 'taxas_cartao');
  });

  it('sem casamento e sem receivedAt -> outros + revisar com motivo', () => {
    const r = resolveBillCategory(bill({ name: 'Festa de aniversario - Bar do Gringo' }), null);
    assert.equal(r.systemKey, 'outros');
    assert.equal(r.revisar, true);
    assert.ok(typeof r.motivo === 'string' && r.motivo.length > 0, 'motivo deve estar preenchido');
  });

  it('sem casamento mas com receivedAt -> compra_mercadoria + revisar', () => {
    const r = resolveBillCategory(bill({ name: 'Evento corporativo', status: 'recebido', receivedAt: ts('2026-10-05T15:00:00Z') }), null);
    assert.equal(r.systemKey, 'compra_mercadoria');
    assert.equal(r.revisar, true);
  });

  it('casamento de nome vence o fallback de receivedAt (aluguel recebido nao vira compra)', () => {
    const r = resolveBillCategory(bill({ name: 'Aluguel do ponto', status: 'recebido', receivedAt: ts('2026-10-05T15:00:00Z') }), null);
    assert.equal(r.systemKey, 'aluguel');
    assert.equal(r.revisar, false);
  });
});

describe('mapBillToExpense', () => {
  it('pendente -> a_pagar, sem goodsReceivedDate e sem paidDate, com id mig_bill_<id>', () => {
    const { id, data } = mapBillToExpense(bill(), CTX);
    assert.equal(id, 'mig_bill_b1');
    assert.equal(data.status, 'a_pagar');
    assert.equal(data.paidDate, undefined);
    assert.equal(data.goodsReceivedDate, undefined);
    assert.equal(data.origin, 'migracao');
    assert.equal(data.legacyBillId, 'b1');
    assert.equal(data.companyId, COMPANY);
    assert.equal(data.description, 'Conta de energia');
    assert.equal(data.value, 412.37);
    assert.equal(data.dueDate, '2026-10-15');
  });

  it('categoria gravada como ${companyId}_${systemKey} (ID determinisico, secao 8.1)', () => {
    const { data } = mapBillToExpense(bill({ name: 'Aluguel do ponto' }), CTX);
    assert.equal(data.categoryId, 'comp-1_aluguel');
  });

  it('recebido -> a_pagar + goodsReceivedDate com a data de receivedAt em Sao Paulo', () => {
    const { data } = mapBillToExpense(bill({ status: 'recebido', receivedAt: ts('2026-10-10T02:30:00Z') }), CTX);
    assert.equal(data.status, 'a_pagar');
    assert.equal(data.goodsReceivedDate, '2026-10-09');
    assert.equal(data.paidDate, undefined);
  });

  it('pago -> pago + paidDate com a data de paidAt', () => {
    const { data } = mapBillToExpense(bill({ status: 'pago', paidAt: ts('2026-10-12T18:00:00Z') }), CTX);
    assert.equal(data.status, 'pago');
    assert.equal(data.paidDate, '2026-10-12');
    assert.equal(data.goodsReceivedDate, undefined);
  });

  it('pago com receivedAt tambem grava goodsReceivedDate', () => {
    const { data } = mapBillToExpense(
      bill({ status: 'pago', paidAt: ts('2026-10-12T18:00:00Z'), receivedAt: ts('2026-10-01T12:00:00Z') }),
      CTX,
    );
    assert.equal(data.status, 'pago');
    assert.equal(data.goodsReceivedDate, '2026-10-01');
  });

  it('D3: sem dueDate e pago -> usa paidAt e marca migracaoRevisar', () => {
    const { data } = mapBillToExpense(
      withoutField(bill({ status: 'pago', paidAt: ts('2026-10-12T18:00:00Z') }), 'dueDate'),
      CTX,
    );
    assert.equal(data.dueDate, '2026-10-12');
    assert.equal(data.migracaoRevisar, true);
  });

  it('D3: sem dueDate e sem paidAt -> usa receivedAt e marca migracaoRevisar', () => {
    const { data } = mapBillToExpense(
      withoutField(bill({ status: 'recebido', receivedAt: ts('2026-10-05T15:00:00Z') }), 'dueDate'),
      CTX,
    );
    assert.equal(data.dueDate, '2026-10-05');
    assert.equal(data.migracaoRevisar, true);
  });

  it('D3: sem dueDate, sem paidAt e sem receivedAt -> usa createdAt e marca migracaoRevisar', () => {
    const { data } = mapBillToExpense(withoutField(bill(), 'dueDate'), CTX);
    assert.equal(data.dueDate, '2026-10-01');
    assert.equal(data.migracaoRevisar, true);
  });

  it('D3: com dueDate presente, dueDate tem prioridade sobre paidAt e nao marca revisar por data', () => {
    const { data } = mapBillToExpense(
      bill({ status: 'pago', paidAt: ts('2026-10-20T15:00:00Z') }),
      CTX,
    );
    assert.equal(data.dueDate, '2026-10-15');
    assert.notEqual(data.migracaoRevisar, true);
  });

  it('bill recorrente manual (sem purchaseProductId) migra como despesa simples + revisar', () => {
    const { data } = mapBillToExpense(
      bill({ name: 'Aluguel do ponto', recurring: true, recurrencePeriod: 'mensal' }),
      CTX,
    );
    assert.equal(data.seriesId, undefined);
    assert.equal(data.migracaoRevisar, true);
  });

  it('documento gerado nao contem campo undefined (Firestore recusa)', () => {
    for (const b of [bill(), bill({ status: 'pago', paidAt: ts('2026-10-12T18:00:00Z') })]) {
      const { data } = mapBillToExpense(b, CTX);
      for (const [key, value] of Object.entries(data)) {
        assert.notEqual(value, undefined, `campo ${key} esta undefined`);
      }
    }
  });

  it('nao altera o bill legado de entrada (legado nunca e alterado)', () => {
    const b = bill({ status: 'recebido', receivedAt: ts('2026-10-05T15:00:00Z') });
    const keysBefore = Object.keys(b);
    const statusBefore = b.status;
    const dueBefore = b.dueDate;
    mapBillToExpense(b, CTX);
    assert.deepEqual(Object.keys(b), keysBefore);
    assert.equal(b.status, statusBefore);
    assert.equal(b.dueDate, dueBefore);
  });
});

describe('mapPurchaseProductToSeries', () => {
  it('purchaseProduct com recurring=false nao vira serie (retorna null)', () => {
    const pp = purchaseProduct({ id: 'pp2', name: 'Embalagens', recurring: false });
    const result = mapPurchaseProductToSeries(pp, [bill({ purchaseProductId: 'pp2' })], CTX);
    assert.equal(result, null);
  });

  it('recurrencePeriod weekly -> semanal, com id mig_pp_<id>', () => {
    const pp = purchaseProduct({ recurrencePeriod: 'weekly' });
    const { id, data } = mapPurchaseProductToSeries(pp, [bill({ purchaseProductId: 'pp1' })], CTX);
    assert.equal(id, 'mig_pp_pp1');
    assert.equal(data.period, 'semanal');
  });

  it('recurrencePeriod monthly -> mensal', () => {
    const pp = purchaseProduct({ recurrencePeriod: 'monthly' });
    const { data } = mapPurchaseProductToSeries(pp, [bill({ purchaseProductId: 'pp1' })], CTX);
    assert.equal(data.period, 'mensal');
  });

  it('anchorDate = menor dueDate e generatedThrough = maior dueDate dos bills ligados (entrada fora de ordem)', () => {
    const linked = [
      bill({ id: 'b2', purchaseProductId: 'pp1', dueDate: ts('2026-09-14T15:00:00Z') }),
      bill({ id: 'b1', purchaseProductId: 'pp1', dueDate: ts('2026-08-14T15:00:00Z') }),
      bill({ id: 'b3', purchaseProductId: 'pp1', dueDate: ts('2026-10-14T15:00:00Z') }),
    ];
    const { data } = mapPurchaseProductToSeries(purchaseProduct(), linked, CTX);
    assert.equal(data.anchorDate, '2026-08-14');
    assert.equal(data.generatedThrough, '2026-10-14');
  });

  it('sem bills ligados: anchorDate vem da data de criacao do purchaseProduct', () => {
    const pp = purchaseProduct({ createdAt: ts('2026-08-01T15:00:00Z') });
    const { data } = mapPurchaseProductToSeries(pp, [], CTX);
    assert.equal(data.anchorDate, '2026-08-01');
  });

  it('template usa o bill ligado mais recente (maior dueDate)', () => {
    const linked = [
      bill({ id: 'b1', purchaseProductId: 'pp1', value: 1800, dueDate: ts('2026-08-14T15:00:00Z') }),
      bill({ id: 'b3', purchaseProductId: 'pp1', value: 1850, dueDate: ts('2026-10-14T15:00:00Z') }),
    ];
    const { data } = mapPurchaseProductToSeries(purchaseProduct(), linked, CTX);
    assert.equal(data.template.value, 1850);
  });

  it('nome que casa categoria -> categoryId casado, sem revisar', () => {
    const pp = purchaseProduct({ name: 'Conta de energia' });
    const { data } = mapPurchaseProductToSeries(pp, [], CTX);
    assert.equal(data.template.categoryId, 'comp-1_energia_agua_gas');
    assert.notEqual(data.migracaoRevisar, true);
  });

  it('sem casamento de nome -> categoria outros + migracaoRevisar', () => {
    const pp = purchaseProduct({ name: 'Fornecedor Desconhecido' });
    const { data } = mapPurchaseProductToSeries(pp, [], CTX);
    assert.equal(data.template.categoryId, 'comp-1_outros');
    assert.equal(data.migracaoRevisar, true);
  });

  it('legacyPurchaseProductId aponta pro id do produto e a serie nasce ativa', () => {
    const { data } = mapPurchaseProductToSeries(purchaseProduct(), [], CTX);
    assert.equal(data.legacyPurchaseProductId, 'pp1');
    assert.equal(data.active, true);
  });
});

describe('planMigration', () => {
  const purchaseProducts = [
    purchaseProduct({ id: 'pp1', name: 'Distribuidora de Bebidas', recurring: true, recurrencePeriod: 'monthly' }),
    purchaseProduct({ id: 'pp2', name: 'Embalagens e descartaveis', recurring: false }),
  ];

  const bills = [
    bill({ id: 'b1', name: 'Aluguel do ponto', value: 2200, dueDate: ts('2026-09-15T15:00:00Z'), status: 'pago', paidAt: ts('2026-09-15T18:00:00Z') }),
    bill({ id: 'b2', name: 'Distribuidora de Bebidas', value: 1850, dueDate: ts('2026-09-14T15:00:00Z'), status: 'pago', paidAt: ts('2026-09-14T18:00:00Z'), recurring: true, recurrencePeriod: 'mensal', purchaseProductId: 'pp1' }),
    bill({ id: 'b3', name: 'Distribuidora de Bebidas', value: 1850, dueDate: ts('2026-10-14T15:00:00Z'), status: 'pendente', recurring: true, recurrencePeriod: 'mensal', purchaseProductId: 'pp1' }),
    bill({ id: 'b4', name: 'Embalagens e descartaveis', value: 280, dueDate: ts('2026-10-05T15:00:00Z'), status: 'pago', paidAt: ts('2026-10-05T18:00:00Z'), purchaseProductId: 'pp2' }),
    bill({ id: 'b5', name: 'Conta de energia', value: 412.37, dueDate: ts('2026-10-03T15:00:00Z'), status: 'pendente', recurring: true, recurrencePeriod: 'mensal' }),
    withoutField(bill({ id: 'b6', name: 'Festa de aniversario', value: 1250 }), 'companyId'),
  ];

  it('cria as 12 categorias padrao da empresa com ID ${companyId}_${systemKey}', () => {
    const plan = planMigration({ companyId: COMPANY, bills, purchaseProducts, existingIds: emptyExistingIds() });
    const ids = plan.categories.map((c) => c.id).sort();
    const expected = DEFAULT_CATEGORY_DEFS.map((d) => `${COMPANY}_${d.systemKey}`).sort();
    assert.deepEqual(ids, expected);
  });

  it('cria serie mig_pp_ apenas para purchaseProduct recurring=true', () => {
    const plan = planMigration({ companyId: COMPANY, bills, purchaseProducts, existingIds: emptyExistingIds() });
    assert.deepEqual(plan.series.map((s) => s.id), ['mig_pp_pp1']);
  });

  it('bills ligados a serie recebem seriesId; recurring=false e bills sem vinculo nao recebem', () => {
    const plan = planMigration({ companyId: COMPANY, bills, purchaseProducts, existingIds: emptyExistingIds() });
    assert.equal(byId(plan.expenses, 'mig_bill_b2').data.seriesId, 'mig_pp_pp1');
    assert.equal(byId(plan.expenses, 'mig_bill_b3').data.seriesId, 'mig_pp_pp1');
    assert.equal(byId(plan.expenses, 'mig_bill_b4').data.seriesId, undefined);
    assert.equal(byId(plan.expenses, 'mig_bill_b1').data.seriesId, undefined);
  });

  it('bill recorrente manual vira despesa simples com migracaoRevisar', () => {
    const plan = planMigration({ companyId: COMPANY, bills, purchaseProducts, existingIds: emptyExistingIds() });
    const b5 = byId(plan.expenses, 'mig_bill_b5').data;
    assert.equal(b5.seriesId, undefined);
    assert.equal(b5.migracaoRevisar, true);
  });

  it('serie recebe anchorDate e generatedThrough dos bills ligados', () => {
    const plan = planMigration({ companyId: COMPANY, bills, purchaseProducts, existingIds: emptyExistingIds() });
    const serie = byId(plan.series, 'mig_pp_pp1').data;
    assert.equal(serie.anchorDate, '2026-09-14');
    assert.equal(serie.generatedThrough, '2026-10-14');
  });

  it('bill sem companyId e ignorado: nao gera despesa', () => {
    const plan = planMigration({ companyId: COMPANY, bills, purchaseProducts, existingIds: emptyExistingIds() });
    assert.equal(byId(plan.expenses, 'mig_bill_b6'), undefined);
  });

  it('todas as despesas do plano tem origin migracao e o companyId da empresa', () => {
    const plan = planMigration({ companyId: COMPANY, bills, purchaseProducts, existingIds: emptyExistingIds() });
    assert.equal(plan.expenses.length, 5);
    for (const e of plan.expenses) {
      assert.equal(e.data.origin, 'migracao');
      assert.equal(e.data.companyId, COMPANY);
    }
  });

  it('IDs de despesa do plano sao unicos', () => {
    const plan = planMigration({ companyId: COMPANY, bills, purchaseProducts, existingIds: emptyExistingIds() });
    const ids = plan.expenses.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('idempotencia: existingIds com tudo ja existente pula tudo e reporta skipped', () => {
    const first = planMigration({ companyId: COMPANY, bills, purchaseProducts, existingIds: emptyExistingIds() });
    const existingIds = {
      categories: new Set(first.categories.map((c) => c.id)),
      series: new Set(first.series.map((s) => s.id)),
      expenses: new Set(first.expenses.map((e) => e.id)),
    };
    const second = planMigration({ companyId: COMPANY, bills, purchaseProducts, existingIds });
    assert.equal(second.categories.length, 0);
    assert.equal(second.series.length, 0);
    assert.equal(second.expenses.length, 0);
    assert.equal(second.report.skipped, first.categories.length + first.series.length + first.expenses.length);
  });

  it('existingIds parcial: so o item ja existente e pulado e contado em skipped', () => {
    const existingIds = { categories: new Set(), series: new Set(), expenses: new Set(['mig_bill_b1']) };
    const plan = planMigration({ companyId: COMPANY, bills, purchaseProducts, existingIds });
    assert.equal(byId(plan.expenses, 'mig_bill_b1'), undefined);
    assert.ok(byId(plan.expenses, 'mig_bill_b2'), 'b2 deve continuar planejado');
    assert.equal(plan.report.skipped, 1);
  });
});

describe('paridade com o app (secao 8.1)', () => {
  it('DEFAULT_CATEGORY_DEFS do core e textualmente igual a DEFAULT_EXPENSE_CATEGORIES do app', () => {
    const src = readFileSync(new URL('../src/models/expense-category-defaults.ts', import.meta.url), 'utf8');
    const re = /\{\s*systemKey:\s*'([^']+)',\s*name:\s*'([^']+)',\s*type:\s*'([^']+)'\s*\}/g;
    const fromApp = [...src.matchAll(re)].map((m) => ({ systemKey: m[1], name: m[2], type: m[3] }));
    assert.equal(fromApp.length, 12, 'regex deve extrair as 12 categorias do app (guarda contra match vazio)');
    const fromCore = DEFAULT_CATEGORY_DEFS.map(({ systemKey, name, type }) => ({ systemKey, name, type }));
    assert.deepEqual(fromCore, fromApp);
  });
});

// Acentos montados por codigo para manter o arquivo ASCII.
const A_TIL = String.fromCharCode(0xe3);
const E_ACUTE = String.fromCharCode(0xe9);

describe('correcao pos-style: serie sem casamento nao vira compra de mercadoria', () => {
  it('serie sem casamento de nome com ultimo bill recebido -> outros + revisar (nao compra_mercadoria)', () => {
    const pp = purchaseProduct({ name: 'Fornecedor Desconhecido' });
    const linked = [bill({
      id: 'b1', purchaseProductId: 'pp1', name: 'Fornecedor Desconhecido', status: 'recebido',
      dueDate: ts('2026-10-05T15:00:00Z'), receivedAt: ts('2026-10-05T15:00:00Z'),
    })];
    const { data } = mapPurchaseProductToSeries(pp, linked, CTX);
    assert.equal(data.template.categoryId, 'comp-1_outros');
    assert.equal(data.migracaoRevisar, true);
  });

  it('serie cujo ultimo bill se chama "Compra: X" sem casamento de produto -> outros + revisar', () => {
    const pp = purchaseProduct({ name: 'Frigorifico Chapeco' });
    const linked = [bill({
      id: 'b1', purchaseProductId: 'pp1', name: 'Compra: Carne bovina', status: 'recebido',
      dueDate: ts('2026-10-05T15:00:00Z'), receivedAt: ts('2026-10-05T15:00:00Z'),
    })];
    const { data } = mapPurchaseProductToSeries(pp, linked, CTX);
    assert.equal(data.template.categoryId, 'comp-1_outros');
    assert.equal(data.migracaoRevisar, true);
  });

  it('planMigration: serie sem casamento com bill recebido sai como outros + revisar', () => {
    const pps = [purchaseProduct({ id: 'pp1', name: 'Fornecedor Desconhecido' })];
    const bills = [bill({
      id: 'b1', purchaseProductId: 'pp1', name: 'Fornecedor Desconhecido', status: 'recebido',
      dueDate: ts('2026-10-05T15:00:00Z'), receivedAt: ts('2026-10-05T15:00:00Z'),
    })];
    const plan = planMigration({ companyId: COMPANY, bills, purchaseProducts: pps, existingIds: emptyExistingIds() });
    const serie = byId(plan.series, 'mig_pp_pp1').data;
    assert.equal(serie.template.categoryId, 'comp-1_outros');
    assert.equal(serie.migracaoRevisar, true);
  });

  it('serie com nome que casa ("Aluguel loja") -> aluguel', () => {
    const pp = purchaseProduct({ name: 'Aluguel loja' });
    const { data } = mapPurchaseProductToSeries(pp, [], CTX);
    assert.equal(data.template.categoryId, 'comp-1_aluguel');
  });
});

describe('correcao pos-style: matchCategoryKey com cartao', () => {
  it('"Fatura cartao de credito" nao casa taxas_cartao (retorna null)', () => {
    assert.equal(matchCategoryKey(`Fatura cart${A_TIL}o de cr${E_ACUTE}dito`), null);
  });

  it('"Taxa da maquininha" casa taxas_cartao', () => {
    assert.equal(matchCategoryKey('Taxa da maquininha'), 'taxas_cartao');
  });

  it('"Taxas cartao debito" casa taxas_cartao', () => {
    assert.equal(matchCategoryKey(`Taxas cart${A_TIL}o d${E_ACUTE}bito`), 'taxas_cartao');
  });
});

describe('correcao pos-style: itens nao migraveis vao para report.unmigratable', () => {
  function stripDates(b) {
    return withoutField(withoutField(withoutField(withoutField(b, 'dueDate'), 'createdAt'), 'paidAt'), 'receivedAt');
  }

  it('report.unmigratable existe e e lista vazia quando tudo migra', () => {
    const plan = planMigration({
      companyId: COMPANY,
      bills: [bill({ id: 'b1' })],
      purchaseProducts: [],
      existingIds: emptyExistingIds(),
    });
    assert.deepEqual(plan.report.unmigratable, []);
  });

  it('bill sem nenhuma data utilizavel nao lanca, fica fora de expenses e vai pra unmigratable; os demais migram', () => {
    const semData = stripDates(bill({ id: 'bx', name: 'Festa de aniversario' }));
    let plan;
    assert.doesNotThrow(() => {
      plan = planMigration({
        companyId: COMPANY,
        bills: [semData, bill({ id: 'bok' })],
        purchaseProducts: [],
        existingIds: emptyExistingIds(),
      });
    });
    assert.equal(byId(plan.expenses, 'mig_bill_bx'), undefined);
    assert.ok(byId(plan.expenses, 'mig_bill_bok'), 'bill com data deve continuar migrando');
    const entry = plan.report.unmigratable.find((u) => u.id === 'bx');
    assert.ok(entry, 'bill sem data deve constar em unmigratable');
    assert.equal(entry.kind, 'bill');
    assert.ok(typeof entry.motivo === 'string' && entry.motivo.length > 0, 'motivo preenchido');
  });

  for (const invalidValue of ['abc', NaN]) {
    it(`bill com value nao numerico (${String(invalidValue)}) fica fora de expenses e vai pra unmigratable`, () => {
      let plan;
      assert.doesNotThrow(() => {
        plan = planMigration({
          companyId: COMPANY,
          bills: [bill({ id: 'bnan', value: invalidValue }), bill({ id: 'bok' })],
          purchaseProducts: [],
          existingIds: emptyExistingIds(),
        });
      });
      assert.equal(byId(plan.expenses, 'mig_bill_bnan'), undefined);
      assert.ok(byId(plan.expenses, 'mig_bill_bok'), 'bill valido deve continuar migrando');
      const entry = plan.report.unmigratable.find((u) => u.id === 'bnan');
      assert.ok(entry, 'bill com value invalido deve constar em unmigratable');
      assert.equal(entry.kind, 'bill');
    });
  }

  it('purchaseProduct recurring sem createdAt e sem bills com data nao lanca e vai pra unmigratable', () => {
    const pp = withoutField(purchaseProduct({ id: 'ppx', recurring: true }), 'createdAt');
    let plan;
    assert.doesNotThrow(() => {
      plan = planMigration({
        companyId: COMPANY,
        bills: [],
        purchaseProducts: [pp],
        existingIds: emptyExistingIds(),
      });
    });
    assert.equal(byId(plan.series, 'mig_pp_ppx'), undefined);
    const entry = plan.report.unmigratable.find((u) => u.id === 'ppx');
    assert.ok(entry, 'purchaseProduct sem data deve constar em unmigratable');
    assert.equal(entry.kind, 'purchaseProduct');
    assert.ok(typeof entry.motivo === 'string' && entry.motivo.length > 0, 'motivo preenchido');
  });
});

describe('correcao pos-style: serie sem bills e defaultValue invalido', () => {
  for (const [label, defaultValue] of [['ausente', undefined], ["'abc'", 'abc']]) {
    it(`purchaseProduct recurring sem bills e defaultValue ${label} nao gera serie e vai pra unmigratable`, () => {
      const base = purchaseProduct({ id: 'ppv', recurring: true });
      const pp = defaultValue === undefined
        ? withoutField(base, 'defaultValue')
        : { ...base, defaultValue };
      let plan;
      assert.doesNotThrow(() => {
        plan = planMigration({
          companyId: COMPANY,
          bills: [],
          purchaseProducts: [pp],
          existingIds: emptyExistingIds(),
        });
      });
      assert.equal(byId(plan.series, 'mig_pp_ppv'), undefined, 'serie com valor invalido nao pode ser gerada');
      const entry = plan.report.unmigratable.find((u) => u.id === 'ppv');
      assert.ok(entry, 'purchaseProduct com defaultValue invalido deve constar em unmigratable');
      assert.equal(entry.kind, 'purchaseProduct');
      assert.ok(typeof entry.motivo === 'string' && entry.motivo.length > 0, 'motivo preenchido');
    });
  }

  it('guarda: purchaseProduct recurring sem bills e defaultValue valido (150) gera serie com template.value 150', () => {
    const pp = purchaseProduct({ id: 'ppok', recurring: true, defaultValue: 150 });
    const plan = planMigration({
      companyId: COMPANY,
      bills: [],
      purchaseProducts: [pp],
      existingIds: emptyExistingIds(),
    });
    const serie = byId(plan.series, 'mig_pp_ppok');
    assert.ok(serie, 'serie deve ser gerada');
    assert.equal(serie.data.template.value, 150);
  });
});
