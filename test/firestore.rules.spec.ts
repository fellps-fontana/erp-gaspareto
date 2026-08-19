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
});
