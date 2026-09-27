# postali

Cliente oficial para JavaScript y TypeScript de la **API gratuita de códigos postales de [Postali](https://postali.app)**: México, Colombia y España.

- Sin API key, sin registro, sin cuota mensual. CORS abierto.
- Cero dependencias. Usa el `fetch` global: Node 18+, navegadores, Deno, Bun y edge runtimes.
- ESM + CommonJS, con tipos TypeScript para cada respuesta.
- Restaura el cero inicial que se pierde en Excel o en un `Number()` (`6700` → `"06700"`).

**Documentación de la API:** https://postali.app/api/docs · **Sitio:** https://postali.app

## Instalación

```bash
npm install postali
```

## Uso rápido

```ts
import { createClient } from "postali";

const postali = createClient({ country: "mx" });
const { municipio, asentamientos } = await postali.cp("06700"); // Cuauhtémoc, [Roma Norte]
```

## Ejemplos

### Autocompletar la colonia en un formulario de dirección

Cuando el usuario termina de escribir el CP, se rellenan estado y municipio y se ofrecen las colonias en un `<select>`:

```ts
import { createClient, isPostaliError } from "postali";

const postali = createClient({ country: "mx" });

const cpInput = document.querySelector<HTMLInputElement>("#cp")!;
const estado = document.querySelector<HTMLInputElement>("#estado")!;
const municipio = document.querySelector<HTMLInputElement>("#municipio")!;
const colonia = document.querySelector<HTMLSelectElement>("#colonia")!;

cpInput.addEventListener("input", async () => {
  if (cpInput.value.trim().length < 5) return;
  try {
    const r = await postali.cp(cpInput.value);
    estado.value = r.estado;
    municipio.value = r.municipio;
    colonia.replaceChildren(...r.asentamientos.map((a) => new Option(a.nombre, a.nombre)));
  } catch (err) {
    if (isPostaliError(err, "not_found") || isPostaliError(err, "invalid_cp")) {
      colonia.replaceChildren(new Option("CP no encontrado", ""));
    } else {
      throw err;
    }
  }
});
```

¿Buscas por nombre de colonia en lugar de CP? Usa `search` y cancela la petición anterior en cada tecla:

```ts
let controller: AbortController | undefined;

input.addEventListener("input", async () => {
  controller?.abort();
  controller = new AbortController();
  try {
    const { results } = await postali.search(input.value, { limit: 8, signal: controller.signal });
    render(results.map((h) => `${h.nombre}, ${h.municipio} — ${h.cp}`));
  } catch (err) {
    if ((err as Error).name !== "AbortError") throw err;
  }
});
```

### Validar un CP (checkout)

```ts
const { valid } = await postali.validate(form.cp); // { cp: "06700", valid: true, asentamientos: 1 }
if (!valid) showError("Ese código postal no existe.");
```

`validate` lanza `PostaliError` con `code: "invalid_cp"` si el texto ni siquiera tiene formato de CP (p. ej. `"abc"`), sin hacer la petición.

### Muchos CPs a la vez

```ts
const { results } = await postali.bulk(["06700", "44100", "6700", "abc"]);
// Mismo orden que la entrada. "6700" se normaliza a "06700" y "abc" vuelve con valid: false.
```

`bulk` parte la lista en lotes de 100 automáticamente.

### Colombia y España

```ts
const co = createClient({ country: "co" });
await co.cp("050001"); // Medellín, Antioquia

const es = createClient({ country: "es" });
await es.cp(8001); // "08001" → Barcelona
```

## API

`createClient(options?)` devuelve un cliente con estos métodos. Todos aceptan como último argumento `{ signal?, timeout? }`.

| Método | Endpoint | Devuelve |
|---|---|---|
| `cp(codigo)` | `GET /api/v1/{country}/cp/{codigo}` | `CpResponse` |
| `validate(codigo)` | `GET /api/v1/{country}/validate/{codigo}` | `ValidateResponse` |
| `search(q, { limit })` | `GET /api/v1/{country}/search?q=` | `SearchResponse` |
| `estados()` | `GET /api/v1/{country}/estados` | `EstadosResponse` |
| `estado(slug)` | `GET /api/v1/{country}/estado/{slug}` | `Estado` |
| `municipios(estadoSlug)` | `GET /api/v1/{country}/estado/{slug}/municipios` | `MunicipiosResponse` |
| `municipio(estadoSlug, municipioSlug)` | `GET /api/v1/{country}/municipio/{estado}/{municipio}` | `MunicipioResponse` |
| `bulk(codigos)` | `POST /api/v1/{country}/bulk` | `BulkResponse` |

"Estado" es el nivel 1 de cada país: estado en México, departamento en Colombia, provincia en España.

### Opciones de `createClient`

| Opción | Por defecto | |
|---|---|---|
| `country` | `"mx"` | `"mx"`, `"co"` o `"es"` |
| `baseUrl` | `"https://postali.app"` | Útil para pruebas o un proxy propio |
| `fetch` | `fetch` global | Inyecta tu propia implementación (tests, polyfills) |
| `timeout` | `10000` | Milisegundos; `0` lo desactiva |

### Errores

Todo error de la API o de red se lanza como `PostaliError`:

```ts
import { isPostaliError } from "postali";

try {
  await postali.cp("00000");
} catch (err) {
  if (isPostaliError(err)) {
    err.code;    // "not_found"
    err.status;  // 404
    err.message; // "No se encontró el recurso solicitado."
    err.docsUrl; // "https://postali.app/api/docs#errors"
  }
}
```

| `code` | Cuándo |
|---|---|
| `invalid_cp` | El CP no tiene el formato del país |
| `invalid_query` | Falta `q`, está vacía o hay un parámetro inválido |
| `not_found` | El CP, estado o municipio no existe |
| `rate_limited` | Demasiadas peticiones desde tu IP |
| `internal_error` | Error del servidor (5xx) |
| `timeout` | Se superó el `timeout` |
| `network_error` | No se pudo conectar |
| `http_error` | Otra respuesta no exitosa |

Si cancelas con tu propio `AbortSignal`, se relanza el motivo de la cancelación (normalmente un `AbortError`), no un `PostaliError`.

### Normalización de CPs

```ts
import { normalizeCp } from "postali";

normalizeCp("6700");         // "06700"
normalizeCp(" 76 148 ");     // "76148"
normalizeCp("50001", "co");  // "050001"
normalizeCp("670");          // null (incompleto)
```

Se añade como máximo un cero, y nunca delante de otro cero: ningún CP de México, Colombia o España empieza por `00`.

## Datos y atribución

Datos: Sepomex vía [Postali](https://postali.app) / GeoNames ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)) para CO y ES.

## English

`postali` is the official zero-dependency JavaScript/TypeScript client for the free [Postali](https://postali.app) postal-code API (Mexico, Colombia, Spain). No API key, open CORS. Works anywhere with a global `fetch` (Node 18+, browsers, Deno, Bun), ships ESM + CJS with full types.

```ts
import { createClient } from "postali";
const postali = createClient({ country: "mx" }); // "mx" | "co" | "es"
const { estado, municipio, asentamientos } = await postali.cp("06700");
```

Errors are thrown as `PostaliError` with a `code` (`invalid_cp`, `not_found`, `rate_limited`, `timeout`…), `status` and `docsUrl`. Postal codes that lost their leading zero (`6700`) are restored automatically. API reference: https://postali.app/api/docs

Data: Sepomex via Postali / GeoNames (CC BY 4.0) for CO and ES.

## Licencia

MIT © Postali
