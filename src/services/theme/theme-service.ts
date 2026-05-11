import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

const THEME_STORAGE_KEY = 'erp-gaspareto-theme';

function readStoredDark(): boolean {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'dark';
  } catch {
    return false;
  }
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  readonly isDarkTheme = signal(readStoredDark());

  constructor() {
    this.document.body.classList.toggle('dark-theme', this.isDarkTheme());
  }

  toggle(): void {
    const dark = !this.isDarkTheme();
    this.isDarkTheme.set(dark);
    this.document.body.classList.toggle('dark-theme', dark);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, dark ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
  }
}
