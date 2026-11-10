import { Component, inject, signal } from '@angular/core';
import { AppUpdateService } from '../../services/app-update/app-update.service';

@Component({
  selector: 'app-update-banner',
  standalone: true,
  templateUrl: './update-banner.html',
  styleUrls: ['./update-banner.css'],
})
export class UpdateBannerComponent {
  private updates = inject(AppUpdateService);

  readonly updateAvailable = this.updates.updateAvailable;
  readonly dispensado = signal(false);

  atualizar() {
    this.updates.applyUpdate();
  }

  dispensar() {
    this.dispensado.set(true);
  }
}
