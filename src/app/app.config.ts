import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideFirestore, getFirestore, connectFirestoreEmulator } from '@angular/fire/firestore';

import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';
import { environment } from '../enviroments/enviroments';
import { getAuth, provideAuth, connectAuthEmulator } from '@angular/fire/auth';

// Conecta nos emuladores locais SOMENTE em dev mode + flag explicita
// (environment.useEmulator) -- nunca em build de producao, mesmo que a
// flag fique true por engano (isDevMode() e falso num build --configuration
// production real, independente do conteudo deste arquivo de environment).
const useEmulator = isDevMode() && environment.useEmulator;

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    }),
    provideFirebaseApp(() => initializeApp({
      projectId: "projetosfelipe-9e458",
      appId: "1:387862323319:web:ac0159f2fad009d2062672",
      storageBucket: "projetosfelipe-9e458.firebasestorage.app",
      apiKey: "AIzaSyAKeaJqPLIZrAmXQuokvaw4PAEY0q0GDYM",
      authDomain: "projetosfelipe-9e458.firebaseapp.com",
      messagingSenderId: "387862323319",
      measurementId: "G-X1MN9G6SEQ"
    })),
    provideAuth(() => {
      const auth = getAuth();
      if (useEmulator) {
        connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      }
      return auth;
    }),
    provideFirestore(() => {
      const firestore = getFirestore();
      if (useEmulator) {
        connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
      }
      return firestore;
    })
  ]
};
