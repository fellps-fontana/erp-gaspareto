import { Injectable, inject } from '@angular/core';
import { environment } from '../../enviroments/enviroments';

export interface GeocodeResult {
  lat: number;
  lng: number;
}

export interface ReverseGeocodeResult {
  rua?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  address: string;
}

interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface GoogleGeocodeResponse {
  status: string;
  results: Array<{
    address_components: GoogleAddressComponent[];
    formatted_address: string;
  }>;
}

@Injectable({ providedIn: 'root' })
export class GeocodingService {
  geocode(address: string): Promise<GeocodeResult | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=br`;
      return fetch(url, { signal: controller.signal, headers: { 'Accept-Language': 'pt-BR' } })
        .then(res => res.json())
        .then(data => {
          if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
          return null;
        })
        .catch(() => null)
        .finally(() => clearTimeout(timer));
    } catch {
      clearTimeout(timer);
      return Promise.resolve(null);
    }
  }

  async reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${environment.googleMapsApiKey}&language=pt-BR&region=BR`;
      const res = await fetch(url, { signal: controller.signal });
      const data: GoogleGeocodeResponse = await res.json();

      if (data.status !== 'OK' || !data.results || data.results.length === 0) {
        return null;
      }

      const result = data.results[0];
      const components = result.address_components;

      const rua = this.extractAddressComponent(components, ['route']);
      const bairro = this.extractAddressComponent(components, ['sublocality_level_1', 'sublocality', 'neighborhood']);
      const cidade = this.extractAddressComponent(components, ['locality', 'administrative_area_level_2']);
      const uf = this.extractAddressComponent(components, ['administrative_area_level_1'], true);
      const cep = this.extractAddressComponent(components, ['postal_code']);

      const addressStr = this.formatAddress(rua, bairro, cidade, uf);

      return {
        rua,
        bairro,
        cidade,
        uf,
        cep,
        address: addressStr
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private extractAddressComponent(components: GoogleAddressComponent[], types: string[], useShortName: boolean = false): string | undefined {
    for (const type of types) {
      const match = components.find(c => c.types.includes(type));
      if (match) return useShortName ? match.short_name : match.long_name;
    }
    return undefined;
  }

  private formatAddress(rua?: string, bairro?: string, cidade?: string, uf?: string): string {
    const parts: string[] = [];
    if (rua) parts.push(rua);
    if (bairro) parts.push(bairro);
    if (cidade) parts.push(cidade);
    const cityPart = parts.join(', ');
    return uf ? `${cityPart} - ${uf}` : cityPart;
  }
}
