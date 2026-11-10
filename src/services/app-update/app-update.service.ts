import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';

export const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private swUpdate = inject(SwUpdate);
  private destroyRef = inject(DestroyRef);

  private _updateAvailable = signal(false);
  readonly updateAvailable = this._updateAvailable.asReadonly();

  constructor() {
    if (!this.swUpdate.isEnabled) return;

    this.swUpdate.versionUpdates
      .pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'))
      .subscribe(() => this._updateAvailable.set(true));

    this.swUpdate.unrecoverable.subscribe(() => this.reloadPage());

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') this.checkForUpdate();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    const intervalId = setInterval(() => this.checkForUpdate(), UPDATE_CHECK_INTERVAL_MS);

    this.destroyRef.onDestroy(() => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearInterval(intervalId);
    });

    this.checkForUpdate();
  }

  async checkForUpdate(): Promise<void> {
    if (!this.swUpdate.isEnabled) return;
    try {
      await this.swUpdate.checkForUpdate();
    } catch (error) {
      console.warn('Falha ao checar atualizacao do app', error);
    }
  }

  async applyUpdate(): Promise<void> {
    if (!this.swUpdate.isEnabled) return;
    try {
      await this.swUpdate.activateUpdate();
    } catch (error) {
      console.warn('Falha ao ativar atualizacao do app', error);
    }
    this.reloadPage();
  }

  reloadPage(): void {
    document.location.reload();
  }
}
