/** Países soportados por la API de Postali (ISO 3166-1 alfa-2, minúsculas). */
export type Country = "mx" | "co" | "es";

/** Asentamiento (colonia, fraccionamiento, barrio, zona postal…) dentro de un CP. */
export interface Asentamiento {
  nombre: string;
  /** Tipo de asentamiento: "Colonia", "Fraccionamiento", "Zona Postal"… */
  tipo: string;
  /** Ciudad. `null` en CO y ES (GeoNames no la publica). */
  ciudad: string | null;
  /** Zona. `null` en CO y ES. */
  zona: "Urbano" | "Rural" | null;
  asenta_slug: string;
}

/** Respuesta de `GET /api/v1/{country}/cp/{codigo}`. */
export interface CpResponse {
  cp: string;
  estado: string;
  estado_slug: string;
  municipio: string;
  municipio_slug: string;
  asentamientos: Asentamiento[];
}

/** Respuesta de `GET /api/v1/{country}/validate/{codigo}`. */
export interface ValidateResponse {
  cp: string;
  valid: boolean;
  /** Número de asentamientos que cubre el CP (0 si no existe). */
  asentamientos: number;
}

/** Resultado individual de `search`. */
export interface SearchHit {
  cp: string;
  nombre: string;
  tipo: string;
  municipio: string;
  estado: string;
  estado_slug: string;
  municipio_slug: string;
  asenta_slug: string;
}

/** Respuesta de `GET /api/v1/{country}/search`. */
export interface SearchResponse {
  query: string;
  results: SearchHit[];
}

/** Región de primer nivel: estado (MX), departamento (CO) o provincia (ES). */
export interface Estado {
  nombre: string;
  slug: string;
  total_asentamientos: number;
  total_municipios: number;
}

/** Respuesta de `GET /api/v1/{country}/estados`. */
export interface EstadosResponse {
  total: number;
  estados: Estado[];
}

export interface MunicipioListItem {
  nombre: string;
  slug: string;
  total_asentamientos: number;
}

/** Respuesta de `GET /api/v1/{country}/estado/{slug}/municipios`. */
export interface MunicipiosResponse {
  estado: string;
  estado_slug: string;
  total: number;
  municipios: MunicipioListItem[];
}

/** Asentamiento dentro de un municipio (incluye su CP). */
export interface Colonia extends Asentamiento {
  cp: string;
}

/** Respuesta de `GET /api/v1/{country}/municipio/{estado}/{municipio}`. */
export interface MunicipioResponse {
  estado: string;
  estado_slug: string;
  municipio: string;
  municipio_slug: string;
  total_asentamientos: number;
  /** `true` si el municipio tiene más de 1000 asentamientos y la lista se recortó. */
  truncated: boolean;
  colonias: Colonia[];
}

/** Resultado individual de `bulk`, en el mismo orden que la entrada. */
export interface BulkResult {
  cp: string;
  valid: boolean;
  estado: string | null;
  estado_slug: string | null;
  municipio: string | null;
  municipio_slug: string | null;
  asentamientos: number;
}

/** Respuesta de `POST /api/v1/{country}/bulk`. */
export interface BulkResponse {
  total: number;
  results: BulkResult[];
}

/** Opciones por petición. */
export interface RequestOptions {
  /** Señal para cancelar la petición (p. ej. al teclear otra letra en un autocompletado). */
  signal?: AbortSignal;
  /** Timeout en milisegundos para esta petición. Sobrescribe el del cliente. */
  timeout?: number;
}

export interface SearchOptions extends RequestOptions {
  /** Máximo de resultados (1–50, por defecto 10 en el servidor). */
  limit?: number;
}

export interface ClientOptions {
  /** País del directorio. Por defecto `"mx"`. */
  country?: Country;
  /** URL base de la API. Por defecto `https://postali.app`. */
  baseUrl?: string;
  /** Implementación de `fetch`. Por defecto el `fetch` global. */
  fetch?: typeof fetch;
  /** Timeout en milisegundos para cada petición. Por defecto 10000. `0` lo desactiva. */
  timeout?: number;
}
