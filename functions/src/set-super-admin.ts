import { getFirestore } from 'firebase-admin/firestore';
import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { requireSuperAdmin } from './guards/require-super-admin';

export interface SetSuperAdminInput {
  targetUid: string;
  value: boolean;
}

export interface SetSuperAdminOutput {
  success: true;
  targetUid: string;
  value: boolean;
}

/**
 * Única forma legítima de alterar isSuperAdmin em users/{uid} — o client
 * nunca escreve esse campo direto (firestore.rules: allow update = false).
 * targetUid nunca pode ser igual ao uid de quem chama (evita autorrevogação
 * acidental) — ver regra-de-negocio.md seção 13.
 */
export const setSuperAdmin = onCall<SetSuperAdminInput>(
  { region: 'us-central1' },
  async (request: CallableRequest<SetSuperAdminInput>): Promise<SetSuperAdminOutput> => {
    await requireSuperAdmin(request.auth?.uid);

    const { targetUid, value } = request.data;

    if (targetUid === request.auth?.uid) {
      throw new HttpsError(
        'failed-precondition',
        'Não é possível modificar o próprio flag isSuperAdmin'
      );
    }

    const userDocRef = getFirestore().doc(`users/${targetUid}`);
    const userDoc = await userDocRef.get();

    if (!userDoc.exists) {
      throw new HttpsError('not-found', `Usuário com UID ${targetUid} não encontrado`);
    }

    await userDocRef.update({ isSuperAdmin: value });

    return { success: true, targetUid, value };
  },
);
