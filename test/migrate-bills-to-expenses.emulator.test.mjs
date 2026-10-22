// Teste de integracao do script de migracao contra o Firestore Emulator (Admin SDK).
// Regra: regra-de-negocio.md secao 14. Projeto fixo hologaerp.
// Rodar SOMENTE via: npm run test:migration:emulator (firebase emulators:exec).
// Guard abaixo: sem FIRESTORE_EMULATOR_HOST o teste recusa rodar, nunca toca Firestore real.
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { DEFAULT_CATEGORY_DEFS } from '../scripts/lib/expense-migration-core.mjs';

const PROJECT = 'hologaerp';
const SCRIPT = fileURLToPath(new URL('../scripts/migrate-bills-to-expenses.mjs', import.meta.url));
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;

if (!EMULATOR) {
  throw new Error('FIRESTORE_EMULATOR_HOST ausente: rode via npm run test:migration:emulator. Nunca contra Firestore real.');
}
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== PROJECT) {
  throw new Error(`GCLOUD_PROJECT=${process.env.GCLOUD_PROJECT} diferente de ${PROJECT}. Recusado.`);
}
process.env.GCLOUD_PROJECT = PROJECT;

const app = initializeApp({ projectId: PROJECT }, 'migration-emulator-tests');
const db = getFirestore(app);

const at = (iso) => Timestamp.fromDate(new Date(iso));
const LEGACY_COLLECTIONS = ['bills', 'purchaseProducts'];
const NEW_COLLECTIONS = ['expenses', 'expenseSeries', 'expenseCategories'];
const EXPECTED_CATEGORY_IDS = (cid) => DEFAULT_CATEGORY_DEFS.map((d) => `${cid}_${d.systemKey}`).sort();

