// Migracao bills/purchaseProducts -> expenses / expenseSeries / expenseCategories.
// Regra: regra-de-negocio.md secao 14. Nucleo puro: scripts/lib/expense-migration-core.mjs.
//
// SOMENTE HOMOLOG: projeto fixo hologaerp. Qualquer outro projeto (argumento --project,
// GCLOUD_PROJECT ou GOOGLE_CLOUD_PROJECT, ou project_id da service account) e recusado
// com exit code 1 ANTES de iniciar o Admin SDK.
//
// USO
//   node scripts/migrate-bills-to-expenses.mjs                       dry-run (nada gravado)
//   node scripts/migrate-bills-to-expenses.mjs --apply               grava de verdade
//   node scripts/migrate-bills-to-expenses.mjs --company=<companyId> restringe a uma empresa
//   node scripts/migrate-bills-to-expenses.mjs --rollback            dry-run do rollback
//   node scripts/migrate-bills-to-expenses.mjs --rollback --apply    apaga o que a migracao criou
//   npm run migrate:expenses:hml                                     atalho (hologaerp)
//
// PRE-REQUISITOS
//   - Emulador local: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 (dispensa credencial).
//   - Homolog real: SERVICE_ACCOUNT_PATH=<caminho do json do projeto hologaerp> ou
//     `gcloud auth application-default login`.
//   - Nunca commitar a service account.
//
// SEGURANCA
//   - Le bills e purchaseProducts; nunca altera nem apaga esses docs.
//   - IDs deterministicos (mig_bill_<id>, mig_pp_<id>, <companyId>_<systemKey>) gravados com
//     create(): doc existente e pulado, nunca sobrescrito (edicao pos-migracao preservada).
//   - Docs sem companyId, sem data utilizavel ou com valor invalido nao migram e sao listados.
//
// ROLLBACK
//   Apaga expenses com origin == 'migracao' OU com seriesId mig_pp_* (ocorrencias de series
//   migradas, qualquer origin), e series mig_pp_* com legacyPurchaseProductId. Despesas
//   manuais, series nao migradas, categorias e legado ficam intactos. Sem --apply, so conta.

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'node:fs';
import { ID_PREFIX_SERIES, ORIGIN_MIGRACAO, planMigration } from './lib/expense-migration-core.mjs';

const TARGET_PROJECT = 'hologaerp';
const LEGACY_COLLECTIONS = { bills: 'bills', purchaseProducts: 'purchaseProducts' };
const NEW_COLLECTIONS = {
  categories: 'expenseCategories',
  series: 'expenseSeries',
  expenses: 'expenses',
};
const WRITE_CHUNK = 200;
const DELETE_CHUNK = 450;
const ALREADY_EXISTS_CODE = 6;
const PREFIX_RANGE_END_SENTINEL = '\uf8ff';

function parseArgs(argv) {
  const args = { apply: false, rollback: false, companyId: null, project: null };
  for (const arg of argv) {
    if (arg === '--apply') args.apply = true;
    else if (arg === '--rollback') args.rollback = true;
    else if (arg.startsWith('--company=')) args.companyId = argValue(arg);
    else if (arg.startsWith('--project=')) args.project = argValue(arg);
    else throw new Error(`argumento desconhecido: ${arg}`);
  }
  return args;
}

function argValue(arg) {
  const value = arg.slice(arg.indexOf('=') + 1);
  if (!value) throw new Error(`valor vazio em ${arg}`);
  return value;
}

function assertTargetProject(requestedProject) {
  const candidates = [
    requestedProject,
    process.env.GCLOUD_PROJECT,
    process.env.GOOGLE_CLOUD_PROJECT,
  ];
  const foreign = candidates.filter((project) => project && project !== TARGET_PROJECT);
  if (foreign.length) {
    throw new Error(`projeto ${foreign[0]} recusado: este script so roda em ${TARGET_PROJECT}`);
  }
}

function loadServiceAccount(path) {
  if (!existsSync(path)) throw new Error(`SERVICE_ACCOUNT_PATH nao existe: ${path}`);
  const serviceAccount = JSON.parse(readFileSync(path, 'utf8'));
  if (serviceAccount.project_id !== TARGET_PROJECT) {
    throw new Error(
      `service account do projeto ${serviceAccount.project_id} recusada: este script so usa ${TARGET_PROJECT}`,
    );
  }
  return serviceAccount;
}

