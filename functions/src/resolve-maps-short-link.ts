import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';

export interface ResolveMapsShortLinkInput {
  url: string;
}

export interface ResolveMapsShortLinkOutput {
  lat: number;
  lng: number;
}

/**
 * Resolve um link curto do Google Maps (maps.app.goo.gl ou goo.gl/maps) seguindo
 * o redirect HTTP do servidor (302) e extraindo as coordenadas lat/lng da URL
 * de destino. Evita CORS que ocorreria se feito no client.
 *
 * Qualquer usuário autenticado pode chamar.
 *
 * @param url - URL curta do Google Maps (maps.app.goo.gl ou goo.gl/maps/...)
 * @returns lat e lng extraídos da URL de destino do redirect
 *
 * @throws HttpsError('unauthenticated') se chamada sem autenticação
 * @throws HttpsError('invalid-argument') se url tiver host não autorizado (anti-SSRF)
 * @throws HttpsError('not-found') se redirect não retornar Location ou coordenadas não forem encontradas
 */
export const resolveMapsShortLink = onCall<ResolveMapsShortLinkInput>(
  { region: 'us-central1' },
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
      response = await fetch(url, { redirect: 'manual' });
    } catch (error) {
      console.error('Erro ao fazer fetch do link curto:', error);
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

    // Extrair lat/lng da URL de destino
    const coords = extractCoordinates(location);
    if (!coords) {
      throw new HttpsError(
        'not-found',
        'Não foi possível extrair coordenadas da URL de destino'
      );
    }

    return coords;
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
 * Extrai lat/lng da URL de destino do Google Maps.
 * Tenta 3 padrões em ordem:
 * 1. @lat,lng (ex: /maps/@27.084450,-52.647169,zoom)
 * 2. q=lat,lng (ex: ?q=27.084450,-52.647169)
 * 3. /search/lat,+lng (ex: /maps/search/27.084450,+-52.647169)
 *
 * @returns { lat, lng } se encontrado, null caso contrário
 */
function extractCoordinates(url: string): ResolveMapsShortLinkOutput | null {
  // Padrão 1: @lat,lng
  const pattern1 = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
  const match1 = url.match(pattern1);
  if (match1) {
    return {
      lat: parseFloat(match1[1]),
      lng: parseFloat(match1[2]),
    };
  }

  // Padrão 2: q=lat,lng (pode ter + antes do lng negativo)
  const pattern2 = /[?&]q=(-?\d+\.\d+),\+?(-?\d+\.\d+)/;
  const match2 = url.match(pattern2);
  if (match2) {
    return {
      lat: parseFloat(match2[1]),
      lng: parseFloat(match2[2]),
    };
  }

  // Padrão 3: /search/lat,+lng (pode ter + antes do lng negativo)
  const pattern3 = /\/search\/(-?\d+\.\d+),\+?(-?\d+\.\d+)/;
  const match3 = url.match(pattern3);
  if (match3) {
    return {
      lat: parseFloat(match3[1]),
      lng: parseFloat(match3[2]),
    };
  }

  return null;
}
