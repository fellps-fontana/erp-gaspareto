import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from '../services/theme/theme-service';
import { ConfigService } from '../services/config/config.service';
import { AppUpdateService } from '../services/app-update/app-update.service';
import { UpdateBannerComponent } from '../components/update-banner/update-banner';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, UpdateBannerComponent],
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
})
export class AppComponent {
  title = 'Bem vindo ao ERP Gaspareto!';

  constructor() {
    inject(ThemeService);
    inject(ConfigService);
    inject(AppUpdateService);
  }
}
