// Popula uma empresa de demonstracao (dados ficticios) para gravar video/demo.
//
// Alvos:
//   node scripts/seed-demo.mjs            -> EMULATOR local (127.0.0.1:8080/9099)
//   node scripts/seed-demo.mjs --target=hml -> HOMOLOG real (hologaerp)
//
// O PROD (projetosfelipe-9e458) e recusado explicitamente: dado ficticio nunca
// entra em producao. No emulador, rode com os emuladores ja de pe
// (npm run emulators, ou firebase emulators:start --only firestore,auth
// --project demo-test).
//
// Escreve como o proprio usuario demo (SDK client + firestore.rules), igual a
// tela de cadastro: nenhuma credencial de admin e necessaria. Se a conta demo
// ja existir e ja tiver produtos, aborta pra nao duplicar dados.

import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator, doc, getDocs, query, where,
  collection, Timestamp, runTransaction, writeBatch,
} from 'firebase/firestore';

const DEMO_EMAIL = 'demo@gaspareto.com';
const DEMO_PASSWORD = 'demo123456';
const DEMO_COMPANY_NAME = 'Gaspareto Demo Ltda';
const PROD_PROJECT_ID = 'projetosfelipe-9e458';

const target = (process.argv.find(a => a.startsWith('--target=')) ?? '--target=emulator').split('=')[1];

function loadStagingFirebaseConfig() {
  const src = readFileSync(new URL('../src/enviroments/enviroments.staging.ts', import.meta.url), 'utf8');
  const pick = (key) => {
    const m = src.match(new RegExp(`${key}:\\s*"([^"]+)"`));
    if (!m) throw new Error(`Campo ${key} nao encontrado em enviroments.staging.ts`);
    return m[1];
  };
  return {
    apiKey: pick('apiKey'), authDomain: pick('authDomain'), projectId: pick('projectId'),
    storageBucket: pick('storageBucket'), messagingSenderId: pick('messagingSenderId'), appId: pick('appId'),
  };
}

let firebaseConfig;
if (target === 'emulator') {
  firebaseConfig = { projectId: 'demo-test', apiKey: 'demo-key' };
} else if (target === 'hml') {
  firebaseConfig = loadStagingFirebaseConfig();
} else {
  console.error(`Alvo invalido: ${target}. Use --target=emulator ou --target=hml.`);
  process.exit(1);
}
if (firebaseConfig.projectId === PROD_PROJECT_ID) {
  console.error('Recusado: seed de demo nunca roda contra o PROD.');
  process.exit(1);
}

const app = initializeApp(firebaseConfig, 'seed-demo-app');
const auth = getAuth(app);
const firestore = getFirestore(app);
if (target === 'emulator') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
}

const DEFAULT_MODULES = {
  pdv: true, pedidos: true, gestao: true, rotas: true, contas: true,
  clientes: true, compras: true, vendedores: true,
  notificacoes: { aniversario: true },
};