function newCompanyId(label) {
  return `mig-${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function runScript(args, { project = PROJECT } = {}) {
  assert.ok(existsSync(SCRIPT), 'script ausente: scripts/migrate-bills-to-expenses.mjs (RED esperado)');
  return spawnSync(process.execPath, [SCRIPT, ...args, `--project=${project}`], {
    encoding: 'utf8',
    env: { ...process.env, FIRESTORE_EMULATOR_HOST: EMULATOR, GCLOUD_PROJECT: project },
    timeout: 120000,
  });
}

async function seedLegacy(cid) {
  const batch = db.batch();
  const bills = db.collection('bills');
  const pps = db.collection('purchaseProducts');
  const created = at('2026-08-01T12:00:00Z');

  batch.set(pps.doc(`${cid}-pp1`), {
    companyId: cid, name: 'Distribuidora de Bebidas', defaultValue: 1850,
    recurring: true, recurrencePeriod: 'monthly', createdAt: created,
  });
  batch.set(pps.doc(`${cid}-pp2`), {
    companyId: cid, name: 'Embalagens e descartaveis', defaultValue: 280,
    recurring: false, createdAt: created,
  });

  const base = { companyId: cid, recurring: false, createdAt: created };
  batch.set(bills.doc(`${cid}-b1`), {
    ...base, name: 'Aluguel do ponto', value: 2200,
    dueDate: at('2026-09-15T15:00:00Z'), status: 'pago', paidAt: at('2026-09-15T18:00:00Z'),
  });
  batch.set(bills.doc(`${cid}-b2`), {
    ...base, name: 'Distribuidora de Bebidas', value: 1850,
    dueDate: at('2026-09-14T15:00:00Z'), status: 'pago', paidAt: at('2026-09-14T18:00:00Z'),
    recurring: true, recurrencePeriod: 'mensal', purchaseProductId: `${cid}-pp1`,
  });
  batch.set(bills.doc(`${cid}-b3`), {
    ...base, name: 'Distribuidora de Bebidas', value: 1850,
    dueDate: at('2026-10-14T15:00:00Z'), status: 'pendente',
    recurring: true, recurrencePeriod: 'mensal', purchaseProductId: `${cid}-pp1`,
  });
  batch.set(bills.doc(`${cid}-b4`), {
    ...base, name: 'Compra: Coca-Cola', value: 240,
    dueDate: at('2026-10-10T02:30:00Z'), status: 'recebido', receivedAt: at('2026-10-10T02:30:00Z'),
  });
  batch.set(bills.doc(`${cid}-b5`), {
    ...base, name: 'Embalagens e descartaveis', value: 280,
    dueDate: at('2026-10-05T15:00:00Z'), status: 'pago', paidAt: at('2026-10-05T18:00:00Z'),
    purchaseProductId: `${cid}-pp2`,
  });
  batch.set(bills.doc(`${cid}-b6`), {
    ...base, name: 'Conta de energia', value: 412.37,
    dueDate: at('2026-10-03T15:00:00Z'), status: 'pendente',
  });
  await batch.commit();
}

async function wipe(cid) {
  for (const col of [...LEGACY_COLLECTIONS, ...NEW_COLLECTIONS]) {
    const snap = await db.collection(col).where('companyId', '==', cid).get();
    if (snap.empty) continue;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await db.collection('bills').doc(`${cid}-semcompany`).delete();
}

async function scenario(label, fn) {
  const cid = newCompanyId(label);
  try {
    await seedLegacy(cid);
    await fn(cid);
  } finally {
    await wipe(cid);
  }
}

async function idsOf(col, cid) {
  const snap = await db.collection(col).where('companyId', '==', cid).get();
  return snap.docs.map((d) => d.id).sort();
}

async function legacySnapshot(cid) {
  const out = {};
  for (const col of LEGACY_COLLECTIONS) {
    const snap = await db.collection(col).where('companyId', '==', cid).get();
    for (const d of snap.docs) out[`${col}/${d.id}`] = d.data();
  }
  return out;
}

describe('migrate-bills-to-expenses (Firestore Emulator, projeto hologaerp)', () => {
  after(async () => {
    await deleteApp(app);
  });

  it('dry-run padrao (sem --apply) nao escreve nada', () => scenario('dry', async (cid) => {
    const r = runScript([`--company=${cid}`]);
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(await idsOf('expenses', cid), []);
    assert.deepEqual(await idsOf('expenseSeries', cid), []);
    assert.deepEqual(await idsOf('expenseCategories', cid), []);
  }));

  it('--apply cria 6 despesas, 1 serie mig_pp_ (so pp recorrente) e as 12 categorias padrao', () => scenario('apply', async (cid) => {
    const r = runScript(['--apply', `--company=${cid}`]);
    assert.equal(r.status, 0, r.stderr);

    const expenseIds = (await idsOf('expenses', cid)).sort();
    const expected = ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'].map((b) => `mig_bill_${cid}-${b}`).sort();
    assert.deepEqual(expenseIds, expected);
    assert.deepEqual(await idsOf('expenseSeries', cid), [`mig_pp_${cid}-pp1`]);
    assert.deepEqual(await idsOf('expenseCategories', cid), EXPECTED_CATEGORY_IDS(cid));

    const b4 = (await db.collection('expenses').doc(`mig_bill_${cid}-b4`).get()).data();
    assert.equal(b4.status, 'a_pagar');
    assert.equal(b4.goodsReceivedDate, '2026-10-09');
    assert.equal(b4.categoryId, `${cid}_compra_mercadoria`);

    const b2 = (await db.collection('expenses').doc(`mig_bill_${cid}-b2`).get()).data();
    assert.equal(b2.seriesId, `mig_pp_${cid}-pp1`);
  }));

  it('2a execucao cria 0 docs e nao sobrescreve doc editado pelo usuario', () => scenario('idem', async (cid) => {
    const r1 = runScript(['--apply', `--company=${cid}`]);
    assert.equal(r1.status, 0, r1.stderr);
    const idsBefore = {
      expenses: await idsOf('expenses', cid),
      series: await idsOf('expenseSeries', cid),
      categories: await idsOf('expenseCategories', cid),
    };

    const editedRef = db.collection('expenses').doc(`mig_bill_${cid}-b6`);
    await editedRef.update({ description: 'EDITADO PELO USUARIO', value: 999 });

    const r2 = runScript(['--apply', `--company=${cid}`]);
    assert.equal(r2.status, 0, r2.stderr);

    assert.deepEqual(await idsOf('expenses', cid), idsBefore.expenses);
    assert.deepEqual(await idsOf('expenseSeries', cid), idsBefore.series);
    assert.deepEqual(await idsOf('expenseCategories', cid), idsBefore.categories);

    const edited = (await editedRef.get()).data();
    assert.equal(edited.description, 'EDITADO PELO USUARIO');
    assert.equal(edited.value, 999);
  }));

  it('--rollback so apaga origin=migracao e series mig_pp_; preserva manuais, categorias e legado', () => scenario('rollback', async (cid) => {
    const r0 = runScript(['--apply', `--company=${cid}`]);
    assert.equal(r0.status, 0, r0.stderr);

    await db.collection('expenses').doc(`${cid}-manual`).set({
      companyId: cid, description: 'Despesa manual', value: 50, categoryId: `${cid}_outros`,
      dueDate: '2026-10-01', status: 'a_pagar', origin: 'manual', createdAt: at('2026-10-01T12:00:00Z'),
    });
    await db.collection('expenseSeries').doc(`${cid}-manual-serie`).set({
      companyId: cid, active: true, period: 'mensal', anchorDate: '2026-10-01',
      template: { description: 'Serie manual', value: 10, categoryId: `${cid}_outros` },
      createdAt: at('2026-10-01T12:00:00Z'),
    });
    const legacyBefore = await legacySnapshot(cid);

    const dry = runScript(['--rollback', `--company=${cid}`]);
    assert.equal(dry.status, 0, dry.stderr);
    assert.equal((await idsOf('expenses', cid)).length, 7, 'rollback sem --apply nao pode apagar');

    const real = runScript(['--rollback', '--apply', `--company=${cid}`]);
    assert.equal(real.status, 0, real.stderr);

    assert.deepEqual(await idsOf('expenses', cid), [`${cid}-manual`]);
    assert.deepEqual(await idsOf('expenseSeries', cid), [`${cid}-manual-serie`]);
    assert.deepEqual(await idsOf('expenseCategories', cid), EXPECTED_CATEGORY_IDS(cid));
    assert.deepEqual(await legacySnapshot(cid), legacyBefore);
  }));

  it('legado (bills e purchaseProducts) nunca e alterado pelo --apply', () => scenario('legacy', async (cid) => {
    const before = await legacySnapshot(cid);
    assert.equal(Object.keys(before).length, 8, 'fixture: 6 bills + 2 purchaseProducts');

    const r = runScript(['--apply', `--company=${cid}`]);
    assert.equal(r.status, 0, r.stderr);

    assert.deepEqual(await legacySnapshot(cid), before);
  }));

  it('projeto diferente de hologaerp: exit code != 0 e nada gravado', () => scenario('wrongproj', async (cid) => {
    const r = runScript(['--apply', `--company=${cid}`], { project: 'demo-test' });
    assert.notEqual(r.status, 0, 'deve recusar projeto diferente de hologaerp');
    assert.deepEqual(await idsOf('expenses', cid), []);
    assert.deepEqual(await idsOf('expenseSeries', cid), []);
    assert.deepEqual(await idsOf('expenseCategories', cid), []);
  }));

  it('bill sem companyId e ignorado (sem despesa) e aparece no relatorio', () => scenario('nocompany', async (cid) => {
    await db.collection('bills').doc(`${cid}-semcompany`).set({
      name: 'Festa de aniversario', value: 1250, status: 'pendente',
      dueDate: at('2026-10-03T15:00:00Z'), recurring: false, createdAt: at('2026-08-01T12:00:00Z'),
    });
    const r = runScript(['--apply']);
    assert.equal(r.status, 0, r.stderr);

    const snap = await db.collection('expenses').doc(`mig_bill_${cid}-semcompany`).get();
    assert.equal(snap.exists, false, 'bill sem companyId nao pode gerar despesa');
    assert.ok(r.stdout.includes(`${cid}-semcompany`), 'bill sem companyId deve constar no relatorio');
  }));
});
