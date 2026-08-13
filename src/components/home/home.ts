import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ThemeService } from '../../services/theme/theme-service';
import { ConfigService } from '../../services/config/config.service';
import { CustomerService } from '../../services/customer-service/customer-service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home.html',
  styleUrls: ['./home.css'],
})
export class HomeComponent {
  readonly theme = inject(ThemeService);
  readonly config = inject(ConfigService);
  private readonly customerService = inject(CustomerService);

  // Lista de clientes que fazem aniversário hoje — usada pelo painel condicional
  // (visível só quando config.modules().notificacoes.aniversario está ligado).
  readonly aniversariantes = toSignal(this.customerService.getAniversariantesDoDia(), {
    initialValue: [],
  });
}
