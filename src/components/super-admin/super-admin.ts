import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppUser } from '../../models/user-model';
import { SuperAdminService } from '../../services/super-admin-service/super-admin-service';
import { AuthService } from '../../services/auth-service/auth-service';
import { NotificationService } from '../../services/notification-service/notification.service';

const ROLE_LABELS: Record<AppUser['role'], string> = {
  owner: 'Proprietário',
  admin: 'Administrador',
  employee: 'Funcionário',
};

const SENHA_MINIMA = 6;

@Component({
  selector: 'app-super-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './super-admin.html',
  styleUrls: ['./super-admin.css'],
})
export class SuperAdminComponent implements OnInit {
  private readonly superAdminService = inject(SuperAdminService);
  private readonly authService = inject(AuthService);
  private readonly notif = inject(NotificationService);

  users: AppUser[] = [];
  isLoading = true;
  loadError: string | null = null;

  // uid da linha com o formulário de "nova senha" aberto (só uma por vez).
  resetSenhaUid: string | null = null;
  novaSenha = '';
  isResetting = false;

  // uid da linha cujo checkbox de super-admin está com a escrita em andamento.
  savingSuperAdminUid: string | null = null;

  ngOnInit(): void {
    this.superAdminService.getUsers().subscribe({
      next: data => {
        this.users = data;
        this.isLoading = false;
        this.loadError = null;
      },
      error: error => {
        console.error('SuperAdmin: erro ao carregar usuários:', error);
        this.isLoading = false;
        this.loadError = 'Erro ao carregar usuários.';
      },
    });
  }

  roleLabel(role: AppUser['role']): string {
    return ROLE_LABELS[role] ?? role;
  }

  // Regra-de-negocio.md seção 13: setSuperAdmin nunca aceita targetUid === uid de quem chama.
  // O backend já bloqueia (HttpsError failed-precondition) — aqui só deixamos visualmente
  // claro que a ação não está disponível para o próprio usuário logado.
  isSelf(user: AppUser): boolean {
    return user.uid === this.authService.currentUser()?.uid;
  }

  abrirResetSenha(user: AppUser): void {
    this.resetSenhaUid = user.uid;
    this.novaSenha = '';
  }

  fecharResetSenha(): void {
    this.resetSenhaUid = null;
    this.novaSenha = '';
  }

  async confirmarResetSenha(user: AppUser): Promise<void> {
    if (this.novaSenha.trim().length < SENHA_MINIMA) {
      this.notif.warning(`A nova senha precisa ter no mínimo ${SENHA_MINIMA} caracteres.`);
      return;
    }

    this.isResetting = true;
    try {
      await this.superAdminService.resetUserPassword(user.uid, this.novaSenha.trim());
      this.notif.success(`Senha de ${user.email} redefinida com sucesso.`);
      this.fecharResetSenha();
    } catch (error: any) {
      console.error('SuperAdmin: erro ao redefinir senha:', error);
      this.notif.error(this.mensagemDeErro(error, 'Erro ao redefinir senha.'));
    } finally {
      this.isResetting = false;
    }
  }

  async toggleSuperAdmin(user: AppUser): Promise<void> {
    if (this.isSelf(user) || this.savingSuperAdminUid) {
      return;
    }

    const novoValor = !user.isSuperAdmin;
    this.savingSuperAdminUid = user.uid;
    try {
      await this.superAdminService.setSuperAdmin(user.uid, novoValor);
      this.notif.success(
        novoValor
          ? `${user.email} agora é super-admin.`
          : `${user.email} deixou de ser super-admin.`
      );
    } catch (error: any) {
      console.error('SuperAdmin: erro ao alterar permissão de super-admin:', error);
      this.notif.error(this.mensagemDeErro(error, 'Erro ao alterar permissão de super-admin.'));
    } finally {
      this.savingSuperAdminUid = null;
    }
  }

  // Cloud Functions rejeitam via HttpsError — o client SDK expõe a mensagem em `error.message`.
  // Nunca deixar erro silencioso: cai no fallback genérico se a Function não mandar mensagem.
  private mensagemDeErro(error: any, fallback: string): string {
    return typeof error?.message === 'string' && error.message.trim() ? error.message : fallback;
  }
}
