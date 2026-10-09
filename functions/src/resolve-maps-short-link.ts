import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';

export interface ResolveMapsShortLinkInput {
  url: string;
}

export interface ResolveMapsShortLinkOutput {
  lat?: number;
  lng?: number;
  address?: string;
}

interface Coordinates {
  lat: number;
  lng: number;
}

type Destination =
  | { kind: 'coordinates'; lat: number; lng: number }
  | { kind: 'address'; address: string };

interface GeocodeResponse {
  status: string;
  results?: Array<{ geometry?: { location?: Coordinates } }>;
}

const geocodingApiKey = defineSecret('GOOGLE_GEOCODING_API_KEY');

const GEOCODE_ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json';
const GEOCODE_REGION = 'br';
const GEOCODE_LANGUAGE = 'pt-BR';
const GEOCODE_STATUS_OK = 'OK';
const REQUEST_TIMEOUT_MS = 5000;
const MAX_GEOCODE_ADDRESS_LENGTH = 300;
const MAX_INSTANCES = 10;
const UNKNOWN_ERROR_NAME = 'unknown';

const GOOGLE_MAPS_BASE_URL = 'https://www.google.com';
const MAPS_PATH_PREFIX = 'maps';
const DIR_PATH_SEGMENT = 'dir';
const PLACE_PATH_SEGMENT = 'place';
const METADATA_PATH_PREFIXES = ['@', 'data='];
const ADDRESS_QUERY_PARAMS = ['q', 'query', 'destination'];

const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;

// Padroes de coordenada em ordem de prioridade. Grupo 1 = lat, grupo 2 = lng.
const COORDINATE_URL_PATTERNS: RegExp[] = [
  /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, // pino exato do lugar
  /@(-?\d+\.\d+),(-?\d+\.\d+)/, // centro da viewport (nao e o pino)
  /[?&]q=(-?\d+\.\d+),\+?(-?\d+\.\d+)/,
  /\/search\/(-?\d+\.\d+),\+?(-?\d+\.\d+)/,
];

const COORDINATE_TEXT_PATTERN = /^(-?\d+\.\d+),\s*\+?(-?\d+\.\d+)$/;

/**
 * Resolve um link curto do Google Maps (maps.app.goo.gl ou goo.gl/maps) seguindo
 * o redirect HTTP do servidor (302) e extraindo a localizacao da URL de destino.
 * Evita CORS que ocorreria se feito no client.
 *
 * Prioridade de extracao:
 * 1. Coordenada da URL, na ordem: pino exato (!3d!4d), @lat,lng, q=lat,lng, /search/lat,+lng.
 * 2. Texto de endereco, na ordem: q, query, destination, destino de /maps/dir/<a>/<b>/,
 *    nome de /maps/place/<nome>/. Se o texto for "lat,lng", vira coordenada.
 * 3. Com texto de endereco, geocodifica no servidor (Google Geocoding API). Se a
 *    geocodificacao falhar (sem chave, status != OK, timeout, rede), retorna { address }
 *    e o client faz o proprio fallback.
 *
 * Qualquer usuário autenticado pode chamar.
 *
 * @param url - URL curta do Google Maps (maps.app.goo.gl ou goo.gl/maps/...)
 * @returns { lat, lng } se coordenada encontrada ou geocodificada, ou { address } se
 *          so houver endereco de texto (ou geocodificacao falhou)
 *
 * @throws HttpsError('unauthenticated') se chamada sem autenticação
 * @throws HttpsError('invalid-argument') se url tiver host não autorizado (anti-SSRF)
 * @throws HttpsError('not-found') se redirect não retornar Location ou nenhuma coordenada/endereço for encontrado
 */
