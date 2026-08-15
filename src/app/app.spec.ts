import { TestBed } from '@angular/core/testing';
import { SwUpdate } from '@angular/service-worker';
import { of } from 'rxjs';
import { initializeApp } from '@angular/fire/app';
import { Auth, getAuth, connectAuthEmulator } from '@angular/fire/auth';
import { Firestore, getFirestore, connectFirestoreEmulator } from '@angular/fire/firestore';
import { AppComponent } from './app';

describe('AppComponent', () => {
  // AppComponent injeta ConfigService/TenantService/AuthService (via
  // ThemeService/ConfigService no construtor), que por sua vez precisam de
  // Auth/Firestore reais -- AuthService chama onAuthStateChanged() no
  // proprio construtor, entao um mock vazio nao basta. Conecta num app
  // Firebase isolado (nome unico, novo a cada teste) contra os emuladores
  // locais, mesmo padrao de src/services/test-helpers.ts. O AngularFire
  // ainda avisa "outside injection context" (warning, nao erro) porque a
  // chamada nao passa por um factory do Angular -- inofensivo aqui, so
  // relevante em app real rodando em zona/change detection.
  beforeEach(async () => {
    const testApp = initializeApp(
      { projectId: 'demo-test', apiKey: 'demo-key', appId: 'app-spec-test' },
      `app-spec-test-${Date.now()}`
    );
    const testAuth = getAuth(testApp);
    connectAuthEmulator(testAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const testFirestore = getFirestore(testApp);
    connectFirestoreEmulator(testFirestore, '127.0.0.1', 8080);

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        { provide: SwUpdate, useValue: { isEnabled: false, versionUpdates: of() } },
        { provide: Auth, useValue: testAuth },
        { provide: Firestore, useValue: testFirestore }
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });
});
