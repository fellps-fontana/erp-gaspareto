import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  getDocs,
  Timestamp,
} from 'firebase/firestore';

describe('Firestore Security Rules - Multi-tenant Authorization (Fase 1)', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-test',
      firestore: {
        host: '127.0.0.1',
        port: 8080,
      },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  const semeiaUserDoc = async (
    uid: string,
    email: string,
    companyId: string,
    role: string,
    isSuperAdmin?: boolean,
  ) => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const userRef = doc(context.firestore(), 'users', uid);
      await setDoc(userRef, {
        uid,
        email,
        companyId,
        role,
        ...(isSuperAdmin !== undefined && { isSuperAdmin }),
        createdAt: Timestamp.now(),
      });
    });
  };

  const autenticarComo = (uid: string, email: string) => {
    return testEnv.authenticatedContext(uid, { email });
  };

  describe('Leitura cross-tenant (deve ser NEGADA)', () => {
    it('usuario de company A nao pode ler doc de company B em products', async () => {
      await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');
      await semeiaUserDoc('user-b', 'user-b@test.com', 'company-b', 'owner');

      const contextCompanyB = autenticarComo('user-b', 'user-b@test.com');
      const docRef = doc(contextCompanyB.firestore(), 'products', 'product-001');
      await setDoc(docRef, {
        name: 'Produto B',
        companyId: 'company-b',
      });

      const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
      const readRef = doc(contextCompanyA.firestore(), 'products', 'product-001');
      await assertFails(getDoc(readRef));
    });

    it('usuario de company A nao pode fazer query com docs de company B em sales', async () => {
      await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');
      await semeiaUserDoc('user-b', 'user-b@test.com', 'company-b', 'owner');

      const contextCompanyB = autenticarComo('user-b', 'user-b@test.com');
      const docRef = doc(contextCompanyB.firestore(), 'sales', 'sale-001');
      await setDoc(docRef, {
        total: 100,
        companyId: 'company-b',
      });

      const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
      const q = query(
        collection(contextCompanyA.firestore(), 'sales'),
        where('companyId', '==', 'company-b')
      );
      await assertFails(getDocs(q));
    });
  });

  describe('Escrita cross-tenant (deve ser NEGADA)', () => {
    it('usuario de company A nao pode escrever doc com companyId diferente em products', async () => {
      await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');

      const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
      const docRef = doc(contextCompanyA.firestore(), 'products', 'product-cross');
      await assertFails(
        setDoc(docRef, {
          name: 'Produto Cross',
          companyId: 'company-b',
        })
      );
    });

    it('usuario de company A nao pode atualizar doc de company B em sales', async () => {
      await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');
      await semeiaUserDoc('user-b', 'user-b@test.com', 'company-b', 'owner');

      const contextCompanyB = autenticarComo('user-b', 'user-b@test.com');
      const docRef = doc(contextCompanyB.firestore(), 'sales', 'sale-001');
      await setDoc(docRef, {
        total: 100,
        companyId: 'company-b',
      });

      const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
      const updateRef = doc(contextCompanyA.firestore(), 'sales', 'sale-001');
      await assertFails(updateDoc(updateRef, { total: 200 }));
    });
  });

  describe('Leitura same-tenant (deve ser PERMITIDA)', () => {
    it('usuario de company A pode ler doc de company A em products', async () => {
      await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');

      const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
      const docRef = doc(contextCompanyA.firestore(), 'products', 'product-001');
      await assertSucceeds(
        setDoc(docRef, {
          name: 'Produto A',
          companyId: 'company-a',
        })
      );

      const readRef = doc(contextCompanyA.firestore(), 'products', 'product-001');
      const result = await assertSucceeds(getDoc(readRef));
      expect(result.exists()).toBe(true);
    });

    it('usuario de company A pode fazer query com docs de sua company em sales', async () => {
      await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');

      const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
      const docRef = doc(contextCompanyA.firestore(), 'sales', 'sale-001');
      await setDoc(docRef, {
        total: 100,
        companyId: 'company-a',
      });

      const q = query(
        collection(contextCompanyA.firestore(), 'sales'),
        where('companyId', '==', 'company-a')
      );
      const result = await assertSucceeds(getDocs(q));
      expect(result.size).toBe(1);
    });
  });

  describe('Escrita same-tenant (deve ser PERMITIDA)', () => {
    it('usuario de company A pode criar doc em products com seu companyId', async () => {
      await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');

      const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
      const docRef = doc(contextCompanyA.firestore(), 'products', 'product-001');
      await assertSucceeds(
        setDoc(docRef, {
          name: 'Produto A',
          companyId: 'company-a',
        })
      );
    });

    it('usuario de company A pode atualizar doc de company A em sales', async () => {
      await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');

      const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
      const docRef = doc(contextCompanyA.firestore(), 'sales', 'sale-001');
      await setDoc(docRef, {
        total: 100,
        companyId: 'company-a',
      });

      const updateRef = doc(contextCompanyA.firestore(), 'sales', 'sale-001');
      await assertSucceeds(updateDoc(updateRef, { total: 200 }));
    });
  });

  describe('Escrita em users/ (deve ser SEMPRE NEGADA)', () => {
    it('usuario nao pode escrever em seu proprio users/{uid}', async () => {
      await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');

      const contextUser = autenticarComo('user-a', 'user-a@test.com');
      const userRef = doc(contextUser.firestore(), 'users', 'user-a');
      await assertFails(
        setDoc(userRef, {
          uid: 'user-a',
          email: 'user-a@test.com',
          companyId: 'company-a',
          role: 'owner',
          createdAt: Timestamp.now(),
        })
      );
    });

    it('usuario nao pode atualizar seu proprio users/{uid}', async () => {
      await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');

      const contextUser = autenticarComo('user-a', 'user-a@test.com');
      const userRef = doc(contextUser.firestore(), 'users', 'user-a');
      await assertFails(updateDoc(userRef, { role: 'admin' }));
    });

    it('usuario nao pode escrever em users/{uid} de outro usuario', async () => {
      await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');
      await semeiaUserDoc('user-b', 'user-b@test.com', 'company-a', 'employee');

      const contextUserA = autenticarComo('user-a', 'user-a@test.com');
      const userRef = doc(contextUserA.firestore(), 'users', 'user-b');
      await assertFails(
        setDoc(userRef, {
          uid: 'user-b',
          email: 'user-b@test.com',
          companyId: 'company-a',
          role: 'admin',
          createdAt: Timestamp.now(),
        })
      );
    });
  });

  describe('Leitura companies/ (deve ser restrita ao tenant)', () => {
    it('usuario de company A nao pode ler doc de company B em companies', async () => {
      await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');
      await semeiaUserDoc('user-b', 'user-b@test.com', 'company-b', 'owner');

      const contextCompanyB = autenticarComo('user-b', 'user-b@test.com');
      const companyBRef = doc(contextCompanyB.firestore(), 'companies', 'company-b');
      await setDoc(companyBRef, {
        id: 'company-b',
        name: 'Company B',
        plan: 'pro',
        status: 'active',
      });

      const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
      const readRef = doc(contextCompanyA.firestore(), 'companies', 'company-b');
      await assertFails(getDoc(readRef));
    });

    it('usuario de company A pode ler doc de company A em companies', async () => {
      await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');

      const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
      const companyARef = doc(contextCompanyA.firestore(), 'companies', 'company-a');
      await setDoc(companyARef, {
        id: 'company-a',
        name: 'Company A',
        plan: 'pro',
        status: 'active',
      });

      const readRef = doc(contextCompanyA.firestore(), 'companies', 'company-a');
      const result = await assertSucceeds(getDoc(readRef));
      expect(result.exists()).toBe(true);
    });
  });

  describe('Cobertura de 8 colecoes operacionais - same-tenant write permitido', () => {
    const collections = [
      'sales',
      'comandas',
      'orders',
      'bills',
      'customers',
      'purchases',
      'purchaseProducts',
      'expenses',
      'expenseCategories',
      'expenseSeries',
    ];

    collections.forEach((collName) => {
      it(`usuario de company A pode escrever em ${collName}`, async () => {
        await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');

        const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
        const docRef = doc(contextCompanyA.firestore(), collName, 'doc-001');
        await assertSucceeds(
          setDoc(docRef, {
            companyId: 'company-a',
          })
        );
      });
    });
  });

  describe('Cobertura de 8 colecoes operacionais - cross-tenant read negado', () => {
    const collections = [
      'sales',
      'comandas',
      'orders',
      'bills',
      'customers',
      'purchases',
      'purchaseProducts',
      'expenses',
      'expenseCategories',
      'expenseSeries',
    ];

    collections.forEach((collName) => {
      it(`usuario de company A nao pode ler doc de company B em ${collName}`, async () => {
        await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');
        await semeiaUserDoc('user-b', 'user-b@test.com', 'company-b', 'owner');

        const contextCompanyB = autenticarComo('user-b', 'user-b@test.com');
        const docRef = doc(contextCompanyB.firestore(), collName, 'doc-001');
        await setDoc(docRef, {
          companyId: 'company-b',
        });

        const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
        const readRef = doc(contextCompanyA.firestore(), collName, 'doc-001');
        await assertFails(getDoc(readRef));
      });
    });
  });

  describe('Contador por empresa (counters/{companyId}) - usado na numeracao sequencial de pedidos', () => {
    it('usuario de company A pode ler e escrever no contador da propria empresa', async () => {
      await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');

      const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
      const counterRef = doc(contextCompanyA.firestore(), 'counters', 'company-a');

      await assertSucceeds(setDoc(counterRef, { nextOrderNumber: 1 }));
      await assertSucceeds(getDoc(counterRef));
      await assertSucceeds(updateDoc(counterRef, { nextOrderNumber: 2 }));
    });

    it('usuario de company A nao pode ler o contador de company B', async () => {
      await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');
      await semeiaUserDoc('user-b', 'user-b@test.com', 'company-b', 'owner');

      const contextCompanyB = autenticarComo('user-b', 'user-b@test.com');
      const counterRefB = doc(contextCompanyB.firestore(), 'counters', 'company-b');
      await setDoc(counterRefB, { nextOrderNumber: 5 });

      const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
      const readRef = doc(contextCompanyA.firestore(), 'counters', 'company-b');
      await assertFails(getDoc(readRef));
    });

    it('usuario de company A nao pode escrever no contador de company B', async () => {
      await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');
      await semeiaUserDoc('user-b', 'user-b@test.com', 'company-b', 'owner');

      const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
      const counterRefB = doc(contextCompanyA.firestore(), 'counters', 'company-b');
      await assertFails(setDoc(counterRefB, { nextOrderNumber: 999 }));
    });
  });

  describe('Super-admin bypass cross-tenant (isSuperAdmin: true)', () => {
    describe('Leitura cross-tenant PERMITIDA pra super-admin', () => {
      it('super-admin pode ler doc de outra empresa em products', async () => {
        await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');
        await semeiaUserDoc('super-admin-1', 'super-admin-1@test.com', 'company-admin', 'owner', true);

        const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
        const docRef = doc(contextCompanyA.firestore(), 'products', 'product-001');
        await setDoc(docRef, { name: 'Produto A', companyId: 'company-a' });

        const contextSuperAdmin = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const readRef = doc(contextSuperAdmin.firestore(), 'products', 'product-001');
        const result = await assertSucceeds(getDoc(readRef));
        expect(result.exists()).toBe(true);
      });

      it('super-admin pode ler doc de outra empresa em sales', async () => {
        await semeiaUserDoc('user-b', 'user-b@test.com', 'company-b', 'owner');
        await semeiaUserDoc('super-admin-1', 'super-admin-1@test.com', 'company-admin', 'owner', true);

        const contextCompanyB = autenticarComo('user-b', 'user-b@test.com');
        const docRef = doc(contextCompanyB.firestore(), 'sales', 'sale-001');
        await setDoc(docRef, { total: 150, companyId: 'company-b' });

        const contextSuperAdmin = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const readRef = doc(contextSuperAdmin.firestore(), 'sales', 'sale-001');
        const result = await assertSucceeds(getDoc(readRef));
        expect(result.exists()).toBe(true);
      });
    });

    describe('Leitura cross-tenant NEGADA pra usuario comum', () => {
      it('usuario comum continua negado cross-tenant mesmo com isSuperAdmin=false explicito em products', async () => {
        await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner', false);
        await semeiaUserDoc('user-b', 'user-b@test.com', 'company-b', 'owner', false);

        const contextCompanyB = autenticarComo('user-b', 'user-b@test.com');
        const docRef = doc(contextCompanyB.firestore(), 'products', 'product-001');
        await setDoc(docRef, { name: 'Produto B', companyId: 'company-b' });

        const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
        const readRef = doc(contextCompanyA.firestore(), 'products', 'product-001');
        await assertFails(getDoc(readRef));
      });

      it('usuario sem isSuperAdmin (undefined) continua negado cross-tenant em sales', async () => {
        await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');
        await semeiaUserDoc('user-b', 'user-b@test.com', 'company-b', 'owner');

        const contextCompanyB = autenticarComo('user-b', 'user-b@test.com');
        const docRef = doc(contextCompanyB.firestore(), 'sales', 'sale-001');
        await setDoc(docRef, { total: 100, companyId: 'company-b' });

        const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
        const readRef = doc(contextCompanyA.firestore(), 'sales', 'sale-001');
        await assertFails(getDoc(readRef));
      });
    });

    describe('Escrita (create) cross-tenant PERMITIDA pra super-admin', () => {
      it('super-admin pode criar doc em products de outra empresa', async () => {
        await semeiaUserDoc('super-admin-1', 'super-admin-1@test.com', 'company-admin', 'owner', true);

        const contextSuperAdmin = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const docRef = doc(contextSuperAdmin.firestore(), 'products', 'product-cross');
        await assertSucceeds(setDoc(docRef, { name: 'Produto cross', companyId: 'company-a' }));
      });

      it('super-admin pode criar doc em sales de outra empresa', async () => {
        await semeiaUserDoc('super-admin-1', 'super-admin-1@test.com', 'company-admin', 'owner', true);

        const contextSuperAdmin = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const docRef = doc(contextSuperAdmin.firestore(), 'sales', 'sale-cross');
        await assertSucceeds(setDoc(docRef, { total: 200, companyId: 'company-b' }));
      });
    });

    describe('Escrita (update) cross-tenant PERMITIDA, MAS companyId e imutavel', () => {
      it('super-admin pode atualizar doc em products de outra empresa', async () => {
        await semeiaUserDoc('user-b', 'user-b@test.com', 'company-b', 'owner');
        await semeiaUserDoc('super-admin-1', 'super-admin-1@test.com', 'company-admin', 'owner', true);

        const contextCompanyB = autenticarComo('user-b', 'user-b@test.com');
        const docRef = doc(contextCompanyB.firestore(), 'products', 'product-001');
        await setDoc(docRef, { name: 'Produto B', companyId: 'company-b' });

        const contextSuperAdmin = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const updateRef = doc(contextSuperAdmin.firestore(), 'products', 'product-001');
        await assertSucceeds(updateDoc(updateRef, { name: 'Produto B editado pelo super-admin' }));
      });

      it('super-admin NAO pode trocar o companyId de um doc no update, mesmo com bypass', async () => {
        await semeiaUserDoc('user-b', 'user-b@test.com', 'company-b', 'owner');
        await semeiaUserDoc('super-admin-1', 'super-admin-1@test.com', 'company-admin', 'owner', true);

        const contextCompanyB = autenticarComo('user-b', 'user-b@test.com');
        const docRef = doc(contextCompanyB.firestore(), 'sales', 'sale-001');
        await setDoc(docRef, { total: 100, companyId: 'company-b' });

        const contextSuperAdmin = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const updateRef = doc(contextSuperAdmin.firestore(), 'sales', 'sale-001');
        await assertFails(updateDoc(updateRef, { companyId: 'company-admin' }));
      });
    });

    describe('Escrita (delete) cross-tenant PERMITIDA pra super-admin', () => {
      it('super-admin pode deletar doc de outra empresa em products', async () => {
        await semeiaUserDoc('user-b', 'user-b@test.com', 'company-b', 'owner');
        await semeiaUserDoc('super-admin-1', 'super-admin-1@test.com', 'company-admin', 'owner', true);

        const contextCompanyB = autenticarComo('user-b', 'user-b@test.com');
        const docRef = doc(contextCompanyB.firestore(), 'products', 'product-001');
        await setDoc(docRef, { name: 'Produto B', companyId: 'company-b' });

        const contextSuperAdmin = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const deleteRef = doc(contextSuperAdmin.firestore(), 'products', 'product-001');
        await assertSucceeds(deleteDoc(deleteRef));
      });
    });

    describe('Leitura users/{uid} cross-usuario PERMITIDA pra super-admin', () => {
      it('super-admin pode ler users/{uid} de outro usuario', async () => {
        await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');
        await semeiaUserDoc('super-admin-1', 'super-admin-1@test.com', 'company-admin', 'owner', true);

        const contextSuperAdmin = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const readRef = doc(contextSuperAdmin.firestore(), 'users', 'user-a');
        const result = await assertSucceeds(getDoc(readRef));
        expect(result.exists()).toBe(true);
      });

      it('usuario comum continua negado ao ler users/{uid} de outro usuario', async () => {
        await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');
        await semeiaUserDoc('user-b', 'user-b@test.com', 'company-b', 'owner');

        const contextUserB = autenticarComo('user-b', 'user-b@test.com');
        const readRef = doc(contextUserB.firestore(), 'users', 'user-a');
        await assertFails(getDoc(readRef));
      });
    });

    describe('Leitura companies/{companyId} cross-empresa PERMITIDA pra super-admin', () => {
      it('super-admin pode ler companies/{companyId} de outra empresa', async () => {
        await semeiaUserDoc('user-b', 'user-b@test.com', 'company-b', 'owner');
        await semeiaUserDoc('super-admin-1', 'super-admin-1@test.com', 'company-admin', 'owner', true);

        const contextCompanyB = autenticarComo('user-b', 'user-b@test.com');
        const companyBRef = doc(contextCompanyB.firestore(), 'companies', 'company-b');
        await setDoc(companyBRef, { name: 'Empresa B', plan: 'trial', status: 'active' });

        const contextSuperAdmin = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const readRef = doc(contextSuperAdmin.firestore(), 'companies', 'company-b');
        const result = await assertSucceeds(getDoc(readRef));
        expect(result.exists()).toBe(true);
      });

      it('usuario comum continua negado ao ler companies/{companyId} de outra empresa', async () => {
        await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');
        await semeiaUserDoc('user-b', 'user-b@test.com', 'company-b', 'owner');

        const contextCompanyB = autenticarComo('user-b', 'user-b@test.com');
        const companyBRef = doc(contextCompanyB.firestore(), 'companies', 'company-b');
        await setDoc(companyBRef, { name: 'Empresa B', plan: 'trial', status: 'active' });

        const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
        const readRef = doc(contextCompanyA.firestore(), 'companies', 'company-b');
        await assertFails(getDoc(readRef));
      });
    });

    describe('Atualizacao (update) companies/{companyId} cross-empresa', () => {
      it('super-admin pode atualizar companies/{companyId} de outra empresa', async () => {
        await semeiaUserDoc('user-b', 'user-b@test.com', 'company-b', 'owner');
        await semeiaUserDoc('super-admin-1', 'super-admin-1@test.com', 'company-admin', 'owner', true);

        const contextCompanyB = autenticarComo('user-b', 'user-b@test.com');
        const companyBRef = doc(contextCompanyB.firestore(), 'companies', 'company-b');
        await setDoc(companyBRef, {
          id: 'company-b',
          name: 'Company B',
          plan: 'trial',
          status: 'active',
        });

        const contextSuperAdmin = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const updateRef = doc(contextSuperAdmin.firestore(), 'companies', 'company-b');
        await assertSucceeds(updateDoc(updateRef, { plan: 'pro' }));
      });

      it('usuario comum continua negado ao atualizar companies/{companyId} de outra empresa', async () => {
        await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');
        await semeiaUserDoc('user-b', 'user-b@test.com', 'company-b', 'owner');

        const contextCompanyB = autenticarComo('user-b', 'user-b@test.com');
        const companyBRef = doc(contextCompanyB.firestore(), 'companies', 'company-b');
        await setDoc(companyBRef, {
          id: 'company-b',
          name: 'Company B',
          plan: 'trial',
          status: 'active',
        });

        const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
        const updateRef = doc(contextCompanyA.firestore(), 'companies', 'company-b');
        await assertFails(updateDoc(updateRef, { plan: 'pro' }));
      });

      it('owner/admin da propria empresa consegue atualizar sua propria companies/{companyId}', async () => {
        await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');

        const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
        const companyARef = doc(contextCompanyA.firestore(), 'companies', 'company-a');
        await setDoc(companyARef, {
          id: 'company-a',
          name: 'Company A',
          plan: 'trial',
          status: 'active',
        });

        const updateRef = doc(contextCompanyA.firestore(), 'companies', 'company-a');
        await assertSucceeds(updateDoc(updateRef, { plan: 'pro' }));
      });
    });
  });

  describe('Cobertura de colecao vendedores - operacional multi-tenant', () => {
    describe('Leitura cross-tenant vendedores (deve ser NEGADA)', () => {
      it('usuario de company A nao pode ler doc de company B em vendedores', async () => {
        await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');
        await semeiaUserDoc('user-b', 'user-b@test.com', 'company-b', 'owner');

        const contextCompanyB = autenticarComo('user-b', 'user-b@test.com');
        const docRef = doc(contextCompanyB.firestore(), 'vendedores', 'vendedor-001');
        await setDoc(docRef, {
          name: 'Vendedor B',
          companyId: 'company-b',
          comissoes: [],
        });

        const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
        const readRef = doc(contextCompanyA.firestore(), 'vendedores', 'vendedor-001');
        await assertFails(getDoc(readRef));
      });
    });

    describe('Escrita cross-tenant vendedores (deve ser NEGADA)', () => {
      it('usuario de company A nao pode escrever doc com companyId diferente em vendedores', async () => {
        await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');

        const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
        const docRef = doc(contextCompanyA.firestore(), 'vendedores', 'vendedor-cross');
        await assertFails(
          setDoc(docRef, {
            name: 'Vendedor Cross',
            companyId: 'company-b',
            comissoes: [],
          })
        );
      });
    });

    describe('Leitura same-tenant vendedores (deve ser PERMITIDA)', () => {
      it('usuario de company A pode ler doc de company A em vendedores', async () => {
        await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');

        const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
        const docRef = doc(contextCompanyA.firestore(), 'vendedores', 'vendedor-001');
        await assertSucceeds(
          setDoc(docRef, {
            name: 'Vendedor A',
            companyId: 'company-a',
            comissoes: [],
          })
        );

        const readRef = doc(contextCompanyA.firestore(), 'vendedores', 'vendedor-001');
        const result = await assertSucceeds(getDoc(readRef));
        expect(result.exists()).toBe(true);
      });
    });

    describe('Escrita same-tenant vendedores (deve ser PERMITIDA)', () => {
      it('usuario de company A pode criar doc em vendedores com seu companyId', async () => {
        await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');

        const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
        const docRef = doc(contextCompanyA.firestore(), 'vendedores', 'vendedor-001');
        await assertSucceeds(
          setDoc(docRef, {
            name: 'Vendedor A',
            companyId: 'company-a',
            comissoes: [],
          })
        );
      });

      it('usuario de company A pode atualizar doc de company A em vendedores', async () => {
        await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');

        const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
        const docRef = doc(contextCompanyA.firestore(), 'vendedores', 'vendedor-001');
        await setDoc(docRef, {
          name: 'Vendedor A',
          companyId: 'company-a',
          comissoes: [],
        });

        const updateRef = doc(contextCompanyA.firestore(), 'vendedores', 'vendedor-001');
        await assertSucceeds(updateDoc(updateRef, { name: 'Vendedor A Atualizado' }));
      });
    });
  });

  describe('Colecoes de Despesas (expenses, expenseCategories, expenseSeries) - operacionais multi-tenant', () => {
    const colecoesDespesas = ['expenses', 'expenseCategories', 'expenseSeries'];

    const payloadPorColecao: Record<string, (companyId: string) => Record<string, any>> = {
      expenses: (companyId) => ({
        description: 'Aluguel',
        value: 1500,
        categoryId: `${companyId}_aluguel`,
        dueDate: '2026-10-10',
        status: 'a_pagar',
        origin: 'manual',
        companyId,
      }),
      expenseCategories: (companyId) => ({
        name: 'Aluguel',
        type: 'despesa_operacional',
        archived: false,
        companyId,
      }),
      expenseSeries: (companyId) => ({
        active: true,
        period: 'mensal',
        anchorDate: '2026-10-10',
        template: {
          description: 'Internet',
          value: 120,
          categoryId: `${companyId}_internet_telefone`,
        },
        companyId,
      }),
    };

    const campoAtualizavelPorColecao: Record<string, Record<string, any>> = {
      expenses: { status: 'pago', paidDate: '2026-10-12' },
      expenseCategories: { archived: true },
      expenseSeries: { active: false },
    };

    const semeiaDocSemRegras = async (collName: string, docId: string, data: Record<string, any>) => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), collName, docId), data);
      });
    };

    colecoesDespesas.forEach((collName) => {
      describe(`Colecao ${collName}`, () => {
        it(`owner de company A pode criar, ler, atualizar e excluir doc da propria empresa em ${collName}`, async () => {
          await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');

          const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
          const docRef = doc(contextCompanyA.firestore(), collName, 'doc-001');
          await assertSucceeds(setDoc(docRef, payloadPorColecao[collName]('company-a')));
          await assertSucceeds(getDoc(docRef));
          await assertSucceeds(updateDoc(docRef, campoAtualizavelPorColecao[collName]));
          await assertSucceeds(deleteDoc(docRef));
        });

        it(`usuario de company A lista em ${collName} apenas docs da propria empresa`, async () => {
          await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');
          await semeiaDocSemRegras(collName, 'doc-a', payloadPorColecao[collName]('company-a'));
          await semeiaDocSemRegras(collName, 'doc-b', payloadPorColecao[collName]('company-b'));

          const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
          const q = query(
            collection(contextCompanyA.firestore(), collName),
            where('companyId', '==', 'company-a')
          );
          const result = await assertSucceeds(getDocs(q));
          expect(result.size).toBe(1);
        });

        it(`usuario de company A nao pode criar doc com companyId de company B em ${collName}`, async () => {
          await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');

          const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
          const docRef = doc(contextCompanyA.firestore(), collName, 'doc-cross');
          await assertFails(setDoc(docRef, payloadPorColecao[collName]('company-b')));
        });

        it(`usuario de company A nao pode ler doc de company B em ${collName}`, async () => {
          await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');
          await semeiaDocSemRegras(collName, 'doc-001', payloadPorColecao[collName]('company-b'));

          const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
          const readRef = doc(contextCompanyA.firestore(), collName, 'doc-001');
          await assertFails(getDoc(readRef));
        });

        it(`usuario de company A nao pode listar docs de company B em ${collName}`, async () => {
          await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');
          await semeiaDocSemRegras(collName, 'doc-001', payloadPorColecao[collName]('company-b'));

          const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
          const q = query(
            collection(contextCompanyA.firestore(), collName),
            where('companyId', '==', 'company-b')
          );
          await assertFails(getDocs(q));
        });

        it(`usuario de company A nao pode atualizar doc de company B em ${collName}`, async () => {
          await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');
          await semeiaDocSemRegras(collName, 'doc-001', payloadPorColecao[collName]('company-b'));

          const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
          const updateRef = doc(contextCompanyA.firestore(), collName, 'doc-001');
          await assertFails(updateDoc(updateRef, campoAtualizavelPorColecao[collName]));
        });

        it(`usuario de company A nao pode excluir doc de company B em ${collName}`, async () => {
          await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');
          await semeiaDocSemRegras(collName, 'doc-001', payloadPorColecao[collName]('company-b'));

          const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
          const deleteRef = doc(contextCompanyA.firestore(), collName, 'doc-001');
          await assertFails(deleteDoc(deleteRef));
        });

        it(`owner de company A nao pode trocar companyId de doc existente em ${collName}`, async () => {
          await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');
          await semeiaDocSemRegras(collName, 'doc-001', payloadPorColecao[collName]('company-a'));

          const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
          const updateRef = doc(contextCompanyA.firestore(), collName, 'doc-001');
          await assertFails(updateDoc(updateRef, { companyId: 'company-b' }));
        });

        it(`usuario anonimo (sem auth) nao pode ler doc em ${collName}`, async () => {
          await semeiaDocSemRegras(collName, 'doc-001', payloadPorColecao[collName]('company-a'));

          const anonimo = testEnv.unauthenticatedContext();
          const readRef = doc(anonimo.firestore(), collName, 'doc-001');
          await assertFails(getDoc(readRef));
        });

        it(`usuario anonimo (sem auth) nao pode criar doc em ${collName}`, async () => {
          const anonimo = testEnv.unauthenticatedContext();
          const docRef = doc(anonimo.firestore(), collName, 'doc-anon');
          await assertFails(setDoc(docRef, payloadPorColecao[collName]('company-a')));
        });

        it(`usuario anonimo (sem auth) nao pode atualizar doc em ${collName}`, async () => {
          await semeiaDocSemRegras(collName, 'doc-001', payloadPorColecao[collName]('company-a'));

          const anonimo = testEnv.unauthenticatedContext();
          const updateRef = doc(anonimo.firestore(), collName, 'doc-001');
          await assertFails(updateDoc(updateRef, campoAtualizavelPorColecao[collName]));
        });

        it(`usuario anonimo (sem auth) nao pode excluir doc em ${collName}`, async () => {
          await semeiaDocSemRegras(collName, 'doc-001', payloadPorColecao[collName]('company-a'));

          const anonimo = testEnv.unauthenticatedContext();
          const deleteRef = doc(anonimo.firestore(), collName, 'doc-001');
          await assertFails(deleteDoc(deleteRef));
        });

        it(`super-admin pode ler, criar, atualizar e excluir doc de outra empresa em ${collName}`, async () => {
          await semeiaUserDoc('user-b', 'user-b@test.com', 'company-b', 'owner');
          await semeiaUserDoc('super-admin-1', 'super-admin-1@test.com', 'company-admin', 'owner', true);
          await semeiaDocSemRegras(collName, 'doc-001', payloadPorColecao[collName]('company-b'));

          const contextSuperAdmin = autenticarComo('super-admin-1', 'super-admin-1@test.com');
          const docRef = doc(contextSuperAdmin.firestore(), collName, 'doc-001');
          const lido = await assertSucceeds(getDoc(docRef));
          expect(lido.exists()).toBe(true);

          const docNovo = doc(contextSuperAdmin.firestore(), collName, 'doc-cross');
          await assertSucceeds(setDoc(docNovo, payloadPorColecao[collName]('company-b')));
          await assertSucceeds(updateDoc(docRef, campoAtualizavelPorColecao[collName]));
          await assertSucceeds(deleteDoc(docRef));
        });

        it(`super-admin nao pode trocar companyId de doc existente em ${collName}, mesmo com bypass`, async () => {
          await semeiaUserDoc('super-admin-1', 'super-admin-1@test.com', 'company-admin', 'owner', true);
          await semeiaDocSemRegras(collName, 'doc-001', payloadPorColecao[collName]('company-b'));

          const contextSuperAdmin = autenticarComo('super-admin-1', 'super-admin-1@test.com');
          const updateRef = doc(contextSuperAdmin.firestore(), collName, 'doc-001');
          await assertFails(updateDoc(updateRef, { companyId: 'company-admin' }));
        });
      });
    });
  });

  describe('Cobertura de colecao recurringOrders - operacional multi-tenant', () => {
    // Seed feito com regras desabilitadas para que o cenario de leitura/escrita
    // cross-tenant seja avaliado pelas regras, nao pelo proprio seed.
    const semeiaRecurringOrder = async (docId: string, companyId: string) => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'recurringOrders', docId), {
          companyId,
          status: 'active',
          createdAt: Timestamp.now(),
        });
      });
    };

    describe('Escrita same-tenant recurringOrders (deve ser PERMITIDA)', () => {
      it('usuario de company A pode criar doc em recurringOrders com seu companyId', async () => {
        await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');

        const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
        const docRef = doc(contextCompanyA.firestore(), 'recurringOrders', 'recurring-001');
        await assertSucceeds(
          setDoc(docRef, {
            companyId: 'company-a',
            status: 'active',
          })
        );
      });

      it('usuario de company A pode atualizar doc de company A em recurringOrders', async () => {
        await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');
        await semeiaRecurringOrder('recurring-001', 'company-a');

        const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
        const updateRef = doc(contextCompanyA.firestore(), 'recurringOrders', 'recurring-001');
        await assertSucceeds(updateDoc(updateRef, { status: 'paused' }));
      });

      it('usuario de company A pode deletar doc de company A em recurringOrders', async () => {
        await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');
        await semeiaRecurringOrder('recurring-001', 'company-a');

        const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
        const deleteRef = doc(contextCompanyA.firestore(), 'recurringOrders', 'recurring-001');
        await assertSucceeds(deleteDoc(deleteRef));
      });
    });

    describe('Leitura same-tenant recurringOrders (deve ser PERMITIDA)', () => {
      it('usuario de company A pode ler doc de company A em recurringOrders', async () => {
        await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');
        await semeiaRecurringOrder('recurring-001', 'company-a');

        const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
        const readRef = doc(contextCompanyA.firestore(), 'recurringOrders', 'recurring-001');
        const result = await assertSucceeds(getDoc(readRef));
        expect(result.exists()).toBe(true);
      });

      it('usuario de company A pode fazer query com docs de sua company em recurringOrders', async () => {
        await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');
        await semeiaRecurringOrder('recurring-001', 'company-a');

        const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
        const q = query(
          collection(contextCompanyA.firestore(), 'recurringOrders'),
          where('companyId', '==', 'company-a')
        );
        const result = await assertSucceeds(getDocs(q));
        expect(result.size).toBe(1);
      });
    });

    describe('Cross-tenant recurringOrders (deve ser NEGADO)', () => {
      it('usuario de company A nao pode ler doc de company B em recurringOrders', async () => {
        await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');
        await semeiaRecurringOrder('recurring-b', 'company-b');

        const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
        const readRef = doc(contextCompanyA.firestore(), 'recurringOrders', 'recurring-b');
        await assertFails(getDoc(readRef));
      });

      it('usuario de company A nao pode criar doc com companyId de company B em recurringOrders', async () => {
        await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');

        const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
        const docRef = doc(contextCompanyA.firestore(), 'recurringOrders', 'recurring-cross');
        await assertFails(
          setDoc(docRef, {
            companyId: 'company-b',
            status: 'active',
          })
        );
      });

      it('usuario de company A nao pode atualizar doc de company B em recurringOrders', async () => {
        await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');
        await semeiaRecurringOrder('recurring-b', 'company-b');

        const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
        const updateRef = doc(contextCompanyA.firestore(), 'recurringOrders', 'recurring-b');
        await assertFails(updateDoc(updateRef, { status: 'paused' }));
      });

      it('usuario de company A nao pode deletar doc de company B em recurringOrders', async () => {
        await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');
        await semeiaRecurringOrder('recurring-b', 'company-b');

        const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
        const deleteRef = doc(contextCompanyA.firestore(), 'recurringOrders', 'recurring-b');
        await assertFails(deleteDoc(deleteRef));
      });
    });

    describe('Imutabilidade do companyId em recurringOrders (deve ser NEGADA)', () => {
      it('usuario de company A nao pode trocar o companyId do proprio doc em recurringOrders', async () => {
        await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');
        await semeiaRecurringOrder('recurring-001', 'company-a');

        const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
        const updateRef = doc(contextCompanyA.firestore(), 'recurringOrders', 'recurring-001');
        await assertFails(updateDoc(updateRef, { companyId: 'company-b' }));
      });
    });

    describe('Super-admin em recurringOrders (mesmo padrao das colecoes operacionais)', () => {
      it('super-admin pode ler doc de outra empresa em recurringOrders', async () => {
        await semeiaUserDoc('super-admin-1', 'super-admin-1@test.com', 'company-admin', 'owner', true);
        await semeiaRecurringOrder('recurring-b', 'company-b');

        const contextSuperAdmin = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const readRef = doc(contextSuperAdmin.firestore(), 'recurringOrders', 'recurring-b');
        const result = await assertSucceeds(getDoc(readRef));
        expect(result.exists()).toBe(true);
      });

      it('super-admin pode criar doc em recurringOrders de outra empresa', async () => {
        await semeiaUserDoc('super-admin-1', 'super-admin-1@test.com', 'company-admin', 'owner', true);

        const contextSuperAdmin = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const docRef = doc(contextSuperAdmin.firestore(), 'recurringOrders', 'recurring-cross');
        await assertSucceeds(setDoc(docRef, { companyId: 'company-b', status: 'active' }));
      });

      it('super-admin pode atualizar doc de outra empresa em recurringOrders', async () => {
        await semeiaUserDoc('super-admin-1', 'super-admin-1@test.com', 'company-admin', 'owner', true);
        await semeiaRecurringOrder('recurring-b', 'company-b');

        const contextSuperAdmin = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const updateRef = doc(contextSuperAdmin.firestore(), 'recurringOrders', 'recurring-b');
        await assertSucceeds(updateDoc(updateRef, { status: 'paused' }));
      });

      it('super-admin pode deletar doc de outra empresa em recurringOrders', async () => {
        await semeiaUserDoc('super-admin-1', 'super-admin-1@test.com', 'company-admin', 'owner', true);
        await semeiaRecurringOrder('recurring-b', 'company-b');

        const contextSuperAdmin = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const deleteRef = doc(contextSuperAdmin.firestore(), 'recurringOrders', 'recurring-b');
        await assertSucceeds(deleteDoc(deleteRef));
      });

      it('super-admin NAO pode trocar o companyId de um doc em recurringOrders no update', async () => {
        await semeiaUserDoc('super-admin-1', 'super-admin-1@test.com', 'company-admin', 'owner', true);
        await semeiaRecurringOrder('recurring-b', 'company-b');

        const contextSuperAdmin = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const updateRef = doc(contextSuperAdmin.firestore(), 'recurringOrders', 'recurring-b');
        await assertFails(updateDoc(updateRef, { companyId: 'company-admin' }));
      });

      it('usuario comum (isSuperAdmin false) continua negado ao ler doc de outra empresa em recurringOrders', async () => {
        await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner', false);
        await semeiaRecurringOrder('recurring-b', 'company-b');

        const contextCompanyA = autenticarComo('user-a', 'user-a@test.com');
        const readRef = doc(contextCompanyA.firestore(), 'recurringOrders', 'recurring-b');
        await assertFails(getDoc(readRef));
      });
    });
  });

  describe('Mensalidade da plataforma - subscriptions e subscriptionCharges (regra 14)', () => {
    const papeisEmpresa = ['owner', 'admin', 'employee'];

    const dadosCobranca = (
      companyId: string,
      competence: string,
      overrides: Record<string, unknown> = {},
    ) => ({
      companyId,
      competence,
      dueDate: `${competence}-10`,
      amount: 150,
      status: 'a_pagar',
      paidDate: null,
      paidAmount: null,
      createdAt: Timestamp.now(),
      ...overrides,
    });

    // Seed feito com regras desabilitadas: o cenario avaliado e o da regra, nao o do seed.
    const semeiaCobranca = async (docId: string, dados: Record<string, unknown>) => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'subscriptionCharges', docId), dados);
      });
    };

    const semeiaSubscription = async (companyId: string) => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'subscriptions', companyId), {
          companyId,
          amount: 150,
          dueDay: 10,
          active: true,
          contractStart: '2026-01-01',
          generateFrom: '2026-01',
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      });
    };

    const semeiaSuperAdmin = () =>
      semeiaUserDoc('super-admin-1', 'super-admin-1@test.com', 'company-admin', 'owner', true);

    papeisEmpresa.forEach((role) => {
      describe(`Empresa com role ${role} (deve ser NEGADO)`, () => {
        it('nao le subscriptions, nem o doc da propria empresa', async () => {
          await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', role);
          await semeiaSubscription('company-a');

          const ctx = autenticarComo('user-a', 'user-a@test.com');
          await assertFails(getDoc(doc(ctx.firestore(), 'subscriptions', 'company-a')));
        });

        it('nao escreve subscriptions da propria empresa', async () => {
          await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', role);
          await semeiaSubscription('company-a');

          const ctx = autenticarComo('user-a', 'user-a@test.com');
          const ref = doc(ctx.firestore(), 'subscriptions', 'company-a');
          await assertFails(setDoc(ref, { companyId: 'company-a', amount: 1, dueDay: 1 }));
          await assertFails(updateDoc(ref, { amount: 1 }));
        });

        it('nao cria cobranca da propria empresa', async () => {
          await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', role);

          const ctx = autenticarComo('user-a', 'user-a@test.com');
          const ref = doc(ctx.firestore(), 'subscriptionCharges', 'company-a_202611');
          await assertFails(setDoc(ref, dadosCobranca('company-a', '2026-11')));
        });

        it('nao atualiza cobranca da propria empresa', async () => {
          await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', role);
          await semeiaCobranca('company-a_202611', dadosCobranca('company-a', '2026-11'));

          const ctx = autenticarComo('user-a', 'user-a@test.com');
          const ref = doc(ctx.firestore(), 'subscriptionCharges', 'company-a_202611');
          await assertFails(
            updateDoc(ref, { status: 'pago', paidDate: '2026-11-05', paidAmount: 150 }),
          );
        });

        it('nao apaga cobranca da propria empresa', async () => {
          await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', role);
          await semeiaCobranca('company-a_202611', dadosCobranca('company-a', '2026-11'));

          const ctx = autenticarComo('user-a', 'user-a@test.com');
          const ref = doc(ctx.firestore(), 'subscriptionCharges', 'company-a_202611');
          await assertFails(deleteDoc(ref));
        });

        it('nao le cobranca de outra empresa (get)', async () => {
          await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', role);
          await semeiaCobranca('company-b_202611', dadosCobranca('company-b', '2026-11'));

          const ctx = autenticarComo('user-a', 'user-a@test.com');
          const ref = doc(ctx.firestore(), 'subscriptionCharges', 'company-b_202611');
          await assertFails(getDoc(ref));
        });

        it('nao lista cobrancas de outra empresa (query where companyId == B)', async () => {
          await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', role);
          await semeiaCobranca('company-b_202611', dadosCobranca('company-b', '2026-11'));

          const ctx = autenticarComo('user-a', 'user-a@test.com');
          const q = query(
            collection(ctx.firestore(), 'subscriptionCharges'),
            where('companyId', '==', 'company-b'),
          );
          await assertFails(getDocs(q));
        });

        it('nao lista cobrancas sem filtro de companyId', async () => {
          await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', role);
          await semeiaCobranca('company-a_202611', dadosCobranca('company-a', '2026-11'));
          await semeiaCobranca('company-b_202611', dadosCobranca('company-b', '2026-11'));

          const ctx = autenticarComo('user-a', 'user-a@test.com');
          const q = collection(ctx.firestore(), 'subscriptionCharges');
          await assertFails(getDocs(q));
        });
      });

      describe(`Empresa com role ${role} le a propria cobranca (deve ser PERMITIDO)`, () => {
        it('le cobranca do proprio companyId (get)', async () => {
          await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', role);
          await semeiaCobranca('company-a_202611', dadosCobranca('company-a', '2026-11'));

          const ctx = autenticarComo('user-a', 'user-a@test.com');
          const ref = doc(ctx.firestore(), 'subscriptionCharges', 'company-a_202611');
          const result = await assertSucceeds(getDoc(ref));
          expect(result.exists()).toBe(true);
        });

        it('lista cobrancas do proprio companyId com where companyId e status a_pagar (query)', async () => {
          await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', role);
          await semeiaCobranca('company-a_202611', dadosCobranca('company-a', '2026-11'));

          const ctx = autenticarComo('user-a', 'user-a@test.com');
          const q = query(
            collection(ctx.firestore(), 'subscriptionCharges'),
            where('companyId', '==', 'company-a'),
            where('status', '==', 'a_pagar'),
          );
          const result = await assertSucceeds(getDocs(q));
          expect(result.size).toBe(1);
        });
      });
    });

    describe('Owner com companyId igual ao da cobranca (deve ser NEGADO - bypass generico nao vale)', () => {
      it('owner da propria empresa nao cria, atualiza nem apaga cobranca do proprio companyId', async () => {
        await semeiaUserDoc('user-a', 'user-a@test.com', 'company-a', 'owner');
        await semeiaCobranca('company-a_202611', dadosCobranca('company-a', '2026-11'));

        const ctx = autenticarComo('user-a', 'user-a@test.com');
        await assertFails(
          setDoc(
            doc(ctx.firestore(), 'subscriptionCharges', 'company-a_202612'),
            dadosCobranca('company-a', '2026-12'),
          ),
        );
        const ref = doc(ctx.firestore(), 'subscriptionCharges', 'company-a_202611');
        await assertFails(
          updateDoc(ref, { status: 'pago', paidDate: '2026-11-05', paidAmount: 150 }),
        );
        await assertFails(deleteDoc(ref));
      });
    });

    describe('Super-admin - leitura (deve ser PERMITIDA)', () => {
      it('le subscriptions de qualquer empresa (get)', async () => {
        await semeiaSuperAdmin();
        await semeiaSubscription('company-b');

        const ctx = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const result = await assertSucceeds(
          getDoc(doc(ctx.firestore(), 'subscriptions', 'company-b')),
        );
        expect(result.exists()).toBe(true);
      });

      it('le cobranca de qualquer empresa (get)', async () => {
        await semeiaSuperAdmin();
        await semeiaCobranca('company-b_202611', dadosCobranca('company-b', '2026-11'));

        const ctx = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const ref = doc(ctx.firestore(), 'subscriptionCharges', 'company-b_202611');
        const result = await assertSucceeds(getDoc(ref));
        expect(result.exists()).toBe(true);
      });

      it('lista cobrancas de qualquer empresa (query where companyId == B)', async () => {
        await semeiaSuperAdmin();
        await semeiaCobranca('company-b_202611', dadosCobranca('company-b', '2026-11'));

        const ctx = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const q = query(
          collection(ctx.firestore(), 'subscriptionCharges'),
          where('companyId', '==', 'company-b'),
        );
        const result = await assertSucceeds(getDocs(q));
        expect(result.size).toBe(1);
      });

      it('getDoc de cobranca inexistente nao falha para super-admin', async () => {
        await semeiaSuperAdmin();

        const ctx = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const ref = doc(ctx.firestore(), 'subscriptionCharges', 'company-b_202611');
        const result = await assertSucceeds(getDoc(ref));
        expect(result.exists()).toBe(false);
      });
    });

    describe('Super-admin - subscriptions (escrita permitida, delete negado)', () => {
      it('cria subscriptions de empresa (setDoc) (deve ser PERMITIDO)', async () => {
        await semeiaSuperAdmin();

        const ctx = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const ref = doc(ctx.firestore(), 'subscriptions', 'company-b');
        await assertSucceeds(
          setDoc(ref, {
            companyId: 'company-b',
            amount: 150,
            dueDay: 10,
            active: true,
            contractStart: '2026-01-01',
            generateFrom: '2026-01',
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          }),
        );
      });

      it('atualiza subscriptions de empresa (updateDoc amount) (deve ser PERMITIDO)', async () => {
        await semeiaSuperAdmin();
        await semeiaSubscription('company-b');

        const ctx = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const ref = doc(ctx.firestore(), 'subscriptions', 'company-b');
        await assertSucceeds(updateDoc(ref, { amount: 200 }));
      });

      it('nao apaga subscriptions (deleteDoc) (deve ser NEGADO)', async () => {
        await semeiaSuperAdmin();
        await semeiaSubscription('company-b');

        const ctx = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const ref = doc(ctx.firestore(), 'subscriptions', 'company-b');
        await assertFails(deleteDoc(ref));
      });

      it('cria subscriptions com companyId diferente do id do documento (deve ser NEGADO)', async () => {
        await semeiaSuperAdmin();

        const ctx = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const ref = doc(ctx.firestore(), 'subscriptions', 'company-b');
        await assertFails(
          setDoc(ref, {
            companyId: 'company-a',
            amount: 150,
            dueDay: 10,
            active: true,
            contractStart: '2026-01-01',
            generateFrom: '2026-01',
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          }),
        );
      });

      it('atualiza subscriptions trocando companyId para outra empresa (deve ser NEGADO)', async () => {
        await semeiaSuperAdmin();
        await semeiaSubscription('company-b');

        const ctx = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const ref = doc(ctx.firestore(), 'subscriptions', 'company-b');
        await assertFails(updateDoc(ref, { companyId: 'company-a' }));
      });

      it('atualiza subscriptions mantendo companyId igual ao id do documento (deve ser PERMITIDO)', async () => {
        await semeiaSuperAdmin();
        await semeiaSubscription('company-b');

        const ctx = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const ref = doc(ctx.firestore(), 'subscriptions', 'company-b');
        await assertSucceeds(updateDoc(ref, { companyId: 'company-b', amount: 200 }));
      });
    });

    describe('Super-admin - criacao de subscriptionCharges', () => {
      it('cria cobranca com id companyId_yyyyMM coerente e status a_pagar (deve ser PERMITIDO)', async () => {
        await semeiaSuperAdmin();

        const ctx = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const ref = doc(ctx.firestore(), 'subscriptionCharges', 'company-b_202611');
        await assertSucceeds(setDoc(ref, dadosCobranca('company-b', '2026-11')));
      });

      it('nao cria cobranca com id divergente do companyId (deve ser NEGADO)', async () => {
        await semeiaSuperAdmin();

        const ctx = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const ref = doc(ctx.firestore(), 'subscriptionCharges', 'company-x_202611');
        await assertFails(setDoc(ref, dadosCobranca('company-b', '2026-11')));
      });

      it('nao cria cobranca com id divergente da competence (deve ser NEGADO)', async () => {
        await semeiaSuperAdmin();

        const ctx = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const ref = doc(ctx.firestore(), 'subscriptionCharges', 'company-b_202610');
        await assertFails(setDoc(ref, dadosCobranca('company-b', '2026-11')));
      });

      it('nao cria cobranca ja paga (deve ser NEGADO)', async () => {
        await semeiaSuperAdmin();

        const ctx = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const ref = doc(ctx.firestore(), 'subscriptionCharges', 'company-b_202611');
        await assertFails(
          setDoc(
            ref,
            dadosCobranca('company-b', '2026-11', {
              status: 'pago',
              paidDate: '2026-11-05',
              paidAmount: 150,
            }),
          ),
        );
      });
    });

    describe('Super-admin - atualizacao de subscriptionCharges', () => {
      it('a_pagar -> pago com paidAmount == amount (deve ser PERMITIDO)', async () => {
        await semeiaSuperAdmin();
        await semeiaCobranca('company-b_202611', dadosCobranca('company-b', '2026-11'));

        const ctx = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const ref = doc(ctx.firestore(), 'subscriptionCharges', 'company-b_202611');
        await assertSucceeds(
          updateDoc(ref, { status: 'pago', paidDate: '2026-11-05', paidAmount: 150 }),
        );
      });

      it('a_pagar -> pago com paidAmount != amount (deve ser NEGADO)', async () => {
        await semeiaSuperAdmin();
        await semeiaCobranca('company-b_202611', dadosCobranca('company-b', '2026-11'));

        const ctx = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const ref = doc(ctx.firestore(), 'subscriptionCharges', 'company-b_202611');
        await assertFails(
          updateDoc(ref, { status: 'pago', paidDate: '2026-11-05', paidAmount: 100 }),
        );
      });

      it('nao altera amount, mesmo em transicao valida (deve ser NEGADO)', async () => {
        await semeiaSuperAdmin();
        await semeiaCobranca('company-b_202611', dadosCobranca('company-b', '2026-11'));

        const ctx = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const ref = doc(ctx.firestore(), 'subscriptionCharges', 'company-b_202611');
        await assertFails(
          updateDoc(ref, { status: 'pago', paidDate: '2026-11-05', paidAmount: 200, amount: 200 }),
        );
      });

      it('nao altera dueDate, mesmo em transicao valida (deve ser NEGADO)', async () => {
        await semeiaSuperAdmin();
        await semeiaCobranca('company-b_202611', dadosCobranca('company-b', '2026-11'));

        const ctx = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const ref = doc(ctx.firestore(), 'subscriptionCharges', 'company-b_202611');
        await assertFails(
          updateDoc(ref, {
            status: 'pago',
            paidDate: '2026-11-05',
            paidAmount: 150,
            dueDate: '2026-11-20',
          }),
        );
      });

      it('nao altera companyId, mesmo em transicao valida (deve ser NEGADO)', async () => {
        await semeiaSuperAdmin();
        await semeiaCobranca('company-b_202611', dadosCobranca('company-b', '2026-11'));

        const ctx = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const ref = doc(ctx.firestore(), 'subscriptionCharges', 'company-b_202611');
        await assertFails(
          updateDoc(ref, {
            status: 'pago',
            paidDate: '2026-11-05',
            paidAmount: 150,
            companyId: 'company-a',
          }),
        );
      });

      it('nao altera competence, mesmo em transicao valida (deve ser NEGADO)', async () => {
        await semeiaSuperAdmin();
        await semeiaCobranca('company-b_202611', dadosCobranca('company-b', '2026-11'));

        const ctx = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const ref = doc(ctx.firestore(), 'subscriptionCharges', 'company-b_202611');
        await assertFails(
          updateDoc(ref, {
            status: 'pago',
            paidDate: '2026-11-05',
            paidAmount: 150,
            competence: '2026-12',
          }),
        );
      });

      it('pago -> a_pagar com paidDate e paidAmount null (desfazer) (deve ser PERMITIDO)', async () => {
        await semeiaSuperAdmin();
        await semeiaCobranca(
          'company-b_202611',
          dadosCobranca('company-b', '2026-11', {
            status: 'pago',
            paidDate: '2026-11-05',
            paidAmount: 150,
          }),
        );

        const ctx = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const ref = doc(ctx.firestore(), 'subscriptionCharges', 'company-b_202611');
        await assertSucceeds(
          updateDoc(ref, { status: 'a_pagar', paidDate: null, paidAmount: null }),
        );
      });

      it('pago -> a_pagar mantendo paidDate e paidAmount (deve ser NEGADO)', async () => {
        await semeiaSuperAdmin();
        await semeiaCobranca(
          'company-b_202611',
          dadosCobranca('company-b', '2026-11', {
            status: 'pago',
            paidDate: '2026-11-05',
            paidAmount: 150,
          }),
        );

        const ctx = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const ref = doc(ctx.firestore(), 'subscriptionCharges', 'company-b_202611');
        await assertFails(updateDoc(ref, { status: 'a_pagar' }));
      });

      it('pago -> a_pagar com paidDate null mas paidAmount mantido (deve ser NEGADO)', async () => {
        await semeiaSuperAdmin();
        await semeiaCobranca(
          'company-b_202611',
          dadosCobranca('company-b', '2026-11', {
            status: 'pago',
            paidDate: '2026-11-05',
            paidAmount: 150,
          }),
        );

        const ctx = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const ref = doc(ctx.firestore(), 'subscriptionCharges', 'company-b_202611');
        await assertFails(updateDoc(ref, { status: 'a_pagar', paidDate: null }));
      });
    });

    describe('Super-admin - paidDate invalida no pagamento (deve ser NEGADO)', () => {
      ['10/03/2026', ''].forEach(paidDate => {
        it(`a_pagar -> pago com paidDate '${paidDate}' (deve ser NEGADO)`, async () => {
          await semeiaSuperAdmin();
          await semeiaCobranca('company-b_202611', dadosCobranca('company-b', '2026-11'));

          const ctx = autenticarComo('super-admin-1', 'super-admin-1@test.com');
          const ref = doc(ctx.firestore(), 'subscriptionCharges', 'company-b_202611');
          await assertFails(updateDoc(ref, { status: 'pago', paidDate, paidAmount: 150 }));
        });
      });
    });

    describe('Super-admin - delete de subscriptionCharges (deve ser NEGADO)', () => {
      it('nao apaga cobranca (deleteDoc)', async () => {
        await semeiaSuperAdmin();
        await semeiaCobranca('company-b_202611', dadosCobranca('company-b', '2026-11'));

        const ctx = autenticarComo('super-admin-1', 'super-admin-1@test.com');
        const ref = doc(ctx.firestore(), 'subscriptionCharges', 'company-b_202611');
        await assertFails(deleteDoc(ref));
      });
    });
  });
});
