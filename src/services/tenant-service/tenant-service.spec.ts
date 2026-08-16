import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { TenantService } from './tenant-service';
import { AuthService } from '../auth-service/auth-service';
import { AppUser } from '../../models/user-model';
import { Timestamp } from '@angular/fire/firestore';

describe('TenantService — companyId com override (super-admin)', () => {
  let tenantService: TenantService;
  let authServiceMock: jasmine.SpyObj<AuthService>;

  const mockAppUser = (uid: string, companyId: string, isSuperAdmin?: boolean): AppUser => ({
    uid,
    email: `${uid}@test.com`,
    companyId,
    role: 'owner',
    isSuperAdmin,
    createdAt: Timestamp.now(),
  });

  beforeEach(() => {
    const mockAuthService = jasmine.createSpyObj('AuthService', [], {
      currentUser: signal<AppUser | null>(null),
      authInitialized: signal(true),
    });

    TestBed.configureTestingModule({
      providers: [
        TenantService,
        { provide: AuthService, useValue: mockAuthService },
      ],
    });

    authServiceMock = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
    tenantService = TestBed.inject(TenantService);
  });

  describe('companyId() sem super-admin', () => {
    it('deve retornar o companyId do usuario comum, ignorando override', () => {
      const user = mockAppUser('user-123', 'company-a', false);
      authServiceMock.currentUser.set(user);

      tenantService.setActiveCompanyOverride('company-b');

      expect(tenantService.companyId()).toBe('company-a');
    });

    it('deve retornar o companyId mesmo quando isSuperAdmin ausente (undefined = false)', () => {
      const user = mockAppUser('user-123', 'company-a');
      // isSuperAdmin ausente (undefined)
      authServiceMock.currentUser.set(user);

      tenantService.setActiveCompanyOverride('company-b');

      expect(tenantService.companyId()).toBe('company-a');
    });

    it('deve continuar retornando o companyId proprio apos multiplas tentativas de override', () => {
      const user = mockAppUser('user-123', 'company-a', false);
      authServiceMock.currentUser.set(user);

      tenantService.setActiveCompanyOverride('company-b');
      tenantService.setActiveCompanyOverride('company-c');
      tenantService.setActiveCompanyOverride(null);

      expect(tenantService.companyId()).toBe('company-a');
    });
  });

  describe('companyId() com super-admin', () => {
    it('deve retornar o override quando usuario tem isSuperAdmin: true', () => {
      const user = mockAppUser('super-admin-1', 'company-a', true);
      authServiceMock.currentUser.set(user);

      tenantService.setActiveCompanyOverride('company-b');

      expect(tenantService.companyId()).toBe('company-b');
    });

    it('deve voltar ao companyId proprio quando override e setado pra null', () => {
      const user = mockAppUser('super-admin-1', 'company-a', true);
      authServiceMock.currentUser.set(user);

      tenantService.setActiveCompanyOverride('company-b');
      expect(tenantService.companyId()).toBe('company-b');

      tenantService.setActiveCompanyOverride(null);
      expect(tenantService.companyId()).toBe('company-a');
    });

    it('deve permitir multiplas trocas de override seguidas', () => {
      const user = mockAppUser('super-admin-1', 'company-a', true);
      authServiceMock.currentUser.set(user);

      tenantService.setActiveCompanyOverride('company-b');
      expect(tenantService.companyId()).toBe('company-b');

      tenantService.setActiveCompanyOverride('company-c');
      expect(tenantService.companyId()).toBe('company-c');

      tenantService.setActiveCompanyOverride('company-a');
      expect(tenantService.companyId()).toBe('company-a');
    });
  });

  describe('troca de usuario reseta override', () => {
    it('deve resetar override quando uid muda (logout/login)', () => {
      const superAdmin1 = mockAppUser('super-admin-1', 'company-a', true);
      authServiceMock.currentUser.set(superAdmin1);

      tenantService.setActiveCompanyOverride('company-b');
      expect(tenantService.companyId()).toBe('company-b');

      const superAdmin2 = mockAppUser('super-admin-2', 'company-c', true);
      authServiceMock.currentUser.set(superAdmin2);

      expect(tenantService.companyId()).toBe('company-c');
    });

    it('deve resetar override quando usuario faz logout', () => {
      const superAdmin = mockAppUser('super-admin-1', 'company-a', true);
      authServiceMock.currentUser.set(superAdmin);

      tenantService.setActiveCompanyOverride('company-b');
      expect(tenantService.companyId()).toBe('company-b');

      authServiceMock.currentUser.set(null);

      expect(tenantService.companyId()).toBeNull();
    });
  });

  describe('isSuperAdmin computed', () => {
    it('deve retornar true quando usuario tem isSuperAdmin: true', () => {
      const user = mockAppUser('super-admin-1', 'company-a', true);
      authServiceMock.currentUser.set(user);

      expect(tenantService.isSuperAdmin()).toBe(true);
    });

    it('deve retornar false quando usuario tem isSuperAdmin: false', () => {
      const user = mockAppUser('user-123', 'company-a', false);
      authServiceMock.currentUser.set(user);

      expect(tenantService.isSuperAdmin()).toBe(false);
    });

    it('deve retornar false quando isSuperAdmin ausente (undefined)', () => {
      const user = mockAppUser('user-123', 'company-a');
      authServiceMock.currentUser.set(user);

      expect(tenantService.isSuperAdmin()).toBe(false);
    });

    it('deve retornar false quando currentUser e null (nao autenticado)', () => {
      authServiceMock.currentUser.set(null);

      expect(tenantService.isSuperAdmin()).toBe(false);
    });

    it('deve atualizar quando isSuperAdmin muda em currentUser', () => {
      const user = mockAppUser('user-123', 'company-a', false);
      authServiceMock.currentUser.set(user);

      expect(tenantService.isSuperAdmin()).toBe(false);

      const updatedUser = mockAppUser('user-123', 'company-a', true);
      authServiceMock.currentUser.set(updatedUser);

      expect(tenantService.isSuperAdmin()).toBe(true);
    });
  });
});
