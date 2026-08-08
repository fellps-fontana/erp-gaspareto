// Popula uma empresa de demonstracao no Firestore/Auth EMULATOR local.
// Nunca toca o Firebase real -- conecta explicitamente nos emuladores
// (127.0.0.1:8080 Firestore, 127.0.0.1:9099 Auth). Rode com os emuladores
// ja de pe (npm run emulators, ou firebase emulators:start --only
// firestore,auth --project demo-test).
//
// Uso: node scripts/seed-demo.mjs

import { initializeApp } from 'firebase/app';
import {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword,
} from 'firebase/auth';
import {
  getFirestore, connectFirestoreEmulator, doc, setDoc, addDoc, collection,
  Timestamp, runTransaction,
} from 'firebase/firestore';

const DEMO_EMAIL = 'demo@gaspareto.com';
const DEMO_PASSWORD = 'demo123456';
const DEMO_COMPANY_NAME = 'Gaspareto Demo Ltda';

const app = initializeApp({ projectId: 'demo-test', apiKey: 'demo-key' }, 'seed-demo-app');
const auth = getAuth(app);
const firestore = getFirestore(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
connectFirestoreEmulator(firestore, '127.0.0.1', 8080);

const DEFAULT_MODULES = {
  pdv: true, pedidos: true, gestao: true, rotas: true,
  contas: true, clientes: true, compras: true,
};

async function main() {
  console.log('Criando usuario/empresa demo...');
  const cred = await createUserWithEmailAndPassword(auth, DEMO_EMAIL, DEMO_PASSWORD);
  const uid = cred.user.uid;

  await runTransaction(firestore, async (tx) => {
    tx.set(doc(firestore, 'companies', uid), {
      name: DEMO_COMPANY_NAME,
      plan: 'trial',
      status: 'active',
      modules: DEFAULT_MODULES,
      createdAt: Timestamp.now(),
    });
    tx.set(doc(firestore, 'users', uid), {
      uid, email: DEMO_EMAIL, companyId: uid, role: 'owner',
      createdAt: Timestamp.now(),
    });
  });
  console.log(`Empresa criada: ${DEMO_COMPANY_NAME} (companyId=${uid})`);

  const companyId = uid;

  console.log('Semeando produtos...');
  const products = [
    { title: 'Coca-Cola 2L', buyPrice: 6.5, sellPrice: 11.9, stock: 48, color: '#e74c3c' },
    { title: 'Guarana Antarctica 2L', buyPrice: 6.0, sellPrice: 10.9, stock: 32, color: '#f39c12' },
    { title: 'Agua Mineral 500ml', buyPrice: 1.2, sellPrice: 3.5, stock: 120, color: '#3498db' },
    { title: 'Cerveja Pilsen Lata 350ml', buyPrice: 2.8, sellPrice: 6.5, stock: 96, color: '#f1c40f' },
    { title: 'Pao de Alho', buyPrice: 8.0, sellPrice: 16.9, stock: 20, color: '#d35400' },
    { title: 'Batata Frita Congelada 1kg', buyPrice: 9.5, sellPrice: 19.9, stock: 15, color: '#e67e22' },
    { title: 'Pizza Calabresa', buyPrice: 14.0, sellPrice: 34.9, stock: 10, color: '#c0392b' },
    { title: 'Pizza Margherita', buyPrice: 13.0, sellPrice: 32.9, stock: 8, color: '#27ae60' },
  ];
  const productIds = [];
  for (const p of products) {
    const ref = await addDoc(collection(firestore, 'products'), { ...p, companyId });
    productIds.push({ id: ref.id, ...p });
  }

  console.log('Semeando clientes (Chapeco/SC)...');
  const customers = [
    {
      name: 'Joao da Silva', phone: '49999871234',
      address: 'Rua Marechal Deodoro, 1500 - Centro, Chapeco - SC',
      cep: '89802-210', rua: 'Rua Marechal Deodoro', numero: '1500',
      bairro: 'Centro', cidade: 'Chapeco', uf: 'SC',
      lat: -27.0964, lng: -52.6183,
    },
    {
      name: 'Maria Oliveira', phone: '49998762345',
      address: 'Rua Uruguai, 2340 - Efapi, Chapeco - SC',
      cep: '89809-310', rua: 'Rua Uruguai', numero: '2340',
      bairro: 'Efapi', cidade: 'Chapeco', uf: 'SC',
      lat: -27.0850, lng: -52.6690,
    },
    {
      name: 'Pedro Souza', phone: '49997653456',
      address: 'Av. Fernando Machado, 890 - Palmital, Chapeco - SC',
      cep: '89805-000', rua: 'Av. Fernando Machado', numero: '890',
      bairro: 'Palmital', cidade: 'Chapeco', uf: 'SC',
      lat: -27.0800, lng: -52.6100,
    },
    {
      name: 'Ana Beatriz Costa', phone: '49996544567',
      address: 'Rua Getulio Vargas, 445 - Passo dos Fortes, Chapeco - SC',
      cep: '89805-400', rua: 'Rua Getulio Vargas', numero: '445',
      bairro: 'Passo dos Fortes', cidade: 'Chapeco', uf: 'SC',
      lat: -27.1050, lng: -52.6250,
    },
    {
      name: 'Carlos Eduardo Bett', phone: '49995435678',
      address: 'Rua Fernando Simas, 210 - Presidente Medici, Chapeco - SC',
      cep: '89802-450', rua: 'Rua Fernando Simas', numero: '210',
      bairro: 'Presidente Medici', cidade: 'Chapeco', uf: 'SC',
      lat: -27.0920, lng: -52.6350,
    },
  ];
  const customerIds = [];
  for (const c of customers) {
    const ref = await addDoc(collection(firestore, 'customers'), { ...c, companyId });
    customerIds.push({ id: ref.id, ...c });
  }

  // Helper: data no passado (dias atras, com hora variavel) -- pra parecer
  // historico de verdade, nao tudo criado "agora".
  const daysAgo = (days, hour = 12) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(hour, Math.floor(Math.random() * 60), 0, 0);
    return Timestamp.fromDate(d);
  };

  console.log('Semeando vendas (PDV)...');
  for (let i = 0; i < 14; i++) {
    const p = productIds[i % productIds.length];
    const qty = 1 + (i % 3);
    await addDoc(collection(firestore, 'sales'), {
      items: [{
        idProduct: p.id, productName: p.title, quantity: qty,
        priceAtSale: p.sellPrice, priceAtCost: p.buyPrice,
      }],
      total: p.sellPrice * qty,
      date: daysAgo(i % 20, 9 + (i % 10)),
      paymentMethod: i % 2 === 0 ? 'dinheiro' : 'pix',
      sale_type: 'pdv',
      status: 'completed',
      companyId,
    });
  }

  // Pedidos: 4 por cliente (20 no total), espalhados nas ultimas semanas.
  // So usa status que a UI de fato sabe avancar (order.ts getNextActionLabel
  // so trata pending/delivering/delivered -- "preparing"/"ready" existem no
  // tipo mas ficam sem nenhuma acao disponivel, parecem travados na demo).
  console.log('Semeando pedidos (historico por cliente)...');
  // pesos: maioria finalizado/entregue (historico real), alguns em andamento,
  // 1 cancelado pra mostrar o fluxo completo.
  const orderStatusCycle = ['finished', 'finished', 'delivered', 'finished', 'delivering', 'pending', 'canceled'];
  let orderCount = 0;
  for (const c of customerIds) {
    const ordersForCustomer = 3 + (orderCount % 2); // 3 ou 4 pedidos por cliente
    for (let j = 0; j < ordersForCustomer; j++) {
      const status = orderStatusCycle[orderCount % orderStatusCycle.length];
      const p1 = productIds[orderCount % productIds.length];
      const p2 = productIds[(orderCount + 3) % productIds.length];
      const qty1 = 1 + (orderCount % 3);
      const qty2 = 1 + ((orderCount + 1) % 2);
      const itemsTotal = p1.sellPrice * qty1 + p2.sellPrice * qty2;
      const shippingCost = 5 + (orderCount % 3) * 2;
      const created = daysAgo(3 + orderCount * 3, 11 + (orderCount % 8));

      const orderData = {
        customerName: c.name,
        customerPhone: c.phone,
        customerId: c.id,
        items: [
          { idProduct: p1.id, productName: p1.title, quantity: qty1, priceAtSale: p1.sellPrice, priceAtCost: p1.buyPrice },
          { idProduct: p2.id, productName: p2.title, quantity: qty2, priceAtSale: p2.sellPrice, priceAtCost: p2.buyPrice },
        ],
        itemsTotal,
        shippingCost,
        total: itemsTotal + shippingCost,
        deliveryType: 'delivery',
        address: c.address,
        addressLat: c.lat,
        addressLng: c.lng,
        status,
        createdAt: created,
        scheduledDate: created,
        companyId,
      };

      if (status === 'delivered' || status === 'finished') {
        orderData.actualDeliveryDate = daysAgo(Math.max(0, 3 + orderCount * 3 - 1));
      }
      if (status === 'finished') {
        orderData.paymentDate = daysAgo(Math.max(0, 3 + orderCount * 3 - 1));
        orderData.closingDate = daysAgo(Math.max(0, 3 + orderCount * 3 - 1));
      }

      await addDoc(collection(firestore, 'orders'), orderData);
      orderCount++;
    }
  }

  console.log('Semeando comanda aberta...');
  await addDoc(collection(firestore, 'comandas'), {
    customerName: 'Mesa 4',
    items: [
      { idProduct: productIds[3].id, productName: productIds[3].title, quantity: 4, priceAtSale: productIds[3].sellPrice, priceAtCost: productIds[3].buyPrice },
      { idProduct: productIds[6].id, productName: productIds[6].title, quantity: 1, priceAtSale: productIds[6].sellPrice, priceAtCost: productIds[6].buyPrice },
    ],
    total: productIds[3].sellPrice * 4 + productIds[6].sellPrice,
    createdAt: Timestamp.now(),
    status: 'open',
    companyId,
  });

  console.log('Semeando contas a pagar/receber...');
  const bills = [
    { name: 'Fornecedor de bebidas', value: 850.0, status: 'pendente', recurring: false },
    { name: 'Aluguel do ponto', value: 2200.0, status: 'recebido', recurring: true, recurrencePeriod: 'mensal' },
    { name: 'Conta de energia', value: 340.5, status: 'pago', recurring: true, recurrencePeriod: 'mensal' },
  ];
  for (const b of bills) {
    await addDoc(collection(firestore, 'bills'), { ...b, createdAt: Timestamp.now(), companyId });
  }

  console.log('Semeando produto de compra recorrente...');
  await addDoc(collection(firestore, 'purchaseProducts'), {
    name: 'Fornecedor de bebidas - pedido mensal',
    defaultValue: 850.0,
    recurring: true,
    recurrencePeriod: 'monthly',
    createdAt: Timestamp.now(),
    companyId,
  });

  console.log('\nPronto! Login da demo:');
  console.log(`  email: ${DEMO_EMAIL}`);
  console.log(`  senha: ${DEMO_PASSWORD}`);
  console.log(`  empresa: ${DEMO_COMPANY_NAME}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Erro ao semear demo:', err);
  process.exit(1);
});
