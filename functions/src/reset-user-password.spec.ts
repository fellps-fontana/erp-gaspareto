import type { CallableRequest } from 'firebase-functions/v2/https';
import {
  resetUserPassword,
  ResetUserPasswordInput,
  ResetUserPasswordOutput,
} from './reset-user-password';

const mockDocs = new Map<string, Record<string, unknown> | undefined>();
const updateUserMock = jest.fn(async (_uid: string, _data: { password: string }) => undefined);

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

jest.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    updateUser: (uid: string, data: { password: string }) => updateUserMock(uid, data),
  }),
}));

function buildRequest(
  callerUid: string | undefined,
  data: ResetUserPasswordInput,
): CallableRequest<ResetUserPasswordInput> {
  return {
    data,
    auth: callerUid ? { uid: callerUid, token: {} } : undefined,
    rawRequest: {},
    acceptsStreaming: false,
  } as unknown as CallableRequest<ResetUserPasswordInput>;
}

describe('resetUserPassword', () => {
  beforeEach(() => {
    mockDocs.clear();
    updateUserMock.mockClear();
  });

  it('rejeita chamador nao autenticado', async () => {
    const request = buildRequest(undefined, { targetUid: 'user-x', newPassword: 'abcdef' });

    await expect(resetUserPassword.run(request)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it('rejeita chamador que nao e super-admin', async () => {
    mockDocs.set('users/user-comum', { isSuperAdmin: false });
    const request = buildRequest('user-comum', { targetUid: 'user-x', newPassword: 'abcdef' });

    await expect(resetUserPassword.run(request)).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it('rejeita newPassword com menos de 6 caracteres', async () => {
    mockDocs.set('users/super-admin-1', { isSuperAdmin: true });
    const request = buildRequest('super-admin-1', { targetUid: 'user-x', newPassword: 'abc' });

    await expect(resetUserPassword.run(request)).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it('rejeita targetUid inexistente', async () => {
    mockDocs.set('users/super-admin-1', { isSuperAdmin: true });
    const request = buildRequest('super-admin-1', {
      targetUid: 'user-fantasma',
      newPassword: 'abcdef',
    });

    await expect(resetUserPassword.run(request)).rejects.toMatchObject({ code: 'not-found' });
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it('super-admin reseta senha de outro usuario com sucesso', async () => {
    mockDocs.set('users/super-admin-1', { isSuperAdmin: true });
    mockDocs.set('users/user-x', { isSuperAdmin: false });
    const request = buildRequest('super-admin-1', {
      targetUid: 'user-x',
      newPassword: 'novaSenha123',
    });

    const result = await resetUserPassword.run(request);

    expect(result).toEqual<ResetUserPasswordOutput>({ success: true });
    expect(updateUserMock).toHaveBeenCalledWith('user-x', { password: 'novaSenha123' });
  });

  it('super-admin reseta a propria senha com sucesso', async () => {
    mockDocs.set('users/super-admin-1', { isSuperAdmin: true });
    const request = buildRequest('super-admin-1', {
      targetUid: 'super-admin-1',
      newPassword: 'novaSenha123',
    });

    const result = await resetUserPassword.run(request);

    expect(result).toEqual<ResetUserPasswordOutput>({ success: true });
    expect(updateUserMock).toHaveBeenCalledWith('super-admin-1', { password: 'novaSenha123' });
  });
});
