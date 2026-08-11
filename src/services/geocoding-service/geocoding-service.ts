import { Injectable, inject } from '@angular/core';

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

interface NominatimReverseResponse {
  address?: {
    road?: string;
    suburb?: string;
    neighbourhood?: string;
    city?: string;
    town?: string;
    village?: string;
    postcode?: string;
    'ISO3166-2-lvl4'?: string;
  };
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
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=pt-BR&zoom=18`;
      const res = await fetch(url, { signal: controller.signal });
      const data: NominatimReverseResponse = await res.json();

      if (!data.address) return null;

      const addr = data.address;
      const rua = addr.road;
      const bairro = addr.suburb ?? addr.neighbourhood;
      const cidade = addr.city ?? addr.town ?? addr.village;
      const uf = addr['ISO3166-2-lvl4'] ? addr['ISO3166-2-lvl4'].split('-')[1] : undefined;
      const cep = addr.postcode;

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

  private formatAddress(rua?: string, bairro?: string, cidade?: string, uf?: string): string {
    const parts: string[] = [];
    if (rua) parts.push(rua);
    if (bairro) parts.push(bairro);
    if (cidade) parts.push(cidade);
    const cityPart = parts.join(', ');
    return uf ? `${cityPart} - ${uf}` : cityPart;
  }
}
