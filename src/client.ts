import { PostaliError, type PostaliErrorCode } from "./errors.js";
import { isCountry, normalizeCp } from "./normalize.js";
import type {
  BulkResponse,
  BulkResult,
  ClientOptions,
  Country,
  CpResponse,
  Estado,
  EstadosResponse,
  MunicipioResponse,
  MunicipiosResponse,
  RequestOptions,
  SearchOptions,
  SearchResponse,
  ValidateResponse,
} from "./types.js";

export const DEFAULT_BASE_URL = "https://postali.app";
export const DEFAULT_TIMEOUT = 10_000;
/** Máximo de códigos que acepta `POST /bulk` en una sola petición. */
export const BULK_MAX = 100;
/** Longitud máxima de `q` en `search`. */
export const SEARCH_MAX_LENGTH = 100;

const API_CODES: ReadonlySet<string> = new Set<PostaliErrorCode>([
  "invalid_cp",
  "invalid_query",
  "not_found",
  "rate_limited",
  "internal_error",
]);

export interface PostaliClient {
  /** País con el que se creó el cliente. */
  readonly country: Country;
  /** Busca un código postal y devuelve estado, municipio y asentamientos. */
  cp(codigo: string | number, options?: RequestOptions): Promise<CpResponse>;
  /** Comprueba si un CP existe (ligero, pensado para checkouts). */
  validate(codigo: string | number, options?: RequestOptions): Promise<ValidateResponse>;
  /** Búsqueda difusa por colonia, municipio o CP. Ideal para autocompletar. */
  search(q: string, options?: SearchOptions): Promise<SearchResponse>;
  /** Lista las regiones de primer nivel (estados / departamentos / provincias). */
  estados(options?: RequestOptions): Promise<EstadosResponse>;
  /** Detalle de una región. */
  estado(slug: string, options?: RequestOptions): Promise<Estado>;
  /** Municipios de una región, ordenados por nombre. */
  municipios(estadoSlug: string, options?: RequestOptions): Promise<MunicipiosResponse>;
  /** Asentamientos de un municipio (máx. 1000; ver `truncated`). */
  municipio(estadoSlug: string, municipioSlug: string, options?: RequestOptions): Promise<MunicipioResponse>;
  /**
   * Resuelve muchos CPs a la vez. Normaliza cada código, marca como
   * `valid: false` los que no tienen formato válido (sin enviarlos) y
   * parte la lista en lotes de 100. Los resultados conservan el orden de entrada.
   */
  bulk(codigos: ReadonlyArray<string | number>, options?: RequestOptions): Promise<BulkResponse>;
}

/**
 * Crea un cliente de la API de Postali.
 *
 * ```ts
 * const postali = createClient({ country: "mx" });
 * const { asentamientos } = await postali.cp("06700");
 * ```
 */
