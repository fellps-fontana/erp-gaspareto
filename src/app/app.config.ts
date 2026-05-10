import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';

import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';
import { environment } from '../enviroments/enviroments';
import { getAuth, provideAuth } from '@angular/fire/auth';

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
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore())
  ]
};