function resolveCredential() {
  const path = process.env.SERVICE_ACCOUNT_PATH;
  return path ? cert(loadServiceAccount(path)) : applicationDefault();
}

function initFirestore() {
  const credential = process.env.FIRESTORE_EMULATOR_HOST ? undefined : resolveCredential();
  const app = initializeApp({
    projectId: TARGET_PROJECT,
    ...(credential && { credential }),
  });
  return getFirestore(app);
}

async function readDocs(db, collectionName) {
  const snap = await db.collection(collectionName).get();
  return snap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
}

function idsWithoutCompany(collectionName, docs) {
  return docs.filter((doc) => !doc.companyId).map((doc) => `${collectionName}/${doc.id}`);
}

function selectCompanies(legacyDocs, onlyCompanyId) {
  const all = [...new Set(legacyDocs.map((doc) => doc.companyId).filter(Boolean))].sort();
  if (!onlyCompanyId) return all;
  return all.includes(onlyCompanyId) ? [onlyCompanyId] : [];
}

async function readExistingIds(db, companyId) {
  const entries = await Promise.all(
    Object.entries(NEW_COLLECTIONS).map(async ([kind, collectionName]) => {
      const snap = await db
        .collection(collectionName)
        .where('companyId', '==', companyId)
        .select()
        .get();
      return [kind, new Set(snap.docs.map((doc) => doc.id))];
    }),
  );
  return Object.fromEntries(entries);
}

function withCreatedAt(data) {
  return data.createdAt ? data : { ...data, createdAt: Timestamp.now() };
}

function isAlreadyExists(err) {
  return err.code === ALREADY_EXISTS_CODE || err.code === 'already-exists';
}

async function createIfAbsent(ref, data) {
  try {
    await ref.create(withCreatedAt(data));
    return true;
  } catch (err) {
    if (isAlreadyExists(err)) return false;
    throw err;
  }
}

async function createAbsent(db, collectionName, items) {
  let created = 0;
  for (let i = 0; i < items.length; i += WRITE_CHUNK) {
    const chunk = items.slice(i, i + WRITE_CHUNK);
    const results = await Promise.all(
      chunk.map((item) => createIfAbsent(db.collection(collectionName).doc(item.id), item.data)),
    );
    created += results.filter(Boolean).length;
  }
  return created;
}

async function writePlan(db, plan) {
  const created = {};
  for (const kind of Object.keys(NEW_COLLECTIONS)) {
    created[kind] = await createAbsent(db, NEW_COLLECTIONS[kind], plan[kind]);
  }
  return created;
}

function formatCounts(counts) {
  return Object.entries(counts)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
}

function printUnmigratable(entries) {
  if (!entries.length) return;
  console.log(`  nao migraveis (fora do plano): ${entries.length}`);
  for (const entry of entries) console.log(`    ${entry.kind}/${entry.id}: ${entry.motivo}`);
}

function printCompanyReport(companyId, report, apply) {
  const verb = apply ? 'criados' : 'a criar';
  const skipped = report.skippedByKind;
  console.log(`\nEmpresa ${companyId}`);
  console.log(`  despesas por status: ${formatCounts(report.byStatus)}`);
  console.log(`  despesas por categoria: ${formatCounts(report.byCategory)}`);
  console.log(`  migracaoRevisar: ${report.revisar}`);
  console.log(
    `  pulados (ja existiam): ${report.skipped} ` +
      `(categorias=${skipped.categories} series=${skipped.series} despesas=${skipped.expenses})`,
  );
  console.log(`  ${verb}: ${formatCounts(report.created)}`);
  printUnmigratable(report.unmigratable);
}

function printIgnored(ignoredIds) {
  if (!ignoredIds.length) {
    console.log('\nSem companyId: nenhum doc legado ignorado.');
    return;
  }
  console.log(`\nIgnorados sem companyId (nao migrados): ${ignoredIds.length}`);
  for (const id of ignoredIds) console.log(`  ${id}`);
}

