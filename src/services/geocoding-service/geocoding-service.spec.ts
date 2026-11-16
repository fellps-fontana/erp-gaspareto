import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Functions } from '@angular/fire/functions';
import { GeocodingService } from './geocoding-service';

describe('GeocodingService.reverseGeocode', () => {
  let service: GeocodingService;
  let originalGoogle: unknown;

  const win = window as unknown as { google?: unknown };

  function mockGeocoder(geocode: jasmine.Spy): void {
    win.google = {
      maps: {
        Geocoder: function () {
          return { geocode };
        }
      }
    };
  }

  beforeEach(() => {
    originalGoogle = win.google;
    TestBed.configureTestingModule({
      providers: [{ provide: Functions, useValue: {} }]
    });
    service = TestBed.inject(GeocodingService);
  });

  afterEach(() => {
    win.google = originalGoogle;
  });

  it('mapeia os componentes do Geocoder para ReverseGeocodeResult', async () => {
    const geocode = jasmine.createSpy('geocode').and.resolveTo({
      results: [
        {
          address_components: [
            { long_name: 'Avenida Fernando Machado', short_name: 'Av. Fernando Machado', types: ['route'] },
            { long_name: '2690', short_name: '2690', types: ['street_number'] },
            { long_name: 'Centro', short_name: 'Centro', types: ['sublocality_level_1'] },
            { long_name: 'Chapecó', short_name: 'Chapecó', types: ['locality'] },
            { long_name: 'Santa Catarina', short_name: 'SC', types: ['administrative_area_level_1'] },
            { long_name: '89801-000', short_name: '89801-000', types: ['postal_code'] }
          ],
          formatted_address: 'qualquer'
        }
      ]
    });
    mockGeocoder(geocode);

    const result = await service.reverseGeocode(-27.1, -52.6);

    expect(geocode).toHaveBeenCalledWith(
      jasmine.objectContaining({ location: { lat: -27.1, lng: -52.6 } })
    );
    expect(result).toEqual({
      rua: 'Avenida Fernando Machado',
      numero: '2690',
      bairro: 'Centro',
      cidade: 'Chapecó',
      uf: 'SC',
      cep: '89801-000',
      address: 'Avenida Fernando Machado, Centro, Chapecó - SC'
    });
  });

  it('retorna null quando o geocode rejeita', async () => {
    mockGeocoder(jasmine.createSpy('geocode').and.rejectWith(new Error('ZERO_RESULTS')));

    expect(await service.reverseGeocode(0, 0)).toBeNull();
  });

  it('retorna null quando google não está definido', async () => {
    win.google = undefined;

    expect(await service.reverseGeocode(0, 0)).toBeNull();
  });

  it('retorna null quando não há resultados', async () => {
    mockGeocoder(jasmine.createSpy('geocode').and.resolveTo({ results: [] }));

    expect(await service.reverseGeocode(0, 0)).toBeNull();
  });

  it('retorna null após 5s quando o geocode nunca resolve', fakeAsync(() => {
    mockGeocoder(jasmine.createSpy('geocode').and.returnValue(new Promise(() => undefined)));
    let result: unknown = 'pendente';

    service.reverseGeocode(0, 0).then(r => (result = r));
    tick(4999);
    expect(result).toBe('pendente');
    tick(1);

    expect(result).toBeNull();
  }));

  it('retorna null quando google.maps.Geocoder está ausente', async () => {
    win.google = {};

    expect(await service.reverseGeocode(0, 0)).toBeNull();
  });
});
