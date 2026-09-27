export { createClient, BULK_MAX, DEFAULT_BASE_URL, DEFAULT_TIMEOUT, SEARCH_MAX_LENGTH } from "./client.js";
export type { PostaliClient } from "./client.js";
export { PostaliError, isPostaliError, DOCS_URL } from "./errors.js";
export type { PostaliErrorCode } from "./errors.js";
export { normalizeCp, isCountry, COUNTRIES, CP_LENGTH } from "./normalize.js";
export type * from "./types.js";
