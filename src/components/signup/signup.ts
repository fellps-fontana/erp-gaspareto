import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth-service/auth-service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './signup.html',
  styleUrls: ['./signup.css'],
})
export class SignupComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  companyName = '';
  email = '';
  password = '';

  readonly loading = signal(false);
  readonly errorMessage = signal('');

  async submit(): Promise<void> {
    if (this.loading()) return;

    if (!this.companyName.trim() || !this.email.trim() || !this.password) {
      this.errorMessage.set('Preencha nome da empresa, email e senha. ⚠️');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');
    try {
      await this.authService.signup(this.email.trim(), this.password, this.companyName.trim());
      this.router.navigate(['/']);
    } catch (error) {
      this.errorMessage.set(this.mapError(error));
    } finally {
      this.loading.set(false);
    }
  }

  private mapError(error: unknown): string {
    const code = (error as { code?: string })?.code;

    if (code === 'auth/email-already-in-use') {
      return 'Este email já está cadastrado. Tente entrar ou use outro email. ❌';
    }

    if (code === 'auth/weak-password') {
      return 'A senha precisa ter pelo menos 6 caracteres. ⚠️';
    }

    if (code === 'auth/invalid-email') {
      return 'Email inválido. ⚠️';
    }

    return 'Não foi possível concluir o cadastro. Tente novamente. ❌';
  }
}
