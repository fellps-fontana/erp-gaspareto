/// <reference types="google.maps" />
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GeocodingService } from '../../services/geocoding-service/geocoding-service';
import { GoogleMapsLoaderService } from '../../services/google-maps-loader-service/google-maps-loader-service';

// Centro genérico do Brasil, usado quando não há posição salva nem
// geolocalização do navegador disponível — o usuário navega manualmente.
const BRAZIL_FALLBACK_CENTER: google.maps.LatLngLiteral = { lat: -14.235, lng: -51.9253 };
const BRAZIL_FALLBACK_ZOOM = 4;

// Aceita "lat, lng" (com ou sem espaço, ponto decimal) digitado direto na
// busca — ex: "-26.978381662252843, -52.72869855561712" — pra centralizar
// sem depender do geocoder, que não resolve coordenadas cruas.
const LAT_LNG_PATTERN = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;

// Padrões de link LONGO do Google Maps que já carregam a coordenada no
// próprio texto da URL — resolvem sem chamar geocode nem Cloud Function.
const MAPS_LINK_COORD_PATTERNS = [
  /@(-?\d+\.\d+),(-?\d+\.\d+)/,
  /[?&]q=(-?\d+\.\d+),\+?(-?\d+\.\d+)/,
  /\/search\/(-?\d+\.\d+),\+?(-?\d+\.\d+)/,
];

// Hosts legítimos do Google Maps — comparação exata (nunca substring), pra
// não aceitar domínio forjado tipo "google.com.attacker.io".
const GOOGLE_MAPS_HOSTS = new Set(['www.google.com', 'google.com', 'maps.google.com']);

const SEARCH_NOT_FOUND_ERROR = 'Endereço não encontrado. Tente refinar a busca.';

@Component({
  selector: 'app-map-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './map-picker.html',
  styleUrls: ['./map-picker.css'],
})
export class MapPickerComponent implements AfterViewInit, OnChanges, OnDestroy {
  private geocodingService = inject(GeocodingService);
  private googleMapsLoader = inject(GoogleMapsLoaderService);

  @Input() lat?: number;
  @Input() lng?: number;
  @Input() zoom = 15;
  @Output() positionChange = new EventEmitter<{ lat: number; lng: number }>();

  @ViewChild('mapContainer', { static: true }) mapContainerRef!: ElementRef<HTMLDivElement>;

  searchTerm = '';
  searchLoading = false;
  searchError = '';
  mapLoadError = '';

  private map?: google.maps.Map;
  private marker?: google.maps.Marker;
  private viewInitialized = false;

