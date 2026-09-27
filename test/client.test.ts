import { describe, expect, it, vi } from "vitest";
import { createClient, isPostaliError, normalizeCp, PostaliError } from "../src/index.js";

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function mockFetch(handler: Handler) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(handler(String(input), init ?? {})));
  return fn as unknown as typeof fetch & typeof fn;
}

const CP_06700 = {
  cp: "06700",
  estado: "Ciudad de México",
  estado_slug: "ciudad-de-mexico",
  municipio: "Cuauhtémoc",
  municipio_slug: "cuauhtemoc",
  asentamientos: [
    { nombre: "Roma Norte", tipo: "Colonia", ciudad: "Ciudad de México", zona: "Urbano", asenta_slug: "roma-norte" },
  ],
};

const API_ERROR = (code: string, message = "msg") => ({
  error: { code, message, docs_url: "https://postali.app/api/docs#errors" },
});

describe("normalizeCp", () => {
  it("restaura el cero inicial perdido", () => {
    expect(normalizeCp("6700")).toBe("06700");
    expect(normalizeCp(6700)).toBe("06700");
    expect(normalizeCp("8001", "es")).toBe("08001");
    expect(normalizeCp("50001", "co")).toBe("050001");
  });

  it("quita espacios y respeta CPs completos", () => {
    expect(normalizeCp(" 76 148 ")).toBe("76148");
    expect(normalizeCp("050001", "co")).toBe("050001");
  });

  it("rechaza formatos inválidos", () => {
    expect(normalizeCp("670")).toBeNull();
    expect(normalizeCp("abcde")).toBeNull();
    expect(normalizeCp("067000")).toBeNull();
    expect(normalizeCp("06700", "co")).toBeNull(); // no se fabrica un "00…"
    expect(normalizeCp("0670")).toBeNull();
    expect(normalizeCp("0670", "co")).toBeNull();
    expect(normalizeCp("")).toBeNull();
    expect(normalizeCp("-6700")).toBeNull();
  });
});

describe("createClient", () => {
  it("usa mx y https://postali.app por defecto", async () => {
    const f = mockFetch(() => json(CP_06700));
    const postali = createClient({ fetch: f });
    expect(postali.country).toBe("mx");
    const res = await postali.cp("06700");
    expect(res).toEqual(CP_06700);
    expect(f.mock.calls[0]![0]).toBe("https://postali.app/api/v1/mx/cp/06700");
    expect(f.mock.calls[0]![1]!.method).toBe("GET");
    // GET sin cabeceras personalizadas: evita preflight CORS en navegador.
    expect(f.mock.calls[0]![1]!.headers).toBeUndefined();
  });

  it("respeta country y baseUrl (sin barra final duplicada)", async () => {
    const f = mockFetch(() => json({ cp: "050001", valid: true, asentamientos: 1 }));
    const postali = createClient({ country: "co", baseUrl: "http://localhost:3000/", fetch: f });
    await postali.validate("50001");
    expect(f.mock.calls[0]![0]).toBe("http://localhost:3000/api/v1/co/validate/050001");
  });

  it("rechaza países no soportados", () => {
    // @ts-expect-error país inválido a propósito
    expect(() => createClient({ country: "ar", fetch: mockFetch(() => json({})) })).toThrow(TypeError);
  });
});

describe("lookups", () => {
  it("cp() normaliza el CP antes de pedirlo", async () => {
    const f = mockFetch(() => json(CP_06700));
    await createClient({ fetch: f }).cp("6700");
    expect(f.mock.calls[0]![0]).toBe("https://postali.app/api/v1/mx/cp/06700");
  });

  it("cp() con formato inválido lanza invalid_cp sin tocar la red", async () => {
    const f = mockFetch(() => json(CP_06700));
    const err = await createClient({ fetch: f }).cp("abc").catch((e) => e);
    expect(err).toBeInstanceOf(PostaliError);
    expect(err.code).toBe("invalid_cp");
    expect(err.status).toBe(400);
    expect(f).not.toHaveBeenCalled();
  });

  it("cp() convierte el error de la API en PostaliError", async () => {
    const f = mockFetch(() => json(API_ERROR("not_found", "No se encontró el recurso solicitado."), 404));
    const err = await createClient({ fetch: f }).cp("00000").catch((e) => e);
    expect(isPostaliError(err, "not_found")).toBe(true);
    expect(err.status).toBe(404);
    expect(err.message).toBe("No se encontró el recurso solicitado.");
    expect(err.docsUrl).toBe("https://postali.app/api/docs#errors");
  });

  it("validate() devuelve la respuesta tipada", async () => {
    const f = mockFetch(() => json({ cp: "00000", valid: false, asentamientos: 0 }));
    const res = await createClient({ fetch: f }).validate("00000");
    expect(res.valid).toBe(false);
    expect(res.asentamientos).toBe(0);
  });
});

