import { Injectable } from '@angular/core';

type ToastType = 'success' | 'error' | 'warning';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private el: HTMLElement | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;

  private getEl(): HTMLElement {
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.className = 'erp-toast';
      document.body.appendChild(this.el);
    }
    return this.el;
  }

  private show(message: string, type: ToastType): void {
    const el = this.getEl();
    if (this.timeout) clearTimeout(this.timeout);

    el.textContent = message;
    el.className = `erp-toast erp-toast--${type} erp-toast--visible`;

    this.timeout = setTimeout(() => {
      el.className = `erp-toast erp-toast--${type}`;
    }, 3000);
  }

  success(message: string): void { this.show(message, 'success'); }
  error(message: string): void { this.show(message, 'error'); }
  warning(message: string): void { this.show(message, 'warning'); }
}