export const resolveMapsShortLink = onCall<ResolveMapsShortLinkInput>(
  { region: 'us-central1', secrets: [geocodingApiKey], maxInstances: MAX_INSTANCES },
  async (request: CallableRequest<ResolveMapsShortLinkInput>): Promise<ResolveMapsShortLinkOutput> => {
    // Validar autenticação
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Autenticação obrigatória');
    }

    const { url } = request.data;

    // Validar e fazer parse da URL
    let urlObj: URL;
    try {
      urlObj = new URL(url);
    } catch {
      throw new HttpsError('invalid-argument', 'URL inválida');
    }

    // Validar host contra SSRF: permitir apenas maps.app.goo.gl ou goo.gl/maps
    const isValidHost = isAuthorizedHost(urlObj);
    if (!isValidHost) {
      throw new HttpsError(
        'invalid-argument',
        'Host não autorizado. Use maps.app.goo.gl ou goo.gl/maps'
      );
    }

    // Fazer fetch com redirect manual para ler só o header Location
    let response: Response;
    try {
      response = await withTimeout((signal) => fetch(url, { redirect: 'manual', signal }));
    } catch (error) {
      console.error('Falha ao buscar link curto', describeErrorName(error));
      throw new HttpsError('internal', 'Erro ao processar link. Tente novamente.');
    }

    // Verificar se é um redirect (3xx)
    if (!response.status.toString().startsWith('3')) {
      throw new HttpsError(
        'internal',
        `Esperado redirect (3xx), recebido ${response.status}`
      );
    }

    // Ler header Location
    const location = response.headers.get('location');
    if (!location) {
      throw new HttpsError('not-found', 'Header Location não encontrado no redirect');
    }

    // Extrair coordenadas ou endereço da URL de destino
    const destination = extractDestination(location);
    if (!destination) {
      throw new HttpsError(
        'not-found',
        'Não foi possível extrair coordenadas ou endereço da URL de destino'
      );
    }

    if (destination.kind === 'coordinates') {
      return { lat: destination.lat, lng: destination.lng };
    }

    const coordinates = await geocodeAddress(destination.address, geocodingApiKey.value());
    return coordinates ?? { address: destination.address };
  }
);

/**
 * Valida se o host da URL é autorizado (anti-SSRF).
 * Autoriza:
 * - maps.app.goo.gl com protocolo HTTPS (qualquer path)
 * - goo.gl/maps com protocolo HTTPS (path exatamente /maps ou /maps/...)
 */
function isAuthorizedHost(urlObj: URL): boolean {
  // Exigir HTTPS
  if (urlObj.protocol !== 'https:') {
    return false;
  }

  const host = urlObj.hostname?.toLowerCase();
  const path = urlObj.pathname;

  // maps.app.goo.gl
  if (host === 'maps.app.goo.gl') {
    return true;
  }

  // goo.gl/maps (aceitar /maps ou /maps/..., mas não /mapsXYZ)
  if (host === 'goo.gl' && (path === '/maps' || path.startsWith('/maps/'))) {
    return true;
  }

  return false;
}

/**
 * Decide o destino da URL do redirect: coordenada direta, ou texto de endereco
 * a ser geocodificado. Coordenada sempre tem prioridade sobre texto.
 *
 * @returns Destination ou null se nada util for encontrado
 */
function extractDestination(location: string): Destination | null {
  const urlCoordinates = extractCoordinatesFromUrl(location);
  if (urlCoordinates) {
    return { kind: 'coordinates', ...urlCoordinates };
  }

  const addressText = extractAddressText(location);
  if (!addressText) {
    return null;
  }

  const textCoordinates = extractCoordinatesFromText(addressText);
  if (textCoordinates) {
    return { kind: 'coordinates', ...textCoordinates };
  }

  return { kind: 'address', address: addressText };
}

/**
 * Procura coordenada nos padroes da URL, na ordem de prioridade. Padrao com
 * faixa invalida e ignorado e a busca segue para o proximo padrao.
 */
function extractCoordinatesFromUrl(destinationUrl: string): Coordinates | null {
  for (const pattern of COORDINATE_URL_PATTERNS) {
    const match = destinationUrl.match(pattern);
    const coordinates = match ? toValidCoordinates(match[1], match[2]) : null;
    if (coordinates) {
      return coordinates;
    }
  }

  return null;
}

/**
 * Interpreta um texto no formato "lat,lng" (ex: valor de q ou segmento de rota).
 */
function extractCoordinatesFromText(text: string): Coordinates | null {
  const match = text.trim().match(COORDINATE_TEXT_PATTERN);
  return match ? toValidCoordinates(match[1], match[2]) : null;
}

/**
 * Extrai o primeiro texto de endereco util da URL de destino, na ordem:
 * parametros q/query/destination, destino de /maps/dir/, nome de /maps/place/.
 *
 * @returns texto nao-vazio ou null
 */
