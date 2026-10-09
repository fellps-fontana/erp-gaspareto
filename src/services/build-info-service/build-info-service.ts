import { Injectable } from '@angular/core';
import { BuildInfo } from '../../models/build-info-model';

@Injectable({ providedIn: 'root' })
export class BuildInfoService {
  // Busca /build-info.json (gerado no deploy). Em ng serve/testes o arquivo não existe (404):
  // qualquer falha (rede, status, JSON inválido, formato inesperado) resulta em null.
  async getBuildInfo(): Promise<BuildInfo | null> {
    try {
      const response = await fetch('/build-info.json', { cache: 'no-store' });
      if (!response.ok) return null;
      return this.parse(await response.json());
    } catch {
      return null;
    }
  }

  private parse(raw: unknown): BuildInfo | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const data = raw as Record<string, unknown>;
    if (typeof data['commit'] !== 'string' || !data['commit']) return null;
    if (typeof data['deployedAt'] !== 'string' || Number.isNaN(Date.parse(data['deployedAt']))) {
      return null;
    }
    return {
      commit: data['commit'],
      deployedAt: data['deployedAt'],
      dirty: data['dirty'] === true,
      branch: typeof data['branch'] === 'string' ? data['branch'] : undefined,
      project: typeof data['project'] === 'string' ? data['project'] : undefined,
    };
  }
}
