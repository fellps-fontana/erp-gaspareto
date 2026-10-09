import type { CallableRequest } from 'firebase-functions/v2/https';
import {
  resolveMapsShortLink,
  ResolveMapsShortLinkInput,
  ResolveMapsShortLinkOutput,
} from './resolve-maps-short-link';

const GEOCODE_ENDPOINT = 'https://maps.googleapis.com/maps/api/geocode/json';
const API_KEY_ENV = 'GOOGLE_GEOCODING_API_KEY';
const SHORT_URL = 'https://maps.app.goo.gl/Agz3WjrKK1qHG4oH7?g_st=iw';

const CASO_REAL_LOCATION =
  'https://maps.google.com?q=EBM+Rui+Barbosa+-+Rua:+Bras%C3%ADlia,+460D+-+Jardim+It%C3%A1lia,' +
  '+Chapec%C3%B3+-+SC,+89802-320+-+fone,+Chapec%C3%B3+-+SC,+33289-798' +
  '&ftid=0x94e4b4251e95b301:0x1a69dfd7de5f038a&entry=gps';
const CASO_REAL_ADDRESS =
  'EBM Rui Barbosa - Rua: Brasília, 460D - Jardim Itália, Chapecó - SC, 89802-320 - fone, Chapecó - SC, 33289-798';

const GEOCODE_OK_BODY = {
  status: 'OK',
  results: [{ geometry: { location: { lat: -27.0983748, lng: -52.6261243 } } }],
};
const GEOCODE_ZERO_RESULTS_BODY = { status: 'ZERO_RESULTS', results: [] };

const originalFetch = globalThis.fetch;

type FetchMock = jest.Mock<Promise<Response>, [string | URL | Request, RequestInit?]>;

/**
 * Mocka fetch: a chamada ao link curto devolve 302 com o Location informado;
 * a chamada ao Geocoding devolve o corpo informado (ou falha de rede se 'network-error').
 */