function extractAddressText(location: string): string | null {
  const parsedUrl = parseLocation(location);
  if (!parsedUrl) {
    return null;
  }

  return extractQueryParamText(parsedUrl) ?? extractPathText(parsedUrl);
}

function extractQueryParamText(parsedUrl: URL): string | null {
  for (const paramName of ADDRESS_QUERY_PARAMS) {
    const value = parsedUrl.searchParams.get(paramName)?.trim();
    if (value) {
      return value;
    }
  }

  return null;
}

/**
 * Extrai texto de endereco do caminho: ultimo segmento da rota em /maps/dir/<a>/<b>/
 * ou o segmento logo apos /maps/place/. Segmentos de metadado (@..., data=...) sao ignorados.
 */
function extractPathText(parsedUrl: URL): string | null {
  const segments = parsedUrl.pathname
    .split('/')
    .filter((segment) => segment && !isMetadataPathSegment(segment))
    .map(decodePathSegment);

  if (segments[0] !== MAPS_PATH_PREFIX) {
    return null;
  }

  if (segments[1] === DIR_PATH_SEGMENT) {
    return segments.slice(2).filter(Boolean).pop() ?? null;
  }

  if (segments[1] === PLACE_PATH_SEGMENT) {
    return segments[2] || null;
  }

  return null;
}

function isMetadataPathSegment(rawSegment: string): boolean {
  return METADATA_PATH_PREFIXES.some((prefix) => rawSegment.startsWith(prefix));
}

function decodePathSegment(rawSegment: string): string {
  const withSpaces = rawSegment.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(withSpaces).trim();
  } catch {
    return withSpaces.trim();
  }
}

function parseLocation(location: string): URL | null {
  try {
    return new URL(location, GOOGLE_MAPS_BASE_URL);
  } catch {
    return null;
  }
}

function toValidCoordinates(latText: string, lngText: string): Coordinates | null {
  const lat = parseFloat(latText);
  const lng = parseFloat(lngText);
  return isValidCoordinates(lat, lng) ? { lat, lng } : null;
}

function isValidCoordinates(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= MAX_LATITUDE &&
    Math.abs(lng) <= MAX_LONGITUDE
  );
}

/**
 * Geocodifica um endereco via Google Geocoding API. Nunca lanca: qualquer falha
 * (sem chave, rede, timeout, status != OK) retorna null.
 *
 * @returns coordenada do primeiro resultado, ou null
 */
async function geocodeAddress(address: string, apiKey: string): Promise<Coordinates | null> {
  if (!apiKey || address.length > MAX_GEOCODE_ADDRESS_LENGTH) {
    return null;
  }

  try {
    return await withTimeout(async (signal) => {
      const response = await fetch(buildGeocodeUrl(address, apiKey), { signal });
      if (!response.ok) {
        return null;
      }

      const body = (await response.json()) as GeocodeResponse;
      return firstGeocodedCoordinates(body);
    });
  } catch (error) {
    console.error('Falha ao geocodificar endereco do link', describeErrorName(error));
    return null;
  }
}

/**
 * Ponto unico de AbortController para as chamadas HTTP da function. O timer cobre
 * a operacao inteira (fetch + leitura do corpo, se houver) e so e limpo ao fim dela.
 */
async function withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Nome do erro para log. Nunca loga o objeto cru (pode carregar URL com chave).
 */
function describeErrorName(error: unknown): string {
  return error instanceof Error ? error.name : UNKNOWN_ERROR_NAME;
}

function buildGeocodeUrl(address: string, apiKey: string): string {
  const params = new URLSearchParams({
    address,
    region: GEOCODE_REGION,
    language: GEOCODE_LANGUAGE,
    key: apiKey,
  });
  return `${GEOCODE_ENDPOINT}?${params.toString()}`;
}

function firstGeocodedCoordinates(body: GeocodeResponse): Coordinates | null {
  if (body.status !== GEOCODE_STATUS_OK) {
    return null;
  }

  const location = body.results?.[0]?.geometry?.location;
  if (!location || !isValidCoordinates(location.lat, location.lng)) {
    return null;
  }

  return { lat: location.lat, lng: location.lng };
}