describe("search", () => {
  it("codifica q y limit", async () => {
    const f = mockFetch(() => json({ query: "roma norte", results: [] }));
    await createClient({ fetch: f }).search("  roma norte ", { limit: 5 });
    expect(f.mock.calls[0]![0]).toBe("https://postali.app/api/v1/mx/search?q=roma+norte&limit=5");
  });

  it("rechaza búsquedas vacías o de más de 100 caracteres", async () => {
    const f = mockFetch(() => json({}));
    const postali = createClient({ fetch: f });
    await expect(postali.search("   ")).rejects.toMatchObject({ code: "invalid_query" });
    await expect(postali.search("x".repeat(101))).rejects.toMatchObject({ code: "invalid_query" });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("geografía", () => {
  it("construye las rutas y codifica slugs", async () => {
    const f = mockFetch(() => json({}));
    const postali = createClient({ country: "es", fetch: f });
    await postali.estados();
    await postali.estado("madrid");
    await postali.municipios("a-coruna");
    await postali.municipio("madrid", "san lorenzo/x");
    expect(f.mock.calls.map((c) => c[0])).toEqual([
      "https://postali.app/api/v1/es/estados",
      "https://postali.app/api/v1/es/estado/madrid",
      "https://postali.app/api/v1/es/estado/a-coruna/municipios",
      "https://postali.app/api/v1/es/municipio/madrid/san%20lorenzo%2Fx",
    ]);
  });

  it("rechaza slugs vacíos", async () => {
    const postali = createClient({ fetch: mockFetch(() => json({})) });
    await expect(postali.estado("")).rejects.toMatchObject({ code: "invalid_query" });
  });
});

describe("bulk", () => {
  it("normaliza, marca inválidos localmente y conserva el orden", async () => {
    const f = mockFetch((_url, init) => {
      const { cps } = JSON.parse(String(init.body)) as { cps: string[] };
      return json({
        total: cps.length,
        results: cps.map((cp) => ({
          cp,
          valid: cp !== "00000",
          estado: null,
          estado_slug: null,
          municipio: null,
          municipio_slug: null,
          asentamientos: cp === "00000" ? 0 : 1,
        })),
      });
    });
    const res = await createClient({ fetch: f }).bulk(["6700", "abc", 44100, "00000"]);
    const [, init] = f.mock.calls[0]!;
    expect(init!.method).toBe("POST");
    expect(init!.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(String(init!.body))).toEqual({ cps: ["06700", "44100", "00000"] });
    expect(res.total).toBe(4);
    expect(res.results.map((r) => [r.cp, r.valid])).toEqual([
      ["06700", true],
      ["abc", false],
      ["44100", true],
      ["00000", false],
    ]);
  });

  it("parte en lotes de 100", async () => {
    const f = mockFetch((_url, init) => {
      const { cps } = JSON.parse(String(init.body)) as { cps: string[] };
      return json({
        total: cps.length,
        results: cps.map((cp) => ({ cp, valid: true, asentamientos: 1 })),
      });
    });
    const codes = Array.from({ length: 250 }, (_, i) => String(10000 + i));
    const res = await createClient({ fetch: f }).bulk(codes);
    expect(f).toHaveBeenCalledTimes(3);
    expect(res.results.map((r) => r.cp)).toEqual(codes);
  });

  it("no hace peticiones si todos son inválidos", async () => {
    const f = mockFetch(() => json({}));
    const res = await createClient({ fetch: f }).bulk(["x", "1"]);
    expect(f).not.toHaveBeenCalled();
    expect(res.results.every((r) => !r.valid)).toBe(true);
  });

  it("rechaza lista vacía", async () => {
    await expect(createClient({ fetch: mockFetch(() => json({})) }).bulk([])).rejects.toMatchObject({
      code: "invalid_query",
    });
  });
});

describe("errores de transporte", () => {
  it("respuesta no-JSON (p. ej. HTML de Cloudflare) → http_error / rate_limited / internal_error", async () => {
    const html = (status: number) => mockFetch(() => new Response("<html>nope</html>", { status }));
    await expect(createClient({ fetch: html(403) }).estados()).rejects.toMatchObject({ code: "http_error", status: 403, message: "HTTP 403" });
    await expect(createClient({ fetch: html(429) }).estados()).rejects.toMatchObject({ code: "rate_limited" });
    await expect(createClient({ fetch: html(502) }).estados()).rejects.toMatchObject({ code: "internal_error" });
  });

  it("200 con cuerpo no-JSON → http_error", async () => {
    const f = mockFetch(() => new Response("ok", { status: 200 }));
    await expect(createClient({ fetch: f }).estados()).rejects.toMatchObject({ code: "http_error" });
  });

  it("fallo de red → network_error con cause", async () => {
    const boom = new TypeError("fetch failed");
    const f = vi.fn(() => Promise.reject(boom)) as unknown as typeof fetch;
    const err = await createClient({ fetch: f }).estados().catch((e) => e);
    expect(err.code).toBe("network_error");
    expect(err.cause).toBe(boom);
  });

  it("timeout → aborta y lanza timeout", async () => {
    const f = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    ) as unknown as typeof fetch;
    const postali = createClient({ fetch: f, timeout: 20 });
    await expect(postali.estados()).rejects.toMatchObject({ code: "timeout" });
    // timeout por petición sobrescribe el del cliente
    await expect(createClient({ fetch: f, timeout: 0 }).estados({ timeout: 10 })).rejects.toMatchObject({
      code: "timeout",
    });
  });

  it("signal externo cancela y propaga el motivo (no lo disfraza de PostaliError)", async () => {
    const f = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    ) as unknown as typeof fetch;
    const controller = new AbortController();
    const p = createClient({ fetch: f }).search("roma", { signal: controller.signal });
    const reason = new Error("nueva tecla");
    controller.abort(reason);
    await expect(p).rejects.toBe(reason);
  });
});
