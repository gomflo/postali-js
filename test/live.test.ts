/**
 * Pruebas contra la API real. Desactivadas por defecto para que `npm test`
 * no dependa de la red. Actívalas con:
 *
 *   POSTALI_LIVE=1 npm test
 *   # o: npm run test:live
 */
import { describe, expect, it } from "vitest";
import { createClient, isPostaliError } from "../src/index.js";

declare const process: { env: Record<string, string | undefined> };

const live = process.env.POSTALI_LIVE === "1";
const baseUrl = process.env.POSTALI_BASE_URL;

describe.skipIf(!live)("API en vivo", () => {
  const mx = createClient({ country: "mx", ...(baseUrl ? { baseUrl } : {}) });
  const co = createClient({ country: "co", ...(baseUrl ? { baseUrl } : {}) });
  const es = createClient({ country: "es", ...(baseUrl ? { baseUrl } : {}) });

  it("MX cp 06700 (con cero perdido)", async () => {
    const r = await mx.cp(6700);
    expect(r.cp).toBe("06700");
    expect(r.municipio).toBe("Cuauhtémoc");
    expect(r.asentamientos.some((a) => a.nombre === "Roma Norte")).toBe(true);
  });

  it("MX cp 76148 tiene varias colonias", async () => {
    const r = await mx.cp("76148");
    expect(r.estado_slug).toBe("queretaro");
    expect(r.asentamientos.length).toBeGreaterThan(1);
  });

  it("CO 050001 y ES 28013", async () => {
    expect((await co.cp("050001")).estado).toBe("Antioquia");
    expect((await es.cp("28013")).municipio).toBe("Madrid");
  });

  it("validate, search, geografía y bulk", async () => {
    expect((await mx.validate("00000")).valid).toBe(false);
    expect((await mx.search("roma norte", { limit: 3 })).results[0]?.cp).toBe("06700");
    expect((await mx.estados()).total).toBe(32);
    expect((await mx.estado("jalisco")).slug).toBe("jalisco");
    expect((await mx.municipios("jalisco")).total).toBeGreaterThan(100);
    expect((await mx.municipio("jalisco", "guadalajara")).colonias.length).toBeGreaterThan(0);
    const b = await mx.bulk(["06700", "abc", "00000"]);
    expect(b.results.map((r) => r.valid)).toEqual([true, false, false]);
  });

  it("404 → PostaliError not_found", async () => {
    const err = await mx.cp("00000").catch((e) => e);
    expect(isPostaliError(err, "not_found")).toBe(true);
  });
});