// --- helpers de data -------------------------------------------------------
const NOW = new Date();
const at = (daysOffset, hour = 12, minute = 0) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + daysOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
};
const ts = (date) => Timestamp.fromDate(date);
const round2 = (n) => Math.round((n + 1e-9) * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');

// gerador deterministico: o mesmo seed gera sempre a mesma demo
let rngState = 20261016;
const rand = () => {
  rngState = (rngState * 1103515245 + 12345) % 2147483648;
  return rngState / 2147483648;
};
const pickOne = (arr) => arr[Math.floor(rand() * arr.length)];
const randInt = (min, max) => min + Math.floor(rand() * (max - min + 1));

// Mesmo arredondamento de calcularTotalItemPorPeso (centavos, tie goes up).
const lineTotal = (item) => round2(item.priceAtSale * item.quantity);

const toItem = (p, quantity) => ({
  idProduct: p.id, productName: p.title, quantity,
  priceAtSale: p.sellPrice, priceAtCost: p.buyPrice,
  soldByWeight: p.soldByWeight ?? false,
});

// Batch em lotes (limite de 500 escritas por batch).
async function commitAll(writes) {
  for (let i = 0; i < writes.length; i += 400) {
    const batch = writeBatch(firestore);
    for (const [ref, data] of writes.slice(i, i + 400)) batch.set(ref, data);
    await batch.commit();
  }
}

async function getOrCreateDemoUser() {
  try {
    const cred = await createUserWithEmailAndPassword(auth, DEMO_EMAIL, DEMO_PASSWORD);
    const uid = cred.user.uid;
    await runTransaction(firestore, async (tx) => {
      tx.set(doc(firestore, 'companies', uid), {
        name: DEMO_COMPANY_NAME, plan: 'trial', status: 'active',
        modules: DEFAULT_MODULES, createdAt: ts(at(-45, 9)),
      });
      tx.set(doc(firestore, 'users', uid), {
        uid, email: DEMO_EMAIL, companyId: uid, role: 'owner', createdAt: ts(at(-45, 9)),
      });
    });
    console.log(`Conta demo criada (companyId=${uid}).`);
    return uid;
  } catch (err) {
    if (err?.code !== 'auth/email-already-in-use') throw err;
    const cred = await signInWithEmailAndPassword(auth, DEMO_EMAIL, DEMO_PASSWORD);
    const uid = cred.user.uid;
    const existing = await getDocs(query(collection(firestore, 'products'), where('companyId', '==', uid)));
    if (!existing.empty) {
      console.error(`A conta demo ja tem ${existing.size} produtos. Abortando pra nao duplicar.`);
      process.exit(1);
    }
    console.log(`Conta demo ja existia, sem dados (companyId=${uid}). Semeando...`);
    return uid;
  }
}

async function main() {
  console.log(`Alvo: ${target} (${firebaseConfig.projectId})`);
  const companyId = await getOrCreateDemoUser();
  const writes = [];
  const newRef = (col) => doc(collection(firestore, col));

  // --- produtos --------------------------------------------------------------
  const productDefs = [
    { title: 'Coca-Cola 2L', buyPrice: 6.5, sellPrice: 11.9, stock: 48, color: '#e74c3c' },
    { title: 'Guaraná Antarctica 2L', buyPrice: 6.0, sellPrice: 10.9, stock: 36, color: '#f39c12' },
    { title: 'Água Mineral 500ml', buyPrice: 1.2, sellPrice: 3.5, stock: 120, color: '#3498db' },
    { title: 'Cerveja Pilsen Lata 350ml', buyPrice: 2.8, sellPrice: 6.5, stock: 144, color: '#f1c40f' },
    { title: 'Cerveja Artesanal IPA 500ml', buyPrice: 11.0, sellPrice: 22.9, stock: 24, color: '#b9770e' },
    { title: 'Suco de Uva Integral 1L', buyPrice: 9.0, sellPrice: 17.9, stock: 30, color: '#8e44ad' },
    { title: 'Pizza Calabresa', buyPrice: 14.0, sellPrice: 39.9, stock: 18, color: '#c0392b' },
    { title: 'Pizza Margherita', buyPrice: 13.0, sellPrice: 37.9, stock: 14, color: '#27ae60' },
    { title: 'Pão de Alho (pct)', buyPrice: 8.0, sellPrice: 16.9, stock: 22, color: '#d35400' },
    { title: 'Carvão 5kg', buyPrice: 15.0, sellPrice: 29.9, stock: 4, color: '#2c3e50' },
    { title: 'Queijo Colonial (kg)', buyPrice: 32.0, sellPrice: 54.9, stock: 12.4, color: '#f7dc6f', soldByWeight: true },
    { title: 'Salame Colonial (kg)', buyPrice: 38.0, sellPrice: 69.9, stock: 6.85, color: '#922b21', soldByWeight: true },
    { title: 'Picanha (kg)', buyPrice: 62.0, sellPrice: 94.9, stock: 9.2, color: '#a93226', soldByWeight: true },
  ];
  const products = productDefs.map(p => {
    const ref = newRef('products');
    writes.push([ref, { ...p, companyId }]);
    return { id: ref.id, ...p };
  });
  const unitProducts = products.filter(p => !p.soldByWeight);
  const weightProducts = products.filter(p => p.soldByWeight);
  const randomItems = (maxLines) => {
    const lines = randInt(1, maxLines);
    const used = new Set();
    const items = [];
    for (let i = 0; i < lines; i++) {
      const useWeight = rand() < 0.25;
      const p = useWeight ? pickOne(weightProducts) : pickOne(unitProducts);
      if (used.has(p.id)) continue; // linha unica por produto
      used.add(p.id);
      const qty = p.soldByWeight ? round2(randInt(300, 1800) / 1000) : randInt(1, 4);
      items.push(toItem(p, qty));
    }
    return items;
  };

  // --- vendedores ------------------------------------------------------------
  const byTitle = (t) => products.find(p => p.title.startsWith(t));
  const vendedorDefs = [
    { name: 'Rafael Menegatti', comissoes: [
      { idProduct: byTitle('Pizza Calabresa').id, percentual: 8 },
      { idProduct: byTitle('Pizza Margherita').id, percentual: 8 },
      { idProduct: byTitle('Picanha').id, percentual: 5 },
    ] },
    { name: 'Juliana Pertile', comissoes: [
      { idProduct: byTitle('Cerveja Pilsen').id, percentual: 4 },
      { idProduct: byTitle('Cerveja Artesanal').id, percentual: 10 },
      { idProduct: byTitle('Queijo Colonial').id, percentual: 6 },
      { idProduct: byTitle('Salame Colonial').id, percentual: 6 },
    ] },
    { name: 'Bruno Zanella', comissoes: [
      { idProduct: byTitle('Coca-Cola').id, percentual: 3 },
      { idProduct: byTitle('Guaraná').id, percentual: 3 },
      { idProduct: byTitle('Carvão').id, percentual: 5 },
    ] },
  ];
  const vendedores = vendedorDefs.map(v => {
    const ref = newRef('vendedores');
    writes.push([ref, { ...v, companyId }]);
    return { id: ref.id, ...v };
  });

  // --- clientes (Chapeco/SC, ficticios) --------------------------------------
  const today = at(0);
  const inTwoDays = at(2);
  const customerDefs = [
    { name: 'João da Silva', phone: '49999871234', rua: 'Rua Marechal Deodoro', numero: '1500', bairro: 'Centro', cep: '89802-210', lat: -27.0964, lng: -52.6183, birth: `1985-${pad(today.getMonth() + 1)}-${pad(today.getDate())}` },
    { name: 'Maria Oliveira', phone: '49998762345', rua: 'Rua Uruguai', numero: '2340', bairro: 'Efapi', cep: '89809-310', lat: -27.0850, lng: -52.6690, birth: `1992-${pad(inTwoDays.getMonth() + 1)}-${pad(inTwoDays.getDate())}` },
    { name: 'Pedro Souza', phone: '49997653456', rua: 'Av. Fernando Machado', numero: '890', bairro: 'Palmital', cep: '89805-000', lat: -27.0800, lng: -52.6100, birth: '1978-03-12' },
    { name: 'Ana Beatriz Costa', phone: '49996544567', rua: 'Rua Getúlio Vargas', numero: '445', bairro: 'Passo dos Fortes', cep: '89805-400', lat: -27.1050, lng: -52.6250, birth: '1990-07-25' },
    { name: 'Carlos Eduardo Bett', phone: '49995435678', rua: 'Rua Fernando Simas', numero: '210', bairro: 'Presidente Médici', cep: '89802-450', lat: -27.0920, lng: -52.6350, birth: '1983-11-02' },
    { name: 'Fernanda Dal Pizzol', phone: '49994326789', rua: 'Rua Lauro Müller', numero: '77', bairro: 'Jardim Itália', cep: '89802-140', lat: -27.1012, lng: -52.6091, birth: '1995-01-19' },
    { name: 'Lucas Tomazelli', phone: '49993217890', rua: 'Rua Barão do Rio Branco', numero: '1320', bairro: 'São Cristóvão', cep: '89803-000', lat: -27.1105, lng: -52.6042, birth: '1988-09-08' },
    { name: 'Bar do Gringo', phone: '49991109876', rua: 'Av. Getúlio Dorneles Vargas', numero: '3050', bairro: 'Bela Vista', cep: '89804-000', lat: -27.0878, lng: -52.6421 },
  ];
  const customers = customerDefs.map(c => {
    const ref = newRef('customers');
    const address = `${c.rua}, ${c.numero} - ${c.bairro}, Chapecó - SC`;
    const data = {
      name: c.name, phone: c.phone, address, cep: c.cep, rua: c.rua, numero: c.numero,
      bairro: c.bairro, cidade: 'Chapecó', uf: 'SC', lat: c.lat, lng: c.lng, companyId,
      ...(c.birth ? { dataAniversario: c.birth } : {}),
    };
    writes.push([ref, data]);
    return { id: ref.id, ...data };
  });

  // --- vendas PDV (30 dias) --------------------------------------------------
  const paymentMethods = ['dinheiro', 'pix', 'pix', 'cartao', 'cartao', 'dinheiro'];
  let pdvCount = 0;
  for (let day = -30; day <= 0; day++) {
    const salesToday = day === 0 ? 3 : randInt(0, 3);
    for (let s = 0; s < salesToday; s++) {
      const items = randomItems(3);
      const paymentMethod = pickOne(paymentMethods);
      const total = round2(items.reduce((a, i) => a + lineTotal(i), 0));
      const installments = paymentMethod === 'cartao' && total > 60 ? randInt(1, 3) : 1;
      writes.push([newRef('sales'), {
        items, total, paymentMethod, installments, sale_type: 'pdv', status: 'completed',
        date: ts(at(day, randInt(9, 21), randInt(0, 59))), companyId,
      }]);
      pdvCount++;
    }
  }

  // --- pedidos ---------------------------------------------------------------
  // Status so dos que o codigo grava: pending, delivered, finished, canceled.
  // Finalizado gera tambem uma sale com sale_type 'order' (como finalizeOrder).
  const orderPlans = [];
  for (let i = 0; i < 22; i++) {
    const day = -28 + Math.floor(i * 1.25);
    orderPlans.push({ day, status: i % 9 === 4 ? 'canceled' : 'finished' });
  }
  orderPlans.push({ day: -2, status: 'delivered' }, { day: -1, status: 'delivered' });
  orderPlans.push(
    { day: -1, status: 'pending', scheduled: 0 },
    { day: 0, status: 'pending', scheduled: 0 },
    { day: 0, status: 'pending', scheduled: 0 },
    { day: 0, status: 'pending', scheduled: 1 },
    { day: 0, status: 'pending' },
  );
  orderPlans.sort((a, b) => a.day - b.day);

  let orderNumber = 0;
  for (const plan of orderPlans) {
    orderNumber++;
    const c = customers[orderNumber % customers.length];
    const pickup = plan.status !== 'pending' && rand() < 0.2;
    const items = randomItems(3);
    const itemsTotal = round2(items.reduce((a, i) => a + lineTotal(i), 0));
    const shippingCost = pickup ? 0 : pickOne([5, 7, 10, 12]);
    const total = round2(itemsTotal + shippingCost);
    const created = at(plan.day, randInt(9, 18), randInt(0, 59));
    const vend = rand() < 0.75 ? vendedores[orderNumber % vendedores.length] : null;

    const order = {
      orderNumber, customerName: c.name, customerPhone: c.phone, customerId: c.id,
      items, itemsTotal, shippingCost, total,
      deliveryType: pickup ? 'pickup' : 'delivery',
      ...(pickup ? {} : { address: c.address, addressLat: c.lat, addressLng: c.lng }),
      status: plan.status, createdAt: ts(created), companyId,
      ...(vend ? { vendedorId: vend.id, vendedorName: vend.name } : {}),
    };
    if (plan.scheduled !== undefined) order.scheduledDate = ts(at(plan.scheduled, randInt(14, 19)));
    if (plan.day === -1 && plan.status === 'pending') order.observations = 'Entregar após as 18h — interfone 102';

    if (plan.status === 'delivered' || plan.status === 'finished') {
      order.actualDeliveryDate = ts(new Date(created.getTime() + 2 * 3600 * 1000));
    }
    if (plan.status === 'finished') {
      const closing = new Date(created.getTime() + randInt(3, 30) * 3600 * 1000);
      const closingDate = closing > NOW ? NOW : closing;
      const paymentMethod = pickOne(['pix', 'pix', 'dinheiro', 'cartao', 'boleto']);
      const installments = paymentMethod === 'cartao' && total > 80 ? 2 : 1;
      Object.assign(order, {
        paymentMethod, installments,
        paymentDate: ts(closingDate), closingDate: ts(closingDate),
      });
      writes.push([newRef('sales'), {
        items, total, paymentMethod, installments, sale_type: 'order', status: 'completed',
        customerId: c.id, date: ts(closingDate), companyId,
      }]);
    }
    writes.push([newRef('orders'), order]);
  }
  writes.push([doc(firestore, 'counters', companyId), { nextOrderNumber: orderNumber + 1 }]);

  // --- comandas abertas ------------------------------------------------------
  const comanda = (customerName, lines, hoursAgo) => {
    const items = lines.map(([t, q]) => toItem(byTitle(t), q));
    writes.push([newRef('comandas'), {
      customerName, items, total: round2(items.reduce((a, i) => a + lineTotal(i), 0)),
      createdAt: ts(new Date(NOW.getTime() - hoursAgo * 3600 * 1000)), status: 'open', companyId,
    }]);
  };
  comanda('Mesa 4', [['Cerveja Pilsen', 6], ['Pizza Calabresa', 1], ['Queijo Colonial', 0.45]], 1.5);
  comanda('Mesa 7', [['Cerveja Artesanal', 2], ['Pão de Alho', 1], ['Água Mineral', 2]], 0.5);

  // --- compras de estoque ----------------------------------------------------
  const purchaseDefs = [
    ['Coca-Cola', 24, -27], ['Cerveja Pilsen', 96, -25], ['Pizza Calabresa', 20, -21],
    ['Queijo Colonial', 10, -18], ['Água Mineral', 60, -15], ['Picanha', 8, -12],
    ['Guaraná', 24, -9], ['Cerveja Artesanal', 24, -6], ['Salame Colonial', 5, -4], ['Carvão', 10, -2],
  ];
  for (const [t, amount, day] of purchaseDefs) {
    const p = byTitle(t);
    writes.push([newRef('purchases'), {
      idProduct: p.id, unityValue: p.buyPrice, amount, date: ts(at(day, 10)), companyId,
    }]);
  }

  // --- fornecedores recorrentes + contas -------------------------------------
  const ppDefs = [
    { name: 'Distribuidora de Bebidas Oeste', defaultValue: 1850, recurring: true, recurrencePeriod: 'monthly' },
    { name: 'Frigorífico Chapecó - carnes', defaultValue: 620, recurring: true, recurrencePeriod: 'weekly' },
    { name: 'Embalagens e descartáveis', defaultValue: 280, recurring: false },
  ];
  const purchaseProducts = ppDefs.map(pp => {
    const ref = newRef('purchaseProducts');
    writes.push([ref, { ...pp, createdAt: ts(at(-40, 9)), companyId }]);
    return { id: ref.id, ...pp };
  });

  const bill = (name, value, dueDay, status, extra = {}) => {
    const data = {
      name, value, dueDate: ts(at(dueDay, 12)), status, recurring: false,
      createdAt: ts(at(Math.min(dueDay, 0) - 5, 9)), companyId, ...extra,
    };
    if (status === 'pago') data.paidAt = ts(at(Math.min(dueDay, 0), 15));
    if (status === 'recebido') data.receivedAt = ts(at(Math.min(dueDay, 0), 15));
    writes.push([newRef('bills'), data]);
  };
  const [bebidas, carnes] = purchaseProducts;
  const linkMensal = { recurring: true, recurrencePeriod: 'mensal', purchaseProductId: bebidas.id };
  const linkSemanal = { recurring: true, recurrencePeriod: 'semanal', purchaseProductId: carnes.id };
  bill(bebidas.name, 1850, -16, 'pago', linkMensal);
  bill(bebidas.name, 1850, 14, 'pendente', linkMensal);
  bill(carnes.name, 620, -7, 'pago', linkSemanal);
  bill(carnes.name, 620, 0, 'pendente', linkSemanal);
  bill(carnes.name, 620, 7, 'pendente', linkSemanal);
  bill('Aluguel do ponto', 2200, -15, 'pago', { recurring: true, recurrencePeriod: 'mensal' });
  bill('Conta de energia', 412.37, -3, 'pendente');
  bill('Internet', 129.9, 5, 'pendente');
  bill('Embalagens e descartáveis', 280, -10, 'pago', { purchaseProductId: purchaseProducts[2].id });
  bill('Evento corporativo - Coopercentral', 3400, -8, 'recebido');
  bill('Festa de aniversário - Bar do Gringo', 1250, 3, 'pendente');

  console.log(`Gravando ${writes.length} documentos...`);
  await commitAll(writes);

  console.log('\nPronto!');
  console.log(`  ${products.length} produtos (${weightProducts.length} por kg), ${vendedores.length} vendedores, ${customers.length} clientes`);
  console.log(`  ${pdvCount} vendas PDV, ${orderNumber} pedidos, 2 comandas abertas, ${purchaseDefs.length} compras`);
  console.log(`\nLogin: ${DEMO_EMAIL} / ${DEMO_PASSWORD}  (${DEMO_COMPANY_NAME})`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Erro ao semear demo:', err);
  process.exit(1);
});
