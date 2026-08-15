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

    this.searchLoading = true;
    this.searchError = '';
    try {
      const result = await this.geocodingService.geocode(term);
      if (result) {
        this.centerMap(result.lat, result.lng);
      } else {
        this.searchError = 'Endereço não encontrado. Tente refinar a busca.';
      }
    } finally {
      this.searchLoading = false;
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
