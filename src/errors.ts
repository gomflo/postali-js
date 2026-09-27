/**
 * Códigos de error.
 *
 * Los cinco primeros los devuelve la API (`{"error":{"code",...}}`).
 * Los tres últimos los genera el SDK:
 * - `timeout`: la petición superó el timeout configurado.
 * - `network_error`: fallo de red (DNS, conexión, CORS…).
 * - `http_error`: respuesta no exitosa sin cuerpo de error reconocible.
 */
export type PostaliErrorCode =
  | "invalid_cp"
  | "invalid_query"
  | "not_found"
  | "rate_limited"
  | "internal_error"
  | "timeout"
  | "network_error"
  | "http_error";

export const DOCS_URL = "https://postali.app/api/docs#errors";

export class PostaliError extends Error {
  override readonly name = "PostaliError";
  readonly code: PostaliErrorCode;
  /** Status HTTP. `0` si el error ocurrió antes de recibir respuesta. */
  readonly status: number;
  readonly docsUrl: string;

  constructor(
    code: PostaliErrorCode,
    message: string,
    options: { status?: number; docsUrl?: string; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
    this.status = options.status ?? 0;
    this.docsUrl = options.docsUrl ?? DOCS_URL;
  }
}

/** Type guard: `true` si `err` es un `PostaliError` (opcionalmente con un `code` concreto). */
export function isPostaliError(err: unknown, code?: PostaliErrorCode): err is PostaliError {
  return err instanceof PostaliError && (code === undefined || err.code === code);
}
