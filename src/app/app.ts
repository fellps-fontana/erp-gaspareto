import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from '../services/theme/theme-service';

@Component({
  selector: 'app-root',
  standalone: true,

  imports: [CommonModule, RouterOutlet],
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
})
export class AppComponent {
  title = 'Bem vindo ao ERP Gaspareto!';

  constructor() {
    inject(ThemeService);
  }
}
