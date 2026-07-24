import { Injectable, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from '@angular/fire/auth';
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
  readonly currentUser$: Observable<AppUser | null> = toObservable(this.currentUser);

  constructor() {
    this.initAuthStateListener();
  }

  private initAuthStateListener(): void {
    onAuthStateChanged(this.auth, async (user) => {
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
    });
  }

  async login(email: string, password: string): Promise<AppUser> {
    const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
    const appUser = await this.fetchUserFromFirestore(userCredential.user.uid);
    this.currentUser.set(appUser);
    return appUser;
  }

  async logout(): Promise<void> {
    await signOut(this.auth);
    this.currentUser.set(null);
  }

  async signup(email: string, password: string, companyName: string): Promise<AppUser> {
    let userCredential;
    let appUser: AppUser;

    try {
      userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
      const uid = userCredential.user.uid;

      await runTransaction(this.firestore, async (transaction) => {
        const companyRef = doc(this.firestore, `companies/${uid}`);
        const userRef = doc(this.firestore, `users/${uid}`);

        const companyData: any = {
          id: uid,
          name: companyName,
          modules: { ...DEFAULT_MODULES },
          plan: 'trial',
          status: 'active',
          createdAt: serverTimestamp(),
        };

        const userData: any = {
          uid,
          email,
          companyId: uid,
          role: 'owner',
          createdAt: serverTimestamp(),
        };

        transaction.set(companyRef, companyData);
        transaction.set(userRef, userData);

        appUser = {
          uid,
          email,
          companyId: uid,
          role: 'owner',
          createdAt: Timestamp.now(),
        };
      });

      this.currentUser.set(appUser!);
      return appUser!;
    } catch (error) {
      console.error('AuthService: Erro ao registrar usuário:', error);
      throw error;
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
