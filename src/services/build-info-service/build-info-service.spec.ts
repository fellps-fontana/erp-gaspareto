import { BuildInfoService } from './build-info-service';

describe('BuildInfoService', () => {
  let service: BuildInfoService;
  let fetchSpy: jasmine.Spy;

  const valid = {
    commit: 'fff3aaf',
    dirty: false,
    branch: 'main',
    deployedAt: '2026-10-09T17:32:00.000Z',
    project: 'projetosfelipe-9e458',
  };

  const respond = (body: () => Promise<unknown>, ok = true) =>
    fetchSpy.and.resolveTo({ ok, json: body } as unknown as Response);

  beforeEach(() => {
    service = new BuildInfoService();
    fetchSpy = spyOn(window, 'fetch');
  });

  it('retorna o objeto tipado quando o arquivo é válido', async () => {
    respond(async () => valid);
    expect(await service.getBuildInfo()).toEqual(valid);
    expect(fetchSpy).toHaveBeenCalledWith('/build-info.json', { cache: 'no-store' });
  });

  it('retorna null em 404', async () => {
    respond(async () => valid, false);
    expect(await service.getBuildInfo()).toBeNull();
  });

  it('retorna null em JSON inválido', async () => {
    respond(() => Promise.reject(new SyntaxError('Unexpected token <')));
    expect(await service.getBuildInfo()).toBeNull();
  });

  it('retorna null quando deployedAt é inválido', async () => {
    respond(async () => ({ ...valid, deployedAt: 'não é data' }));
    expect(await service.getBuildInfo()).toBeNull();
  });

  it('retorna null quando commit está ausente', async () => {
    respond(async () => ({ deployedAt: valid.deployedAt }));
    expect(await service.getBuildInfo()).toBeNull();
  });

  it('retorna null em falha de rede', async () => {
    fetchSpy.and.rejectWith(new TypeError('Failed to fetch'));
    expect(await service.getBuildInfo()).toBeNull();
  });
});
