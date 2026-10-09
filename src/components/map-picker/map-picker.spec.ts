import { TestBed } from '@angular/core/testing';
import { MapPickerComponent } from './map-picker';
import { GeocodingService } from '../../services/geocoding-service/geocoding-service';
import { GoogleMapsLoaderService } from '../../services/google-maps-loader-service/google-maps-loader-service';

interface MapPickerInternals {
  map: unknown;
  setMarker: (lat: number, lng: number) => void;
}

describe('MapPickerComponent - busca por link/coordenada', () => {
  let component: MapPickerComponent;
  let geocoding: jasmine.SpyObj<GeocodingService>;
  let emitted: { lat: number; lng: number }[];
  let internals: MapPickerInternals;

  beforeEach(async () => {
    geocoding = jasmine.createSpyObj('GeocodingService', ['geocode', 'resolveShortMapsLink']);
    geocoding.geocode.and.resolveTo(null);
    geocoding.resolveShortMapsLink.and.resolveTo({ lat: -10, lng: -20 });

    await TestBed.configureTestingModule({
      imports: [MapPickerComponent],
      providers: [
        { provide: GeocodingService, useValue: geocoding },
        {
          provide: GoogleMapsLoaderService,
          useValue: { load: () => Promise.reject(new Error('sem Google Maps no teste')) },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(MapPickerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    internals = component as unknown as MapPickerInternals;
    internals.map = { setCenter: () => undefined, setZoom: () => undefined };
    spyOn(internals, 'setMarker');

    emitted = [];
    component.positionChange.subscribe(v => emitted.push(v));
  });

  // Sem Google Maps real, o ngOnDestroy não pode ver o map fake.
  afterEach(() => {
    internals.map = undefined;
  });

  async function search(term: string) {
    component.searchTerm = term;
    await component.onSearch();
  }

  it('aceita o texto do WhatsApp com prefixo "Localização: "', async () => {
    await search('Localização: https://maps.google.com/?q=-27.079844,-52.635666');
    expect(emitted).toEqual([{ lat: -27.079844, lng: -52.635666 }]);
    expect(geocoding.geocode).not.toHaveBeenCalled();
    expect(geocoding.resolveShortMapsLink).not.toHaveBeenCalled();
  });

  it('aceita o link puro de maps.google.com com q=lat,lng', async () => {
    await search('https://maps.google.com/?q=-27.079844,-52.635666');
    expect(emitted).toEqual([{ lat: -27.079844, lng: -52.635666 }]);
    expect(geocoding.geocode).not.toHaveBeenCalled();
  });

  it('decodifica q com %2C e +', async () => {
    await search('https://maps.google.com/?q=-27.07%2C+-52.63');
    expect(emitted).toEqual([{ lat: -27.07, lng: -52.63 }]);
  });

  it('aceita q=lat,lng(rótulo)', async () => {
    await search('https://maps.google.com/?q=-27.079844,-52.635666(Cliente)');
    expect(emitted).toEqual([{ lat: -27.079844, lng: -52.635666 }]);
  });

  it('aceita q=lat,lng&z=15', async () => {
    await search('https://maps.google.com/?q=-27.079844,-52.635666&z=15');
    expect(emitted).toEqual([{ lat: -27.079844, lng: -52.635666 }]);
  });

  it('ignora ponto final colado na URL do texto', async () => {
    await search('Localização: https://maps.google.com/?q=-27.079844,-52.635666.');
    expect(emitted).toEqual([{ lat: -27.079844, lng: -52.635666 }]);
  });

  it('aceita www.google.com.br/maps/@lat,lng', async () => {
    await search('https://www.google.com.br/maps/@-27.5,-52.2,15z');
    expect(emitted).toEqual([{ lat: -27.5, lng: -52.2 }]);
  });

  it('rejeita host forjado google.com.br.evil.com', async () => {
    await search('https://google.com.br.evil.com/maps/@-27.5,-52.2,15z');
    expect(emitted).toEqual([]);
  });

  it('prefere o pino !3d!4d ao centro da tela @lat,lng', async () => {
    await search(
      'https://www.google.com/maps/place/Cliente/@-27.5,-52.2,17z/data=!4m5!3m4!8m2!3d-27.0798!4d-52.6356',
    );
    expect(emitted).toEqual([{ lat: -27.0798, lng: -52.6356 }]);
  });

  it('aceita ?api=1&query=lat,lng em /maps/search/', async () => {
    await search('https://www.google.com/maps/search/?api=1&query=-27.07,-52.63');
    expect(emitted).toEqual([{ lat: -27.07, lng: -52.63 }]);
  });

  it('aceita /maps/dir/?api=1&destination=lat,lng', async () => {
    await search('https://www.google.com/maps/dir/?api=1&destination=-27.07,-52.63');
    expect(emitted).toEqual([{ lat: -27.07, lng: -52.63 }]);
  });

  it('aceita ?ll=lat,lng em maps.google.com', async () => {
    await search('https://maps.google.com/?ll=-27.07,-52.63');
    expect(emitted).toEqual([{ lat: -27.07, lng: -52.63 }]);
  });

  it('mantém suporte a google.com/maps/@lat,lng', async () => {
    await search('https://www.google.com/maps/@-27.5,-52.2,15z');
    expect(emitted).toEqual([{ lat: -27.5, lng: -52.2 }]);
  });

  it('mantém suporte a google.com/maps/search/lat,lng', async () => {
    await search('https://www.google.com/maps/search/-27.5,-52.2');
    expect(emitted).toEqual([{ lat: -27.5, lng: -52.2 }]);
  });

  it('google.com sem /maps no caminho não é link Maps', async () => {
    await search('https://www.google.com/search?q=-27.5,-52.2');
    expect(emitted).toEqual([]);
  });

  it('link curto resolve via serviço, com e sem texto em volta', async () => {
    await search('https://maps.app.goo.gl/abc123');
    await search('Localização: https://maps.app.goo.gl/abc123 enviado');
    expect(geocoding.resolveShortMapsLink.calls.allArgs()).toEqual([
      ['https://maps.app.goo.gl/abc123'],
      ['https://maps.app.goo.gl/abc123'],
    ]);
    expect(emitted).toEqual([
      { lat: -10, lng: -20 },
      { lat: -10, lng: -20 },
    ]);
  });

  it('rejeita host forjado google.com.attacker.io', async () => {
    await search('https://google.com.attacker.io/maps?q=-27,-52');
    expect(emitted).toEqual([]);
  });

  it('rejeita host forjado maps.google.com.evil.com', async () => {
    await search('https://maps.google.com.evil.com/?q=-27,-52');
    expect(emitted).toEqual([]);
  });

  it('coordenada fora da faixa não é reconhecida', async () => {
    await search('https://maps.google.com/?q=-91.5,-52.6');
    await search('https://maps.google.com/?q=-27.5,-181.5');
    expect(emitted).toEqual([]);
  });

  it('continua aceitando "lat, lng" cru', async () => {
    await search('-26.97, -52.72');
    expect(emitted).toEqual([{ lat: -26.97, lng: -52.72 }]);
  });

  describe('Apple Maps', () => {
    const expected = [{ lat: -27.0983, lng: -52.6261 }];

    it('aceita ?ll=lat,lng', async () => {
      await search('https://maps.apple.com/?ll=-27.0983,-52.6261&q=Nome');
      expect(emitted).toEqual(expected);
      expect(geocoding.geocode).not.toHaveBeenCalled();
    });

    it('aceita /place?coordinate=lat%2Clng', async () => {
      await search('https://maps.apple.com/place?coordinate=-27.0983%2C-52.6261&name=Nome');
      expect(emitted).toEqual(expected);
      expect(geocoding.geocode).not.toHaveBeenCalled();
    });

    it('usa ll quando vem junto de address', async () => {
      await search('https://maps.apple.com/?address=Rua%20X,%20Centro&ll=-27.0983,-52.6261');
      expect(emitted).toEqual(expected);
    });

    it('aceita daddr=lat,lng', async () => {
      await search('https://maps.apple.com/?daddr=-27.0983,-52.6261');
      expect(emitted).toEqual(expected);
    });

    it('aceita q=lat,lng', async () => {
      await search('https://maps.apple.com/?q=-27.0983,-52.6261');
      expect(emitted).toEqual(expected);
    });

    it('aceita sll=lat,lng', async () => {
      await search('https://maps.apple.com/?sll=-27.0983,-52.6261');
      expect(emitted).toEqual(expected);
    });

    it('prioriza coordinate sobre ll e sll', async () => {
      await search('https://maps.apple.com/?sll=-1,-2&ll=-3,-4&coordinate=-27.0983,-52.6261');
      expect(emitted).toEqual(expected);
    });

    it('rejeita host forjado maps.apple.com.evil.com', async () => {
      await search('https://maps.apple.com.evil.com/?ll=-27.0983,-52.6261');
      expect(emitted).toEqual([]);
    });

    it('coordenada fora da faixa não é reconhecida', async () => {
      await search('https://maps.apple.com/?ll=-91.5,-52.6');
      expect(emitted).toEqual([]);
    });
  });

  describe('Waze', () => {
    const expected = [{ lat: -27.0983, lng: -52.6261 }];

    it('aceita /ul?ll=lat,lng&navigate=yes', async () => {
      await search('https://waze.com/ul?ll=-27.0983,-52.6261&navigate=yes');
      expect(emitted).toEqual(expected);
      expect(geocoding.geocode).not.toHaveBeenCalled();
    });

    it('aceita ll com %2C', async () => {
      await search('https://waze.com/ul?ll=-27.0983%2C-52.6261&navigate=yes');
      expect(emitted).toEqual(expected);
    });

    it('aceita live-map/directions?to=ll.lat%2Clng em www.waze.com', async () => {
      await search('https://www.waze.com/pt-BR/live-map/directions?to=ll.-27.0983%2C-52.6261');
      expect(emitted).toEqual(expected);
      expect(geocoding.geocode).not.toHaveBeenCalled();
    });

    it('decodifica o geohash do link curto /ul/h<geohash>', async () => {
      await search('https://waze.com/ul/h6gkzwgu1f');
      expect(emitted.length).toBe(1);
      // Centro da célula de "6gkzwgu1f" (9 caracteres, ~5 m de precisão).
      expect(emitted[0].lat).toBeCloseTo(-25.37947, 4);
      expect(emitted[0].lng).toBeCloseTo(-49.26808, 4);
      expect(geocoding.geocode).not.toHaveBeenCalled();
    });

    it('geohash em maiúsculas decodifica igual ao minúsculo', async () => {
      await search('https://waze.com/ul/h6gkzwgu1f');
      await search('https://waze.com/ul/h6GKZWGU1F');
      expect(emitted.length).toBe(2);
      expect(emitted[1]).toEqual(emitted[0]);
    });

    it('to=ll.lat,lng fora da faixa não é reconhecido', async () => {
      await search('https://www.waze.com/pt-BR/live-map/directions?to=ll.-95.5,-52.6');
      expect(emitted).toEqual([]);
    });

    it('to sem prefixo "ll." não é reconhecido e cai no geocode', async () => {
      await search('https://www.waze.com/pt-BR/live-map/directions?to=-27.0983,-52.6261');
      expect(emitted).toEqual([]);
      expect(geocoding.geocode).toHaveBeenCalled();
    });

    it('rejeita host forjado waze.com.evil.io', async () => {
      await search('https://waze.com.evil.io/ul?ll=-27.0983,-52.6261');
      await search('https://waze.com.evil.io/ul/h6gkzwgu1f');
      expect(emitted).toEqual([]);
    });

    it('coordenada fora da faixa não é reconhecida', async () => {
      await search('https://waze.com/ul?ll=-27.5,-181.5');
      expect(emitted).toEqual([]);
    });
  });
});
