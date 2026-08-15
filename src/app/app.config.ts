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

// Usa o mesmo host que serviu a pagina (window.location.hostname) em vez de
// fixar '127.0.0.1' -- assim funciona tanto acessando via localhost na
// mesma maquina quanto via IP da rede local de outro PC/celular, contanto
// que o `ng serve --host 0.0.0.0` e os emuladores (firebase.json ->
// emulators.*.host: "0.0.0.0") estejam expostos na rede.
const emulatorHost = typeof window !== 'undefined' ? window.location.hostname : '127.0.0.1';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    }),
    provideFirebaseApp(() => initializeApp(
      // Em modo emulador, o project ID precisa bater com o que o emulador
      // e o script de seed usam ("demo-test") -- o emulador segrega dados
      // por project ID mesmo respondendo no mesmo host:port, entao usar o
      // project ID real aqui faria o app nao encontrar nenhuma conta
      // criada via seed/emulador. Fora do modo emulador, usa a config do
      // environment ativo (dev/staging/production, via fileReplacements
      // do angular.json) em vez de valores fixos.
      useEmulator
        ? {
            projectId: "demo-test",
            apiKey: "demo-key",
            appId: "1:387862323319:web:ac0159f2fad009d2062672",
            authDomain: "projetosfelipe-9e458.firebaseapp.com",
            storageBucket: "projetosfelipe-9e458.firebasestorage.app",
            messagingSenderId: "387862323319",
            measurementId: "G-X1MN9G6SEQ"
          }
        : environment.firebase
    )),
    provideAuth(() => {
      const auth = getAuth();
      if (useEmulator) {
        connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
      }
      return auth;
    }),
    provideFirestore(() => {
      const firestore = getFirestore();
      if (useEmulator) {
        connectFirestoreEmulator(firestore, emulatorHost, 8080);
      }
      return firestore;
    })
  ]
};
