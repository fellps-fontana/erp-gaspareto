import { CommonModule } from '@angular/common';
import { Component, DestroyRef, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ExpenseCategory, ExpenseCategoryType } from '../../models/expense-model';
import { ExpenseCategoryService } from '../../services/expense-category-service/expense-category-service';
import { NotificationService } from '../../services/notification-service/notification.service';

export const EXPENSE_CATEGORY_TYPE_LABELS: Record<ExpenseCategoryType, string> = {
  custo_producao: 'Custo de produção',
  despesa_operacional: 'Despesa operacional',
};

@Component({
  selector: 'app-expense-category-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './expense-category-manager.html',
  styleUrls: ['./expense-category-manager.css'],
})
export class ExpenseCategoryManagerComponent implements OnInit {
  private categoryService = inject(ExpenseCategoryService);
  private notif = inject(NotificationService);
  private destroyRef = inject(DestroyRef);

  /** Ids de categorias com despesa ou serie vinculada (calculado pelo pai): so podem ser arquivadas. */
  @Input() categoryIdsInUse: ReadonlySet<string> = new Set<string>();
  @Output() closed = new EventEmitter<void>();

  readonly typeLabels = EXPENSE_CATEGORY_TYPE_LABELS;
  readonly typeOptions: ExpenseCategoryType[] = ['custo_producao', 'despesa_operacional'];

  categorias: ExpenseCategory[] = [];
  carregando = true;

  novoNome = '';
  novoTipo: ExpenseCategoryType | '' = '';

  isCategoryDeleteModalOpen = false;
  categoryToDelete: ExpenseCategory | null = null;

  editandoId: string | null = null;
  nomeEditado = '';

  async ngOnInit(): Promise<void> {
    try {
      await this.categoryService.ensureDefaults();
    } catch (erro) {
      this.avisarErro(erro);
    }
    this.categoryService
      .getCategories()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((lista) => {
        this.categorias = lista;
        this.carregando = false;
      });
  }

  temVinculo(categoria: ExpenseCategory): boolean {
    return !!categoria.id && this.categoryIdsInUse.has(categoria.id);
  }

  async criar(): Promise<void> {
    if (this.carregando) {
      return;
    }
    const nome = this.novoNome.trim();
    if (!nome) {
      this.notif.warning('⚠️ Informe o nome da categoria');
      return;
    }
    if (!this.novoTipo) {
      this.notif.warning('⚠️ Escolha o tipo da categoria');
      return;
    }
    await this.executar(async () => {
      await this.categoryService.addCategory(nome, this.novoTipo as ExpenseCategoryType);
      this.novoNome = '';
      this.novoTipo = '';
      this.notif.success('✅ Categoria criada');
    });
  }

  iniciarRenomear(categoria: ExpenseCategory): void {
    this.editandoId = categoria.id ?? null;
    this.nomeEditado = categoria.name;
  }

  cancelarRenomear(): void {
    this.editandoId = null;
    this.nomeEditado = '';
  }

  async confirmarRenomear(categoria: ExpenseCategory): Promise<void> {
    const nome = this.nomeEditado.trim();
    if (!categoria.id) {
      return;
    }
    if (!nome) {
      this.notif.warning('⚠️ Informe o nome da categoria');
      return;
    }
    if (nome === categoria.name) {
      this.cancelarRenomear();
      return;
    }
    const id = categoria.id;
    await this.executar(async () => {
      await this.categoryService.renameCategory(id, nome);
      this.cancelarRenomear();
      this.notif.success('✅ Categoria renomeada');
    });
  }

  async alternarArquivo(categoria: ExpenseCategory): Promise<void> {
    if (!categoria.id) {
      return;
    }
    const id = categoria.id;
    const arquivar = !categoria.archived;
    await this.executar(async () => {
      await this.categoryService.setArchived(id, arquivar);
      this.notif.success(arquivar ? '✅ Categoria arquivada' : '✅ Categoria reativada');
    });
  }

  openCategoryDeleteModal(categoria: ExpenseCategory): void {
    if (!categoria.id || this.temVinculo(categoria)) {
      return;
    }
    this.categoryToDelete = categoria;
    this.isCategoryDeleteModalOpen = true;
  }

  closeCategoryDeleteModal(): void {
    this.isCategoryDeleteModalOpen = false;
    this.categoryToDelete = null;
  }

  async confirmCategoryDelete(): Promise<void> {
    const id = this.categoryToDelete?.id;
    if (!id) {
      return;
    }
    this.closeCategoryDeleteModal();
    await this.executar(async () => {
      await this.categoryService.deleteCategory(id);
      this.notif.success('✅ Categoria excluída');
    });
  }

  fechar(): void {
    this.closed.emit();
  }

  private async executar(acao: () => Promise<void>): Promise<void> {
    try {
      await acao();
    } catch (erro) {
      this.avisarErro(erro);
    }
  }

  private avisarErro(erro: unknown): void {
    const mensagem = erro instanceof Error ? erro.message : 'Não foi possível concluir a operação';
    this.notif.warning(`⚠️ ${mensagem}`);
  }
}
