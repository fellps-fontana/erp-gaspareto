// Backfill de companyId para o cliente unico ja em producao (projeto
// "default" = projetosfelipe-9e458), migrando do modelo single-tenant pro
// multi-tenant (branch homologacao).
//
// O QUE FAZ, NESTA ORDEM:
//   1. Cria (ou reaproveita) o usuario owner no Firebase Auth.
//   2. Cria companies/{companyId} e users/{uid} (owner).
//   3. Para cada colecao operacional (products, sales, comandas, orders,
//      bills, customers, purchases, purchaseProducts), le TODOS os docs que
//      ainda nao tem companyId e grava companyId neles em lotes (batch),
//      sem apagar/sobrescrever nenhum outro campo.
//
// SEGURANCA:
//   - Por padrao roda em modo DRY-RUN (so mostra o que faria, nao escreve
//     nada). Só grava de verdade com --apply explicito.
//   - Idempotente: pode rodar de novo com seguranca (docs que ja tem
//     companyId sao pulados; usuario/empresa ja existentes sao
//     reaproveitados em vez de duplicados).
//   - Nunca mexe em firestore.rules -- rodar ANTES de publicar as regras
//     novas, com as regras antigas (ou nenhuma) ainda no ar. Se as regras
//     multi-tenant ja estiverem publicadas quando isso rodar, o admin SDK
//     ainda funciona (ele ignora firestore.rules), mas o app dos usuarios
//     ja estara quebrado nesse meio-tempo -- por isso a ordem importa.
//
// PRE-REQUISITOS:
//   1. `npm install firebase-admin --save-dev` (se ainda nao tiver).
//   2. Uma service account key do projeto "projetosfelipe-9e458":
//      Console Firebase > Configuracoes do projeto > Contas de servico >
//      Gerar nova chave privada -- salvar como service-account.json (NAO
//      commitar esse arquivo, ja deve cair no .gitignore de *.json de
//      credencial; se nao cair, adicionar).
//   3. Definir as variaveis de ambiente abaixo (ou editar as constantes).
//
// USO:
//   SERVICE_ACCOUNT_PATH=./service-account.json \
//   OWNER_EMAIL=dono@cliente.com \
//   OWNER_PASSWORD="umaSenhaForte123" \
//   COMPANY_NAME="Nome Real do Cliente Ltda" \
//   node scripts/backfill-companyid.mjs                # dry-run (so mostra)
//
//   ...mesma coisa + --apply                            # grava de verdade
//
// Depois de rodar com --apply e conferir os dados no Console, so entao:
//   1. Publicar firestore.rules/firestore.indexes.json (branch homologacao)
//      no projeto default: firebase deploy --only firestore:rules,firestore:indexes --project default
//   2. Buildar e publicar o hosting de producao dessa branch.
//   3. Testar login com OWNER_EMAIL/OWNER_PASSWORD e conferir que os dados
//      antigos aparecem normalmente.

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');

const SERVICE_ACCOUNT_PATH = process.env.SERVICE_ACCOUNT_PATH;
const OWNER_EMAIL = process.env.OWNER_EMAIL;
const OWNER_PASSWORD = process.env.OWNER_PASSWORD;
const COMPANY_NAME = process.env.COMPANY_NAME;

const OPERATIONAL_COLLECTIONS = [
  'products', 'sales', 'comandas', 'orders', 'bills',
  'customers', 'purchases', 'purchaseProducts',
];

const DEFAULT_MODULES = {
  pdv: true, pedidos: true, gestao: true, rotas: true,
  contas: true, clientes: true, compras: true,
};

function fail(msg) {
  console.error(`\nErro: ${msg}\n`);
  process.exit(1);
}

if (!OWNER_EMAIL || !OWNER_PASSWORD || !COMPANY_NAME) {
  fail(
    'Defina OWNER_EMAIL, OWNER_PASSWORD e COMPANY_NAME nas variaveis de ' +
    'ambiente antes de rodar (ver instrucoes no topo do arquivo).'
  );
}
if (SERVICE_ACCOUNT_PATH && !existsSync(SERVICE_ACCOUNT_PATH)) {
  fail(`SERVICE_ACCOUNT_PATH aponta pra um arquivo que nao existe: ${SERVICE_ACCOUNT_PATH}`);
}

