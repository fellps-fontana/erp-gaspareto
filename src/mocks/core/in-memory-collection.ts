import { BehaviorSubject, Observable } from 'rxjs';

export class InMemoryCollection<T extends { id?: string }> {
  private store: T[] = [];
  private subject = new BehaviorSubject<T[]>([]);

  constructor(initialData: T[] = []) {
    this.store = initialData.map(item => ({ ...item }));
    this.subject.next([...this.store]);
  }

  getAll(): T[] {
    return [...this.store];
  }

  asObservable(): Observable<T[]> {
    return this.subject.asObservable();
  }

  add(item: T): T {
    const newItem = { ...item };
    this.store.push(newItem);
    this.subject.next([...this.store]);
    return newItem;
  }

  find(predicate: (item: T) => boolean): T | undefined {
    return this.store.find(predicate);
  }

  findById(id: string): T | undefined {
    return this.store.find(item => item.id === id);
  }

  patch(id: string, partial: Partial<T>): void {
    const item = this.store.find(i => i.id === id);
    if (item) {
      Object.assign(item, partial);
      this.subject.next([...this.store]);
    }
  }

  remove(id: string): void {
    const index = this.store.findIndex(item => item.id === id);
    if (index !== -1) {
      this.store.splice(index, 1);
      this.subject.next([...this.store]);
    }
  }

  clear(): void {
    this.store = [];
    this.subject.next([]);
  }

  replaceAll(items: T[]): void {
    this.store = items.map(item => ({ ...item }));
    this.subject.next([...this.store]);
  }
}
