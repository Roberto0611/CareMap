/**
 * Intención de asignación de recursos.
 *
 * El LLM (OpenRouter) analiza el texto del usuario y extrae los parámetros
 * de asignación como JSON estructurado. Luego se ejecuta asignar() localmente.
 *
 * Ventaja: el LLM entiende typos, sinónimos, frases ambiguas y cualquier
 * variante de lenguaje natural — sin parsers frágiles.
 */

import { cargarDatos } from './datos';
import { asignar, type Asignacion, type Candidato } from './asignar';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface AsignarIntentParams {
  recursos: number;
  estado: string | null;   // abreviatura 2 letras: 'TX', 'CA'… o null = nacional
  balance: number;         // 0=gravedad  0.5=equilibrado  1=alcance
  separacionKm: number;
  scoreMinimo: number;
}

export interface AsignarIntentResult {
  detected: true;
  params: AsignarIntentParams;
  asignacion: Asignacion;
  zctas: string[];
}

export interface NoIntentResult {
  detected: false;
}

export type IntentResult = AsignarIntentResult | NoIntentResult;

// ─── Palabras clave ligeras (sólo para decidir si invocar el intent) ──────────

const ASSIGN_KEYWORDS = [
  'asign', 'recurso', 'brigada', 'unidad', 'móvil', 'movil',
  'coloca', 'distribu', 'despliega', 'donde poner', 'dónde poner',
  'separaci', 'separa',
];

/** Gate rápido: ¿tiene pinta de asignación? Si no, ir directo a SQL. */
export function isAssignIntent(prompt: string): boolean {
  const p = prompt.toLowerCase();
  return ASSIGN_KEYWORDS.some((kw) => p.includes(kw));
}

// ─── Extracción de parámetros vía LLM ────────────────────────────────────────

const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined;

const EXTRACT_SYSTEM_PROMPT = `Eres un asistente que extrae parámetros de asignación de recursos de salud pública a partir de texto en lenguaje natural.

El usuario puede escribir con errores ortográficos, abreviaturas o frases coloquiales. Interpreta su intención correctamente.

Devuelve ÚNICAMENTE un objeto JSON con exactamente estos campos (sin texto adicional, sin markdown):
{
  "recursos": number,       // cuántos recursos/brigadas/zonas/unidades (por defecto 8 si no se menciona)
  "estado": string | null,  // abreviatura de 2 letras del estado de EE.UU. (TX, CA, FL, NY, etc.) o null si es nacional o no se especifica
  "balance": number,        // criterio: 0 = solo gravedad, 0.5 = equilibrado/balanceado, 1 = solo alcance/población (por defecto 0.5)
  "separacionKm": number    // separación mínima en km entre zonas elegidas (por defecto 0 si no se menciona)
}

Ejemplos de interpretación:
- "textas" → "TX"
- "california" → "CA"  
- "5 brigadas" → recursos: 5
- "priorizando alcance" → balance: 1
- "gravedad" → balance: 0
- "balanceada" / "equilibrado" / "mixto" → balance: 0.5
- "separados 30 km" / "30 kilómetros de separación" → separacionKm: 30
- "estoy en Texas, asigna 5 recursos" → estado: "TX", recursos: 5`;

async function extractParamsWithLLM(prompt: string): Promise<AsignarIntentParams> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://datarush.app',
        'X-Title': 'DataRush ZCTA Analytics',
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.3-70b-instruct',
        messages: [
          { role: 'system', content: EXTRACT_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) throw new Error(`OpenRouter ${res.status}`);

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw.trim());

    return {
      recursos:     typeof parsed.recursos     === 'number' ? parsed.recursos     : 8,
      estado:       typeof parsed.estado       === 'string' ? parsed.estado       : null,
      balance:      typeof parsed.balance      === 'number' ? parsed.balance      : 0.5,
      separacionKm: typeof parsed.separacionKm === 'number' ? parsed.separacionKm : 0,
      scoreMinimo: 60,
    };
  } catch (e) {
    console.warn('LLM extract falló, usando defaults:', e);
    // Fallback mínimo si la API falla
    return { recursos: 8, estado: null, balance: 0.5, separacionKm: 0, scoreMinimo: 60 };
  }
}

// ─── Cache de datos (evita re-fetch en cada consulta) ────────────────────────

let datosCache: Awaited<ReturnType<typeof cargarDatos>> | null = null;

async function getDatos() {
  if (!datosCache) {
    datosCache = await cargarDatos();
  }
  return datosCache;
}

// ─── Punto de entrada principal ───────────────────────────────────────────────

/**
 * Detecta intención, pide al LLM los parámetros, ejecuta asignar() y devuelve
 * el resultado completo listo para mostrar en el chat y resaltar en el mapa.
 */
export async function runAssignIntent(prompt: string): Promise<IntentResult> {
  if (!isAssignIntent(prompt)) return { detected: false };

  const [params, datos] = await Promise.all([
    extractParamsWithLLM(prompt),
    getDatos(),
  ]);

  const asignacion = asignar(datos.detalles, params);
  const zctas = asignacion.elegidas.map((z) => z.zcta);

  return { detected: true, params, asignacion, zctas };
}

// ─── Formato de tabla ─────────────────────────────────────────────────────────

export function formatAssignRows(elegidas: Candidato[]): Array<Record<string, string | number>> {
  let acum = 0;
  return elegidas.map((z, i) => {
    acum += z.poblacion ?? 0;
    return {
      '#': i + 1,
      zcta: z.zcta,
      condado: z.county_name ?? '—',
      estado: z.state_abbr ?? '—',
      índice: z.score != null ? z.score.toFixed(0) : '—',
      población: (z.poblacion ?? 0).toLocaleString('es-MX'),
      factor: z.factor1 ?? '—',
      'alcance acum.': acum.toLocaleString('es-MX'),
    };
  });
}
