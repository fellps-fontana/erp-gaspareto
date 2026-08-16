import { initializeApp } from 'firebase-admin/app';

// Bootstrap do Admin SDK das Cloud Functions do projeto.
initializeApp();

export { resetUserPassword } from './reset-user-password';
export { setSuperAdmin } from './set-super-admin';