export function createClient(options: ClientOptions = {}): PostaliClient {
  const country = options.country ?? "mx";
  if (!isCountry(country)) {
    throw new TypeError(`postali: país no soportado "${String(country)}". Usa "mx", "co" o "es".`);
  }
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const clientTimeout = options.timeout ?? DEFAULT_TIMEOUT;
  if (!options.fetch && typeof fetch !== "function") {
    throw new TypeError("postali: no hay `fetch` global. Usa Node 18+ o pasa `fetch` en las opciones.");
  }
  // El `fetch` global se resuelve en cada llamada (respeta polyfills/stubs posteriores
  // y evita "Illegal invocation" en navegadores).
  const fetchImpl: typeof fetch = options.fetch ?? ((input, init) => fetch(input, init));
  const root = `${baseUrl}/api/v1/${country}`;

  async function request<T>(path: string, reqOpts: RequestOptions = {}, body?: unknown): Promise<T> {
    const timeout = reqOpts.timeout ?? clientTimeout;
    const controller = new AbortController();
    let timedOut = false;
    const timer =
      timeout > 0
        ? setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, timeout)
        : undefined;
    const outer = reqOpts.signal;
    const onOuterAbort = () => controller.abort(outer?.reason);
    if (outer) {
      if (outer.aborted) controller.abort(outer.reason);
      else outer.addEventListener("abort", onOuterAbort, { once: true });
    }

    // Sin cabeceras personalizadas en GET: así el navegador no dispara preflight CORS.
    const init: RequestInit = { method: body === undefined ? "GET" : "POST", signal: controller.signal };
    if (body !== undefined) {
      init.headers = { "content-type": "application/json" };
      init.body = JSON.stringify(body);
    }

    let res: Response;
    let text: string;
    try {
      res = await fetchImpl(`${root}${path}`, init);
      text = await res.text();
    } catch (err) {
      if (timedOut) {
        throw new PostaliError("timeout", `La petición a Postali superó ${timeout} ms.`, { cause: err });
      }
      if (outer?.aborted) throw outer.reason ?? err;
      throw new PostaliError("network_error", `No se pudo contactar con Postali: ${errMessage(err)}`, {
        cause: err,
      });
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      outer?.removeEventListener("abort", onOuterAbort);
    }

    let data: unknown;
    try {
      data = text === "" ? undefined : JSON.parse(text);
    } catch {
      data = undefined;
    }

    if (!res.ok) throw toError(res.status, data, text);
    if (data === undefined) {
      throw new PostaliError("http_error", "Respuesta de Postali vacía o no es JSON.", { status: res.status });
    }
    return data as T;
  }

  function cpPath(codigo: string | number): string {
    const cp = normalizeCp(codigo, country);
    if (cp === null) {
      throw new PostaliError("invalid_cp", `"${String(codigo)}" no tiene el formato de CP de ${country.toUpperCase()}.`, {
        status: 400,
      });
    }
    return encodeURIComponent(cp);
  }

  function slug(value: string, name: string): string {
    const s = typeof value === "string" ? value.trim() : "";
    if (s === "") throw new PostaliError("invalid_query", `Falta \`${name}\`.`, { status: 400 });
    return encodeURIComponent(s);
  }

  return {
    country,

    async cp(codigo, opts) {
      return request<CpResponse>(`/cp/${cpPath(codigo)}`, opts);
    },

    async validate(codigo, opts) {
      return request<ValidateResponse>(`/validate/${cpPath(codigo)}`, opts);
    },

    async search(q, opts = {}) {
      const query = typeof q === "string" ? q.trim() : "";
      if (query === "") throw new PostaliError("invalid_query", "La búsqueda está vacía.", { status: 400 });
      if (query.length > SEARCH_MAX_LENGTH) {
        throw new PostaliError("invalid_query", `La búsqueda excede ${SEARCH_MAX_LENGTH} caracteres.`, {
          status: 400,
        });
      }
      const params = new URLSearchParams({ q: query });
      if (opts.limit !== undefined) params.set("limit", String(Math.trunc(opts.limit)));
      return request<SearchResponse>(`/search?${params.toString()}`, opts);
    },

    async estados(opts) {
      return request<EstadosResponse>("/estados", opts);
    },

    async estado(estadoSlug, opts) {
      return request<Estado>(`/estado/${slug(estadoSlug, "estado")}`, opts);
    },

    async municipios(estadoSlug, opts) {
      return request<MunicipiosResponse>(`/estado/${slug(estadoSlug, "estado")}/municipios`, opts);
    },

    async municipio(estadoSlug, municipioSlug, opts) {
      return request<MunicipioResponse>(
        `/municipio/${slug(estadoSlug, "estado")}/${slug(municipioSlug, "municipio")}`,
        opts,
      );
    },

    async bulk(codigos, opts) {
      if (!Array.isArray(codigos) || codigos.length === 0) {
        throw new PostaliError("invalid_query", "`codigos` no puede estar vacío.", { status: 400 });
      }
      const results: BulkResult[] = new Array(codigos.length);
      const pending: { index: number; cp: string }[] = [];
      codigos.forEach((raw, index) => {
        const cp = normalizeCp(raw, country);
        if (cp === null) results[index] = invalidResult(String(raw));
        else pending.push({ index, cp });
      });
      for (let i = 0; i < pending.length; i += BULK_MAX) {
        const chunk = pending.slice(i, i + BULK_MAX);
        const res = await request<BulkResponse>("/bulk", opts, { cps: chunk.map((c) => c.cp) });
        chunk.forEach((c, j) => {
          results[c.index] = res.results[j] ?? invalidResult(c.cp);
        });
      }
      return { total: results.length, results };
    },
  };
}

function invalidResult(cp: string): BulkResult {
  return {
    cp,
    valid: false,
    estado: null,
    estado_slug: null,
    municipio: null,
    municipio_slug: null,
    asentamientos: 0,
  };
}

function toError(status: number, data: unknown, text: string): PostaliError {
  const e = (data as { error?: { code?: unknown; message?: unknown; docs_url?: unknown } } | undefined)?.error;
  if (e && typeof e.code === "string") {
    const code = (API_CODES.has(e.code) ? e.code : "http_error") as PostaliErrorCode;
    const message = typeof e.message === "string" ? e.message : `HTTP ${status}`;
    const docsUrl = typeof e.docs_url === "string" ? e.docs_url : undefined;
    return new PostaliError(code, message, { status, docsUrl });
  }
  const code: PostaliErrorCode =
    status === 404 ? "not_found" : status === 429 ? "rate_limited" : status >= 500 ? "internal_error" : "http_error";
  const snippet = text.trim().slice(0, 200);
  const looksHtml = snippet.startsWith("<");
  return new PostaliError(code, `HTTP ${status}${snippet && !looksHtml ? `: ${snippet}` : ""}`, { status });
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