function mockFetch(location: string, geocodeBody: unknown = GEOCODE_OK_BODY): FetchMock {
  const fetchMock: FetchMock = jest.fn(async (input: string | URL | Request) => {
    const target = String(input);
    if (target.startsWith(GEOCODE_ENDPOINT)) {
      if (geocodeBody === 'network-error') {
        throw new TypeError('fetch failed');
      }
      return new Response(JSON.stringify(geocodeBody), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(null, { status: 302, headers: { location } });
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function geocodeCalls(fetchMock: FetchMock): URL[] {
  return fetchMock.mock.calls
    .map(([input]) => String(input))
    .filter((target) => target.startsWith(GEOCODE_ENDPOINT))
    .map((target) => new URL(target));
}

function buildRequest(
  callerUid: string | undefined,
  data: ResolveMapsShortLinkInput,
): CallableRequest<ResolveMapsShortLinkInput> {
  return {
    data,
    auth: callerUid ? { uid: callerUid, token: {} } : undefined,
    rawRequest: {},
    acceptsStreaming: false,
  } as unknown as CallableRequest<ResolveMapsShortLinkInput>;
}

describe('resolveMapsShortLink', () => {
  beforeEach(() => {
    process.env[API_KEY_ENV] = 'chave-de-teste';
  });

  afterEach(() => {
    delete process.env[API_KEY_ENV];
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('geocodifica o endereco do caso real e retorna lat/lng (nao address)', async () => {
    const fetchMock = mockFetch(CASO_REAL_LOCATION);

    const result = await resolveMapsShortLink.run(
      buildRequest('user-1', { url: SHORT_URL }),
    );

    expect(result).toEqual<ResolveMapsShortLinkOutput>({
      lat: -27.0983748,
      lng: -52.6261243,
    });
    const calls = geocodeCalls(fetchMock);
    expect(calls).toHaveLength(1);
    expect(calls[0].searchParams.get('address')).toBe(CASO_REAL_ADDRESS);
    expect(calls[0].searchParams.get('region')).toBe('br');
    expect(calls[0].searchParams.get('key')).toBe('chave-de-teste');
  });

  it('retorna address quando geocode nao acha resultado (ZERO_RESULTS)', async () => {
    mockFetch(CASO_REAL_LOCATION, GEOCODE_ZERO_RESULTS_BODY);

    const result = await resolveMapsShortLink.run(
      buildRequest('user-1', { url: SHORT_URL }),
    );

    expect(result).toEqual<ResolveMapsShortLinkOutput>({ address: CASO_REAL_ADDRESS });
  });

  it('retorna address quando a chamada de geocode falha por rede', async () => {
    mockFetch(CASO_REAL_LOCATION, 'network-error');

    const result = await resolveMapsShortLink.run(
      buildRequest('user-1', { url: SHORT_URL }),
    );

    expect(result).toEqual<ResolveMapsShortLinkOutput>({ address: CASO_REAL_ADDRESS });
  });

  it('retorna address sem chamar geocode quando a chave nao esta configurada', async () => {
    delete process.env[API_KEY_ENV];
    const fetchMock = mockFetch(CASO_REAL_LOCATION);

    const result = await resolveMapsShortLink.run(
      buildRequest('user-1', { url: SHORT_URL }),
    );

    expect(result).toEqual<ResolveMapsShortLinkOutput>({ address: CASO_REAL_ADDRESS });
    expect(geocodeCalls(fetchMock)).toHaveLength(0);
  });

  it('prioriza o pino !3d!4d sobre o @ da viewport', async () => {
    const location =
      'https://www.google.com/maps/place/Nome/@-27.1,-52.6,17z/' +
      'data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-27.0983!4d-52.6261';
    const fetchMock = mockFetch(location);

    const result = await resolveMapsShortLink.run(
      buildRequest('user-1', { url: SHORT_URL }),
    );

    expect(result).toEqual<ResolveMapsShortLinkOutput>({ lat: -27.0983, lng: -52.6261 });
    expect(geocodeCalls(fetchMock)).toHaveLength(0);
  });

  it('geocodifica o destino de /maps/dir/ quando nao ha coordenada', async () => {
    const fetchMock = mockFetch('https://www.google.com/maps/dir/Origem/Rua+Brasilia,+460,+Chapeco/');

    const result = await resolveMapsShortLink.run(
      buildRequest('user-1', { url: SHORT_URL }),
    );

    expect(result).toEqual<ResolveMapsShortLinkOutput>({
      lat: -27.0983748,
      lng: -52.6261243,
    });
    const calls = geocodeCalls(fetchMock);
    expect(calls).toHaveLength(1);
    expect(calls[0].searchParams.get('address')).toBe('Rua Brasilia, 460, Chapeco');
  });

  it('retorna coordenada de /maps/search/lat,+lng sem chamar geocode', async () => {
    const fetchMock = mockFetch('https://www.google.com/maps/search/-27.09,+-52.62');

    const result = await resolveMapsShortLink.run(
      buildRequest('user-1', { url: SHORT_URL }),
    );

    expect(result).toEqual<ResolveMapsShortLinkOutput>({ lat: -27.09, lng: -52.62 });
    expect(geocodeCalls(fetchMock)).toHaveLength(0);
  });

  it('rejeita host nao autorizado com invalid-argument sem fazer fetch', async () => {
    const fetchMock = mockFetch(CASO_REAL_LOCATION);

    await expect(
      resolveMapsShortLink.run(buildRequest('user-1', { url: 'https://example.com/maps/x' })),
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejeita chamador nao autenticado com unauthenticated sem fazer fetch', async () => {
    const fetchMock = mockFetch(CASO_REAL_LOCATION);

    await expect(
      resolveMapsShortLink.run(buildRequest(undefined, { url: SHORT_URL })),
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('nao geocodifica endereco com mais de 300 caracteres e retorna address', async () => {
    const longAddress = 'a'.repeat(301);
    const fetchMock = mockFetch(`https://maps.google.com?q=${longAddress}`);

    const result = await resolveMapsShortLink.run(
      buildRequest('user-1', { url: SHORT_URL }),
    );

    expect(result).toEqual<ResolveMapsShortLinkOutput>({ address: longAddress });
    expect(geocodeCalls(fetchMock)).toHaveLength(0);
  });

  it('aceita endereco com exatamente 300 caracteres e geocodifica', async () => {
    const maxAddress = 'a'.repeat(300);
    const fetchMock = mockFetch(`https://maps.google.com?q=${maxAddress}`);

    const result = await resolveMapsShortLink.run(
      buildRequest('user-1', { url: SHORT_URL }),
    );

    expect(result).toEqual<ResolveMapsShortLinkOutput>({
      lat: -27.0983748,
      lng: -52.6261243,
    });
    expect(geocodeCalls(fetchMock)).toHaveLength(1);
  });

  it('fetch do link curto abortado por timeout resulta em internal e loga so o nome do erro', async () => {
    const abortError = Object.assign(new Error('This operation was aborted'), {
      name: 'AbortError',
    });
    globalThis.fetch = jest.fn(async () => {
      throw abortError;
    }) as unknown as typeof fetch;
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(
        resolveMapsShortLink.run(buildRequest('user-1', { url: SHORT_URL })),
      ).rejects.toMatchObject({ code: 'internal' });

      expect(consoleSpy).toHaveBeenCalledWith(expect.any(String), 'AbortError');
      const loggedArgs = consoleSpy.mock.calls.flat();
      expect(loggedArgs).not.toContain(abortError);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it('corpo do geocode que nao resolve cai no timeout e retorna address', async () => {
    jest.useFakeTimers();
    globalThis.fetch = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).startsWith(GEOCODE_ENDPOINT)) {
        return {
          ok: true,
          json: () =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () =>
                reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
              );
            }),
        } as unknown as Response;
      }
      return new Response(null, { status: 302, headers: { location: CASO_REAL_LOCATION } });
    }) as unknown as typeof fetch;

    try {
      const pending = resolveMapsShortLink.run(buildRequest('user-1', { url: SHORT_URL }));
      await jest.advanceTimersByTimeAsync(5000);

      await expect(pending).resolves.toEqual<ResolveMapsShortLinkOutput>({
        address: CASO_REAL_ADDRESS,
      });
    } finally {
      jest.useRealTimers();
    }
  });
});
