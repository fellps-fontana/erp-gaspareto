import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideFirestore, getFirestore } from '@angular/fire/firestore';

import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';
import { environment } from '../enviroments/enviroments';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { ProductService } from '../services/product-service/product-service';
import { SaleService } from '../services/sale-service/sale-service';
import { ComandaService } from '../services/comanda-service/comanda-service';
import { OrderService } from '../services/order-service/order-service';
import { BillService } from '../services/bill-service/bill-service';
import { CustomerService } from '../services/customer-service/customer-service';
import { PurchaseService } from '../services/purchase-service/purchase-service';
import { PurchaseProductService } from '../services/purchase-product-service/purchase-product-service';
import { ConfigService } from '../services/config/config.service';
import { ProductServiceMock } from '../mocks/product-service-mock';
import { SaleServiceMock } from '../mocks/sale-service-mock';
import { ComandaServiceMock } from '../mocks/comanda-service-mock';
import { OrderServiceMock } from '../mocks/order-service-mock';
import { BillServiceMock } from '../mocks/bill-service-mock';
import { CustomerServiceMock } from '../mocks/customer-service-mock';
import { PurchaseServiceMock } from '../mocks/purchase-service-mock';
import { PurchaseProductServiceMock } from '../mocks/purchase-product-service-mock';
import { ConfigServiceMock } from '../mocks/config-service-mock';

const firebaseProviders = environment.useMock ? [] : [
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
];

const serviceProviders = environment.useMock ? [
  { provide: ProductService, useClass: ProductServiceMock },
  { provide: SaleService, useClass: SaleServiceMock },
  { provide: ComandaService, useClass: ComandaServiceMock },
  { provide: OrderService, useClass: OrderServiceMock },
  { provide: BillService, useClass: BillServiceMock },
  { provide: CustomerService, useClass: CustomerServiceMock },
  { provide: PurchaseService, useClass: PurchaseServiceMock },
  { provide: PurchaseProductService, useClass: PurchaseProductServiceMock },
  { provide: ConfigService, useClass: ConfigServiceMock }
] : [];

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    }),
    ...firebaseProviders,
    ...serviceProviders
  ]
};
