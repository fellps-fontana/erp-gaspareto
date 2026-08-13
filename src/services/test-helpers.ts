import {
  initializeApp,
  deleteApp,
  FirebaseApp
} from 'firebase/app';
import {
  getFirestore,
  connectFirestoreEmulator,
  terminate,
  doc,
  setDoc,
  Timestamp,
  Firestore
} from 'firebase/firestore';
import {
  getAuth,
  connectAuthEmulator,
  signInAnonymously,
  signOut,
  Auth
} from 'firebase/auth';
import { signal } from '@angular/core';
import { AppUser } from '../models/user-model';

const EMULATOR_HOST = '127.0.0.1';
const FIRESTORE_EMULATOR_PORT = 8080;
const AUTH_EMULATOR_PORT = 9099;

export interface EmulatorTestSetup {
  firestore: Firestore;
  app: FirebaseApp;
  auth: Auth;
  mockCompanyId: string | null;
  tenantService: any;
  cleanup: () => Promise<void>;
}

export async function setupFirestoreEmulatorTest(companyId?: string | null): Promise<EmulatorTestSetup> {
  // Initialize Firebase app connected to the emulators. apiKey e um valor
  // fake: o Auth Emulator nao valida contra o Identity Toolkit real, mas o
  // SDK do firebase/auth exige o campo presente (auth/invalid-api-key) pra
  // sequer inicializar.
  const app = initializeApp(
    { projectId: 'demo-test', apiKey: 'demo-test-fake-api-key' },
    `test-app-${Date.now()}-${Math.random()}`
  );
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, EMULATOR_HOST, FIRESTORE_EMULATOR_PORT);

  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${AUTH_EMULATOR_PORT}`, { disableWarnings: true });

  // Login real no Auth Emulator: sem isso, request.auth e null nas regras
  // e toda leitura/escrita cai em PERMISSION_DENIED antes mesmo da logica
  // de negocio rodar (docs/multi-tenant.md - "Gap de infraestrutura de
  // teste").
  const credential = await signInAnonymously(auth);
  const uid = credential.user.uid;

  // firestore.rules so permite criar users/{uid} com companyId == uid
  // (mesmo racional do AuthService.signup: owner cria a propria empresa
  // usando o proprio uid como companyId). Por isso o mockCompanyId default
  // e o uid do usuario logado, nao um id aleatorio solto — do contrario o
  // setDoc abaixo cairia em PERMISSION_DENIED pra todo spec existente.
  const mockCompanyId = companyId === null ? null : (companyId ?? uid);

  if (mockCompanyId !== null) {
    const userDoc: AppUser = {
      uid,
      email: `${uid}@test.local`,
      companyId: mockCompanyId,
      role: 'owner',
      createdAt: Timestamp.now(),
    };
    await setDoc(doc(firestore, 'users', uid), userDoc);
  }

  // Create tenant service mock with signal
  const tenantService = {
    companyId: signal(mockCompanyId),
    isCompanyLoaded: () => mockCompanyId !== null,
    isAuthInitialized: () => true,
  };

  return {
    firestore,
    app,
    auth,
    mockCompanyId,
    tenantService,
    cleanup: async () => {
      try {
        await signOut(auth);
      } catch (e) {
        // Already signed out or error
      }
      try {
        await terminate(firestore);
      } catch (e) {
        // Already terminated or error
      }
      try {
        await deleteApp(app);
      } catch (e) {
        // Already deleted
      }
    }
  };
}
