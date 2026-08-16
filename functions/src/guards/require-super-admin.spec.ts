import { requireSuperAdmin } from './require-super-admin';

const mockDocs = new Map<string, Record<string, unknown> | undefined>();

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => ({
      get: async () => ({
        exists: mockDocs.has(path),
        data: () => mockDocs.get(path),
      }),
    }),
  }),
}));

describe('requireSuperAdmin', () => {
  beforeEach(() => {
    mockDocs.clear();
  });

  it('lanca unauthenticated quando callerUid e undefined', async () => {
    await expect(requireSuperAdmin(undefined)).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('lanca not-found quando o doc users/{callerUid} nao existe', async () => {
    await expect(requireSuperAdmin('uid-inexistente')).rejects.toMatchObject({ code: 'not-found' });
  });

  it('lanca permission-denied quando usuario existe mas isSuperAdmin e false', async () => {
    mockDocs.set('users/user-comum', { isSuperAdmin: false });

    await expect(requireSuperAdmin('user-comum')).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('lanca permission-denied quando isSuperAdmin esta ausente (undefined)', async () => {
    mockDocs.set('users/user-sem-flag', { companyId: 'company-a', role: 'owner' });

    await expect(requireSuperAdmin('user-sem-flag')).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('resolve sem lancar quando usuario e super-admin', async () => {
    mockDocs.set('users/super-admin-1', { isSuperAdmin: true });

    await expect(requireSuperAdmin('super-admin-1')).resolves.toBeUndefined();
  });
});
