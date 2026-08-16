import type { CallableRequest } from 'firebase-functions/v2/https';
import { setSuperAdmin, SetSuperAdminInput, SetSuperAdminOutput } from './set-super-admin';

const mockDocs = new Map<string, Record<string, unknown> | undefined>();
const updateMock = jest.fn(async (path: string, patch: Record<string, unknown>) => {
  mockDocs.set(path, { ...mockDocs.get(path), ...patch });
});

jest.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    doc: (path: string) => ({
      get: async () => ({
        exists: mockDocs.has(path),
        data: () => mockDocs.get(path),
      }),
      update: (patch: Record<string, unknown>) => updateMock(path, patch),
    }),
  }),
}));

function buildRequest(
  callerUid: string | undefined,
  data: SetSuperAdminInput,
): CallableRequest<SetSuperAdminInput> {
  return {
    data,
    auth: callerUid ? { uid: callerUid, token: {} } : undefined,
    rawRequest: {},
    acceptsStreaming: false,
  } as unknown as CallableRequest<SetSuperAdminInput>;
}

describe('setSuperAdmin', () => {
  beforeEach(() => {
    mockDocs.clear();
    updateMock.mockClear();
  });

  it('rejeita chamador nao autenticado', async () => {
    const request = buildRequest(undefined, { targetUid: 'user-x', value: true });

    await expect(setSuperAdmin.run(request)).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rejeita chamador que nao e super-admin', async () => {
    mockDocs.set('users/user-comum', { isSuperAdmin: false });
    const request = buildRequest('user-comum', { targetUid: 'user-x', value: true });

    await expect(setSuperAdmin.run(request)).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('bloqueia autorrevogacao quando targetUid === caller uid e value=true', async () => {
    mockDocs.set('users/super-admin-1', { isSuperAdmin: true });
    const request = buildRequest('super-admin-1', { targetUid: 'super-admin-1', value: true });

    await expect(setSuperAdmin.run(request)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('bloqueia autorrevogacao quando targetUid === caller uid e value=false', async () => {
    mockDocs.set('users/super-admin-1', { isSuperAdmin: true });
    const request = buildRequest('super-admin-1', { targetUid: 'super-admin-1', value: false });

    await expect(setSuperAdmin.run(request)).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rejeita targetUid inexistente', async () => {
    mockDocs.set('users/super-admin-1', { isSuperAdmin: true });
    const request = buildRequest('super-admin-1', { targetUid: 'user-fantasma', value: true });

    await expect(setSuperAdmin.run(request)).rejects.toMatchObject({ code: 'not-found' });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('concede isSuperAdmin a outro usuario com sucesso', async () => {
    mockDocs.set('users/super-admin-1', { isSuperAdmin: true });
    mockDocs.set('users/user-x', { isSuperAdmin: false });
    const request = buildRequest('super-admin-1', { targetUid: 'user-x', value: true });

    const result = await setSuperAdmin.run(request);

    expect(result).toEqual<SetSuperAdminOutput>({ success: true, targetUid: 'user-x', value: true });
    expect(updateMock).toHaveBeenCalledWith('users/user-x', { isSuperAdmin: true });
    expect(mockDocs.get('users/user-x')).toMatchObject({ isSuperAdmin: true });
  });

  it('revoga isSuperAdmin de outro usuario com sucesso', async () => {
    mockDocs.set('users/super-admin-1', { isSuperAdmin: true });
    mockDocs.set('users/user-x', { isSuperAdmin: true });
    const request = buildRequest('super-admin-1', { targetUid: 'user-x', value: false });

    const result = await setSuperAdmin.run(request);

    expect(result).toEqual<SetSuperAdminOutput>({
      success: true,
      targetUid: 'user-x',
      value: false,
    });
    expect(updateMock).toHaveBeenCalledWith('users/user-x', { isSuperAdmin: false });
    expect(mockDocs.get('users/user-x')).toMatchObject({ isSuperAdmin: false });
  });
});
