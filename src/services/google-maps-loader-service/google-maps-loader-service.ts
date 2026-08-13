import { Injectable } from '@angular/core';

const SCRIPT_SELECTOR = 'script[src*="maps.googleapis.com/maps/api/js"]';
const LOAD_TIMEOUT_MS = 15000;

@Injectable({ providedIn: 'root' })
export class GoogleMapsLoaderService {
  private loadPromise: Promise<void> | null = null;

  load(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this.buildLoadPromise();
    return this.loadPromise;
  }

  private buildLoadPromise(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.isReady()) { resolve(); return; }

      const script = document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR);
      if (!script) { reject(new Error('Script do Google Maps não encontrado em index.html')); return; }

      const timer = setTimeout(() => reject(new Error('Timeout ao carregar Google Maps API')), LOAD_TIMEOUT_MS);

      script.addEventListener('load', () => {
        clearTimeout(timer);
        this.isReady() ? resolve() : reject(new Error('Script carregou mas google.maps não está disponível'));
      }, { once: true });

      script.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('Falha ao carregar o script do Google Maps'));
      }, { once: true });
    });
  }

  private isReady(): boolean {
    return !!(window as any).google?.maps?.Map;
  }
}
