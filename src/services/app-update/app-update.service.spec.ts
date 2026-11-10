import { TestBed } from '@angular/core/testing';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { AppUpdateService } from './app-update.service';

describe('AppUpdateService', () => {
  let versionUpdates: Subject<VersionEvent>;
  let swUpdate: {
    isEnabled: boolean;
    versionUpdates: Subject<VersionEvent>;
    unrecoverable: Subject<unknown>;
    checkForUpdate: jasmine.Spy;
    activateUpdate: jasmine.Spy;
  };

  function criar(isEnabled: boolean): AppUpdateService {
    versionUpdates = new Subject<VersionEvent>();
    swUpdate = {
      isEnabled,
      versionUpdates,
      unrecoverable: new Subject<unknown>(),
      checkForUpdate: jasmine.createSpy('checkForUpdate').and.resolveTo(false),
      activateUpdate: jasmine.createSpy('activateUpdate').and.resolveTo(true),
    };
    TestBed.configureTestingModule({ providers: [{ provide: SwUpdate, useValue: swUpdate }] });
    return TestBed.inject(AppUpdateService);
  }

  it('VERSION_READY liga updateAvailable', () => {
    const service = criar(true);
    expect(service.updateAvailable()).toBeFalse();
    versionUpdates.next({ type: 'VERSION_DETECTED' } as VersionEvent);
    expect(service.updateAvailable()).toBeFalse();
    versionUpdates.next({ type: 'VERSION_READY' } as VersionEvent);
    expect(service.updateAvailable()).toBeTrue();
  });

  it('checa atualizacao no start e quando a aba volta a ficar visivel', () => {
    criar(true);
    expect(swUpdate.checkForUpdate).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(swUpdate.checkForUpdate).toHaveBeenCalledTimes(2);
  });

  it('erro em checkForUpdate e ignorado', async () => {
    const service = criar(true);
    swUpdate.checkForUpdate.and.rejectWith(new Error('offline'));
    spyOn(console, 'warn');
    await expectAsync(service.checkForUpdate()).toBeResolved();
    expect(console.warn).toHaveBeenCalled();
  });

  it('applyUpdate chama activateUpdate', async () => {
    const service = criar(true);
    const reload = spyOn(service, 'reloadPage');
    await service.applyUpdate();
    expect(swUpdate.activateUpdate).toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();
  });

  it('isEnabled false nao chama nada', async () => {
    const service = criar(false);
    await service.checkForUpdate();
    await service.applyUpdate();
    expect(swUpdate.checkForUpdate).not.toHaveBeenCalled();
    expect(swUpdate.activateUpdate).not.toHaveBeenCalled();
  });
});
