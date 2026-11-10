import { NotificationService } from '../../services/notification-service/notification.service';
import { RecorrenciaInvalidaError } from '../../services/recurring-order-service/recurrence-rules';
import { MENSAGENS_DE_RECORRENCIA, MENSAGEM_PADRAO_DE_RECORRENCIA } from './recurrence-labels';

/** Erro de agenda vira aviso em portugues por codigo; qualquer outro vira erro generico. */
export function notificarErroDeRecorrencia(notif: NotificationService, error: unknown): void {
  if (error instanceof RecorrenciaInvalidaError) {
    notif.warning(MENSAGENS_DE_RECORRENCIA[error.codigo] ?? MENSAGEM_PADRAO_DE_RECORRENCIA);
    return;
  }
  console.error(error);
  notif.error(MENSAGEM_PADRAO_DE_RECORRENCIA);
}

/** Acao sobre modelo existente: erro de agenda por codigo; Error comum (encerrado, so pausado) mostra a message. */
export function notificarErroDoModelo(notif: NotificationService, error: unknown): void {
  if (error instanceof Error && !(error instanceof RecorrenciaInvalidaError)) {
    console.error(error);
    notif.warning(error.message);
    return;
  }
  notificarErroDeRecorrencia(notif, error);
}
