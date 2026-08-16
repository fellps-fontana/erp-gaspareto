import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

/**
 * Verifica no Firestore (Admin SDK — nunca confia em claim/dado vindo do
 * client) se callerUid corresponde a um usuário com isSuperAdmin === true.
 * Ver regra-de-negocio.md seção 13.
 * @throws HttpsError('unauthenticated') se callerUid ausente
 * @throws HttpsError('not-found') se o doc users/{callerUid} não existir
 * @throws HttpsError('permission-denied') se o usuário existir mas não for super-admin
 */
export async function requireSuperAdmin(callerUid: string | undefined): Promise<void> {
  if (!callerUid) {
    throw new HttpsError('unauthenticated', 'Caller UID é obrigatório');
  }

  const userDocRef = getFirestore().doc(`users/${callerUid}`);
  const userDoc = await userDocRef.get();

  if (!userDoc.exists) {
    throw new HttpsError('not-found', `Usuário com UID ${callerUid} não encontrado`);
  }

  const userData = userDoc.data() as { isSuperAdmin?: boolean };
  if (userData?.isSuperAdmin !== true) {
    throw new HttpsError('permission-denied', 'Usuário não é super-admin');
  }
}
