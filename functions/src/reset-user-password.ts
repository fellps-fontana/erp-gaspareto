import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { requireSuperAdmin } from './guards/require-super-admin';

export interface ResetUserPasswordInput {
  targetUid: string;
  newPassword: string;
}

export interface ResetUserPasswordOutput {
  success: true;
}

/**
 * Reseta a senha de qualquer usuário (super-admin pode resetar a própria
 * também). Só quem tem isSuperAdmin === true pode chamar — ver
 * requireSuperAdmin e regra-de-negocio.md seção 13.
 */
export const resetUserPassword = onCall<ResetUserPasswordInput>(
  { region: 'us-central1' },
  async (request: CallableRequest<ResetUserPasswordInput>): Promise<ResetUserPasswordOutput> => {
    await requireSuperAdmin(request.auth?.uid);

    const { targetUid, newPassword } = request.data;

    if (!newPassword || newPassword.length < 6) {
      throw new HttpsError(
        'invalid-argument',
        'Nova senha deve ter no mínimo 6 caracteres'
      );
    }

    const userDocRef = getFirestore().doc(`users/${targetUid}`);
    const userDoc = await userDocRef.get();

    if (!userDoc.exists) {
      throw new HttpsError('not-found', `Usuário com UID ${targetUid} não encontrado`);
    }

    await getAuth().updateUser(targetUid, { password: newPassword });

    return { success: true };
  },
);
