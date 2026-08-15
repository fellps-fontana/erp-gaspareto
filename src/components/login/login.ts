import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth-service/auth-service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrls: ['./login.css'],
})
export class LoginComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  email = '';
  password = '';

  readonly loading = signal(false);
  readonly errorMessage = signal('');

  async submit(): Promise<void> {
    if (this.loading()) return;

    if (!this.email.trim() || !this.password) {
      this.errorMessage.set('Preencha email e senha. ⚠️');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');
    try {
      await this.authService.login(this.email.trim(), this.password);
      this.router.navigate(['/']);
    } catch {
      this.errorMessage.set('Email ou senha inválidos. ❌');
    } finally {
      this.loading.set(false);
    }
  }
}
