import {
  initializeApp,
  deleteApp,
  FirebaseApp
} from 'firebase/app';
import {
  getFirestore,
  connectFirestoreEmulator,
  terminate,
  Firestore
} from 'firebase/firestore';
import { signal } from '@angular/core';

const EMULATOR_HOST = '127.0.0.1';
const EMULATOR_PORT = 8080;
const FIRESTORE_EMULATOR_URL = `http://${EMULATOR_HOST}:${EMULATOR_PORT}`;

export interface EmulatorTestSetup {
  firestore: Firestore;
  app: FirebaseApp;
  mockCompanyId: string;
  tenantService: any;
  cleanup: () => Promise<void>;
}

export async function setupFirestoreEmulatorTest(): Promise<EmulatorTestSetup> {
  const mockCompanyId = `company-${Date.now()}-${Math.random()}`;

  // Initialize Firebase app connected to emulator
  const app = initializeApp(
    { projectId: 'demo-test' },
    `test-app-${Date.now()}-${Math.random()}`
  );
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, EMULATOR_HOST, EMULATOR_PORT);

  // Create tenant service mock with signal
  const tenantService = {
    companyId: signal(mockCompanyId),
    isCompanyLoaded: () => true,
    isAuthInitialized: () => true
  };

  return {
    firestore,
    app,
    mockCompanyId,
    tenantService,
    cleanup: async () => {
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