async function runMigration(db, args) {
  const bills = await readDocs(db, LEGACY_COLLECTIONS.bills);
  const purchaseProducts = await readDocs(db, LEGACY_COLLECTIONS.purchaseProducts);
  const companies = selectCompanies([...bills, ...purchaseProducts], args.companyId);

  if (!companies.length) console.log('\nNenhuma empresa com bills/purchaseProducts a migrar.');
  for (const companyId of companies) {
    const existingIds = await readExistingIds(db, companyId);
    const plan = planMigration({ companyId, bills, purchaseProducts, existingIds });
    if (args.apply) plan.report.created = await writePlan(db, plan);
    printCompanyReport(companyId, plan.report, args.apply);
  }

  printIgnored([
    ...idsWithoutCompany(LEGACY_COLLECTIONS.bills, bills),
    ...idsWithoutCompany(LEGACY_COLLECTIONS.purchaseProducts, purchaseProducts),
  ]);
}

function scopedQuery(query, companyId) {
  return companyId ? query.where('companyId', '==', companyId) : query;
}

function isOfCompany(doc, companyId) {
  return !companyId || doc.get('companyId') === companyId;
}

async function findMigratedExpenseDocs(db, companyId) {
  const query = scopedQuery(
    db.collection(NEW_COLLECTIONS.expenses).where('origin', '==', ORIGIN_MIGRACAO),
    companyId,
  );
  return (await query.select().get()).docs;
}

async function findMigratedOccurrenceDocs(db, companyId) {
  const snap = await db
    .collection(NEW_COLLECTIONS.expenses)
    .where('seriesId', '>=', ID_PREFIX_SERIES)
    .where('seriesId', '<', `${ID_PREFIX_SERIES}${PREFIX_RANGE_END_SENTINEL}`)
    .get();
  return snap.docs.filter((doc) => isOfCompany(doc, companyId));
}

// Expenses migradas: origin == migracao OU ocorrencia de serie migrada (qualquer origin).
async function findRollbackExpenseRefs(db, companyId) {
  const docs = [
    ...(await findMigratedExpenseDocs(db, companyId)),
    ...(await findMigratedOccurrenceDocs(db, companyId)),
  ];
  const byPath = new Map(docs.map((doc) => [doc.ref.path, doc.ref]));
  return [...byPath.values()];
}

async function findRollbackSeriesRefs(db, companyId) {
  const snap = await scopedQuery(db.collection(NEW_COLLECTIONS.series), companyId).get();
  return snap.docs
    .filter((doc) => doc.id.startsWith(ID_PREFIX_SERIES) && doc.data().legacyPurchaseProductId)
    .map((doc) => doc.ref);
}

async function deleteRefs(db, refs) {
  for (let i = 0; i < refs.length; i += DELETE_CHUNK) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + DELETE_CHUNK)) batch.delete(ref);
    await batch.commit();
  }
}

async function runRollback(db, args) {
  const expenseRefs = await findRollbackExpenseRefs(db, args.companyId);
  const seriesRefs = await findRollbackSeriesRefs(db, args.companyId);
  console.log(
    `\nRollback: despesas migradas=${expenseRefs.length}, series ${ID_PREFIX_SERIES}*=${seriesRefs.length}`,
  );
  if (!args.apply) {
    console.log('Nada apagado (dry-run). Rode com --rollback --apply para apagar.');
    return;
  }
  await deleteRefs(db, expenseRefs);
  await deleteRefs(db, seriesRefs);
  console.log(
    'Rollback aplicado: categorias, despesas manuais, series nao migradas e legado preservados.',
  );
}

function printMode(args) {
  const mode = args.apply ? 'APLICANDO (projeto hologaerp)' : 'DRY-RUN (nada gravado; use --apply)';
  console.log(`Modo: ${mode}${args.rollback ? ' [ROLLBACK]' : ''}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  assertTargetProject(args.project);
  const db = initFirestore();
  printMode(args);
  if (args.rollback) await runRollback(db, args);
  else await runMigration(db, args);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`Erro: ${err.message}`);
    process.exit(1);
  });
