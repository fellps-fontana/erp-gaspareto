import { inject, NgZone } from '@angular/core';
import { onSnapshot } from 'firebase/firestore';
import { Observable } from 'rxjs';

export abstract class FirestoreBaseService {
  protected ngZone = inject(NgZone);

  protected collectionDataObservable<T>(queryFn: any): Observable<T[]> {
    return new Observable<T[]>((observer) => {
      const unsubscribe = onSnapshot(
        queryFn,
        (snapshot: any) => {
          const data = snapshot.docs.map((d: any) => ({ id: d.id, ...d.data() }));
          this.ngZone.run(() => observer.next(data));
        },
        (error: any) => this.ngZone.run(() => observer.error(error))
      );
      return () => unsubscribe();
    });
  }

  protected docDataObservable<T>(docRef: any): Observable<T | undefined> {
    return new Observable<T | undefined>((observer) => {
      const unsubscribe = onSnapshot(
        docRef,
        (docSnap: any) => {
          const data = docSnap.exists() ? ({ id: docSnap.id, ...docSnap.data() } as T) : undefined;
          this.ngZone.run(() => observer.next(data));
        },
        (error: any) => this.ngZone.run(() => observer.error(error))
      );
      return () => unsubscribe();
    });
  }
}