const credential = SERVICE_ACCOUNT_PATH
  ? cert(JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8')))
  : applicationDefault(); // requer `gcloud auth application-default login` se nao usar service account

const app = initializeApp({ credential, projectId: 'projetosfelipe-9e458' });
const auth = getAuth(app);
const firestore = getFirestore(app);

console.log(`\nModo: ${APPLY ? 'APLICANDO MUDANCAS DE VERDADE' : 'DRY-RUN (nada sera escrito)'}\n`);

async function ensureOwnerUser() {
  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(OWNER_EMAIL);
    console.log(`Usuario ja existe no Auth: ${OWNER_EMAIL} (uid=${userRecord.uid})`);
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
    console.log(`Usuario nao existe no Auth: ${OWNER_EMAIL} -- ${APPLY ? 'criando...' : '(seria criado)'}`);
    if (APPLY) {
      userRecord = await auth.createUser({ email: OWNER_EMAIL, password: OWNER_PASSWORD });
      console.log(`Criado uid=${userRecord.uid}`);
    }
  }
  return userRecord; // undefined em dry-run se o usuario ainda nao existir
}

async function ensureCompanyAndUserDocs(uid) {
  const companyRef = firestore.doc(`companies/${uid}`);
  const userRef = firestore.doc(`users/${uid}`);

  const [companySnap, userSnap] = await Promise.all([companyRef.get(), userRef.get()]);

  if (companySnap.exists) {
    console.log(`companies/${uid} ja existe -- nao sera sobrescrito.`);
  } else {
    console.log(`companies/${uid} ${APPLY ? 'sera criado' : '(dry-run, nao criado)'} com name="${COMPANY_NAME}"`);
    if (APPLY) {
      await companyRef.set({
        name: COMPANY_NAME,
        plan: 'basic',
        status: 'active',
        modules: DEFAULT_MODULES,
        createdAt: Timestamp.now(),
      });
    }
  }

  if (userSnap.exists) {
    console.log(`users/${uid} ja existe -- nao sera sobrescrito.`);
  } else {
    console.log(`users/${uid} ${APPLY ? 'sera criado' : '(dry-run, nao criado)'} com role=owner`);
    if (APPLY) {
      await userRef.set({
        uid, email: OWNER_EMAIL, companyId: uid, role: 'owner',
        createdAt: Timestamp.now(),
      });
    }
  }

  return uid; // companyId == uid do owner, mesmo padrao do seed-demo/signup
}

async function backfillCollection(collectionName, companyId) {
  const snap = await firestore.collection(collectionName).get();
  const missing = snap.docs.filter((d) => !d.get('companyId'));

  console.log(`${collectionName}: ${snap.size} docs totais, ${missing.length} sem companyId.`);
  if (missing.length === 0) return { total: snap.size, updated: 0 };

  if (!APPLY) return { total: snap.size, updated: missing.length };

  // Firestore limita batch a 500 writes.
  const CHUNK = 450;
  let updated = 0;
  for (let i = 0; i < missing.length; i += CHUNK) {
    const batch = firestore.batch();
    for (const docSnap of missing.slice(i, i + CHUNK)) {
      batch.update(docSnap.ref, { companyId });
    }
    await batch.commit();
    updated += Math.min(CHUNK, missing.length - i);
    console.log(`  ...${updated}/${missing.length} atualizados`);
  }
  return { total: snap.size, updated };
}

async function main() {
  const userRecord = await ensureOwnerUser();
  const uid = userRecord ? userRecord.uid : '<uid-so-existira-apos---apply>';

  if (APPLY) {
    await ensureCompanyAndUserDocs(uid);
  } else {
    console.log(`companies/${uid} e users/${uid} seriam criados (dry-run).`);
  }

  console.log('\nBackfill de companyId por colecao:\n');
  const summary = {};
  for (const col of OPERATIONAL_COLLECTIONS) {
    summary[col] = await backfillCollection(col, uid);
  }

  console.log('\nResumo:');
  for (const [col, { total, updated }] of Object.entries(summary)) {
    console.log(`  ${col}: ${total} docs, ${updated} ${APPLY ? 'atualizados' : 'a atualizar'}`);
  }

  if (!APPLY) {
    console.log('\nNada foi escrito (dry-run). Revise os numeros acima e rode de novo com --apply.');
  } else {
    console.log(`\nPronto. companyId usado: ${uid}. Login: ${OWNER_EMAIL}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Erro no backfill:', err);
  process.exit(1);
});
