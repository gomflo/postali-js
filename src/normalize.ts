import type { Country } from "./types.js";

/** Longitud del código postal por país. */
export const CP_LENGTH: Readonly<Record<Country, number>> = { mx: 5, co: 6, es: 5 };

export const COUNTRIES: readonly Country[] = ["mx", "co", "es"];

export function isCountry(value: unknown): value is Country {
  return typeof value === "string" && (COUNTRIES as readonly string[]).includes(value);
}

/**
 * Normaliza un código postal:
 * - acepta `string` o `number`;
 * - quita espacios;
 * - restaura el cero inicial que Excel/CSV/`Number()` suelen comerse
 *   (`"6700"` → `"06700"` en MX, `"8001"` → `"08001"` en ES,
 *   `"50001"` → `"050001"` en CO).
 *
 * Sólo se añade **un** cero, y nunca delante de otro cero: en los tres países
 * ningún CP empieza por `00`, así que una entrada más corta (o `"0670"`) es un
 * CP incompleto, no uno recortado.
 *
 * Devuelve `null` si el resultado no tiene el formato del país.
 */
export function normalizeCp(input: string | number, country: Country = "mx"): string | null {
  const len = CP_LENGTH[country];
  let cp = String(input).replace(/\s+/g, "");
  if (!/^\d+$/.test(cp)) return null;
  if (cp.length === len - 1 && !cp.startsWith("0")) cp = `0${cp}`;
  return cp.length === len ? cp : null;
}
