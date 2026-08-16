import { Injectable, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from '@angular/fire/auth';
import { Firestore, doc, getDoc, runTransaction, serverTimestamp, Timestamp } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { AppUser } from '../../models/user-model';
import { Company } from '../../models/company-model';
import { DEFAULT_MODULES } from '../../models/company-config';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);

  readonly currentUser = signal<AppUser | null>(null);
  readonly authInitialized = signal<boolean>(false);
  readonly currentUser$: Observable<AppUser | null> = toObservable(this.currentUser);

  private isUpdatingAuthManually = false;

  constructor() {
    this.initAuthStateListener();
  }

  private initAuthStateListener(): void {
    onAuthStateChanged(this.auth, async (user) => {
      if (this.isUpdatingAuthManually) {
        return;
      }

      if (user) {
        try {
          const appUser = await this.fetchUserFromFirestore(user.uid);
          this.currentUser.set(appUser);
        } catch (error) {
          console.error('AuthService: Erro ao buscar dados do usuário:', error);
          this.currentUser.set(null);
        }
      } else {
        this.currentUser.set(null);
      }

      this.authInitialized.set(true);
    });
  }

  async login(email: string, password: string): Promise<AppUser> {
    this.isUpdatingAuthManually = true;
    try {
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      const appUser = await this.fetchUserFromFirestore(userCredential.user.uid);
      this.currentUser.set(appUser);
      this.authInitialized.set(true);
      return appUser;
    } finally {
      this.isUpdatingAuthManually = false;
    }
  }

  async logout(): Promise<void> {
    this.isUpdatingAuthManually = true;
    try {
      await signOut(this.auth);
      this.currentUser.set(null);
    } finally {
      this.isUpdatingAuthManually = false;
    }
  }

  async signup(email: string, password: string, companyName: string): Promise<AppUser> {
    let userCredential: { user: User };
    let appUser: AppUser | null = null;

    this.isUpdatingAuthManually = true;
    try {
      userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
      const uid = userCredential.user.uid;

      try {
        await runTransaction(this.firestore, async (transaction) => {
          const companyRef = doc(this.firestore, `companies/${uid}`);
          const userRef = doc(this.firestore, `users/${uid}`);

          const companyData = {
            name: companyName,
            modules: { ...DEFAULT_MODULES },
            plan: 'trial' as const,
            status: 'active' as const,
            createdAt: serverTimestamp(),
          };

          const userData = {
            uid,
            email,
            companyId: uid,
            role: 'owner' as const,
            isSuperAdmin: false,
            createdAt: serverTimestamp(),
          };

          transaction.set(companyRef, companyData as Omit<Company, 'id'>);
          transaction.set(userRef, userData as AppUser);

          appUser = {
            uid,
            email,
            companyId: uid,
            role: 'owner',
            isSuperAdmin: false,
            createdAt: Timestamp.now(),
          };
        });

        if (!appUser) {
          throw new Error('Falha ao criar documentos da empresa e usuário.');
        }

        this.currentUser.set(appUser);
        this.authInitialized.set(true);
        return appUser;
      } catch (transactionError) {
        await this.deleteAuthUserIfExists(userCredential.user);
        throw transactionError;
      }
    } finally {
      this.isUpdatingAuthManually = false;
    }
  }

  private async deleteAuthUserIfExists(user: User): Promise<void> {
    try {
      await user.delete();
      console.info('AuthService: Usuário removido do Auth após falha de transação.');
    } catch (deleteError) {
      console.error('AuthService: Erro ao remover usuário orfão do Auth:', deleteError);
    }
  }

  private async fetchUserFromFirestore(uid: string): Promise<AppUser> {
    const userDocRef = doc(this.firestore, `users/${uid}`);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      throw new Error(`Usuário com UID ${uid} não encontrado no Firestore.`);
    }

    return userDoc.data() as AppUser;
  }
}