  async ngAfterViewInit() {
    try {
      await this.googleMapsLoader.load();
    } catch {
      this.mapLoadError = 'Não foi possível carregar o mapa. Verifique a conexão e recarregue a página.';
      return;
    }

    this.map = new google.maps.Map(this.mapContainerRef.nativeElement, {
      center: BRAZIL_FALLBACK_CENTER,
      zoom: BRAZIL_FALLBACK_ZOOM,
    });

    this.map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const clickedLat = e.latLng.lat();
      const clickedLng = e.latLng.lng();
      this.setMarker(clickedLat, clickedLng);
      this.positionChange.emit({ lat: clickedLat, lng: clickedLng });
    });

    if (this.lat != null && this.lng != null) {
      this.centerMap(this.lat, this.lng);
      this.setMarker(this.lat, this.lng);
    } else {
      const current = await this.getCurrentPosition();
      if (current) {
        this.centerMap(current.lat, current.lng);
      } else {
        this.centerMap(BRAZIL_FALLBACK_CENTER.lat, BRAZIL_FALLBACK_CENTER.lng, BRAZIL_FALLBACK_ZOOM);
      }
    }

    this.viewInitialized = true;
  }

  ngOnChanges(changes: SimpleChanges) {
    if (!this.viewInitialized || !this.map) return;
    if (('lat' in changes || 'lng' in changes) && this.lat != null && this.lng != null) {
      this.centerMap(this.lat, this.lng);
      this.setMarker(this.lat, this.lng);
    }
  }

  ngOnDestroy() {
    if (this.marker) google.maps.event.clearInstanceListeners(this.marker);
    if (this.map) google.maps.event.clearInstanceListeners(this.map);
    this.marker = undefined;
    this.map = undefined;
  }

  async onSearch() {
    const term = this.searchTerm.trim();
    if (!term || !this.map) return;

    if (this.isShortMapsLink(term)) {
      this.searchLoading = true;
      this.searchError = '';
      try {
        const result = await this.geocodingService.resolveShortMapsLink(term);
        if (result) {
          this.centerMap(result.lat, result.lng);
          this.setMarker(result.lat, result.lng);
          this.positionChange.emit({ lat: result.lat, lng: result.lng });
        } else {
          this.searchError = SEARCH_NOT_FOUND_ERROR;
        }
      } finally {
        this.searchLoading = false;
      }
      return;
    }

    const mapsLinkCoords = this.extractCoordsFromMapsLink(term);
    if (mapsLinkCoords) {
      this.centerMap(mapsLinkCoords.lat, mapsLinkCoords.lng);
      this.setMarker(mapsLinkCoords.lat, mapsLinkCoords.lng);
      this.positionChange.emit(mapsLinkCoords);
      return;
    }

    const coords = term.match(LAT_LNG_PATTERN);
    if (coords) {
      const searchedLat = parseFloat(coords[1]);
      const searchedLng = parseFloat(coords[2]);
      this.centerMap(searchedLat, searchedLng);
      this.setMarker(searchedLat, searchedLng);
      this.positionChange.emit({ lat: searchedLat, lng: searchedLng });
      return;
    }

    this.searchLoading = true;
    this.searchError = '';
    try {
      const result = await this.geocodingService.geocode(term);
      if (result) {
        this.centerMap(result.lat, result.lng);
      } else {
        this.searchError = SEARCH_NOT_FOUND_ERROR;
      }
    } finally {
      this.searchLoading = false;
    }
  }

  // Link curto (maps.app.goo.gl / goo.gl/maps) não carrega coordenada no
  // texto — precisa resolver o redirect via Cloud Function.
  private isShortMapsLink(term: string): boolean {
    const url = this.tryParseUrl(term);
    if (!url) return false;
    const host = url.hostname.toLowerCase();
    if (host === 'maps.app.goo.gl') return true;
    if (host === 'goo.gl' && url.pathname.startsWith('/maps')) return true;
    return false;
  }

  // Link longo do Google Maps já carrega a coordenada na própria URL —
  // extrai sem chamar geocode nem Cloud Function.
  private extractCoordsFromMapsLink(term: string): { lat: number; lng: number } | null {
    const url = this.tryParseUrl(term);
    if (!url) return null;
    const host = url.hostname.toLowerCase();
    if (!GOOGLE_MAPS_HOSTS.has(host) || !url.pathname.includes('/maps')) return null;

    for (const pattern of MAPS_LINK_COORD_PATTERNS) {
      const match = term.match(pattern);
      if (match) {
        return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
      }
    }
    return null;
  }

  private tryParseUrl(term: string): URL | null {
    try {
      return new URL(term);
    } catch {
      return null;
    }
  }

  private centerMap(lat: number, lng: number, zoom = this.zoom) {
    if (!this.map) return;
    this.map.setCenter({ lat, lng });
    this.map.setZoom(zoom);
  }

  private setMarker(lat: number, lng: number) {
    if (!this.map) return;
    if (this.marker) {
      this.marker.setPosition({ lat, lng });
      return;
    }
    this.marker = new google.maps.Marker({ position: { lat, lng }, map: this.map, draggable: true });
    this.marker.addListener('dragend', (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      this.positionChange.emit({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    });
  }

  private getCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
    return new Promise(resolve => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        p  => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { timeout: 5000 }
      );
    });
  }
}
