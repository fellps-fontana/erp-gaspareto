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
}
