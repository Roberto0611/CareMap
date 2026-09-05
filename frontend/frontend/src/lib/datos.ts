/**
 * Carga y desempaqueta zcta_scored.json.
 *
 * El archivo viene en formato columnar con los textos "interned": en vez de
 * repetir "Michigan" 800 veces y el nombre de cada columna 31,742 veces, trae
 * una tabla de valores únicos y los datos guardan índices a esa tabla.
 * Así pesa 1.47 MB comprimido en vez de ~6 MB.
 */

/** Los cinco temas del desglose, en ORDEN FIJO. */
export const TEMAS = [
  ['Socioeconómico', 't_socioeco'],
  ['Vivienda y conectividad', 't_vivienda'],
  ['Acceso a atención', 't_acceso'],
  ['Carga de enfermedad', 't_enfermedad'],
  ['Conductas de riesgo', 't_conductas'],
] as const;

export interface ZCTADetail {
  /** Centroide de la zona. El mapa no lo usa (la geometría ya lo trae);
   *  lo necesita el asignador para separar geográficamente lo que elige. */
  latitude: number | null;
  longitude: number | null;
  county_name: string | null;
  state_abbr: string | null;
  state_name: string | null;
  poblacion: number | null;
  score: number | null;
  score_social: number | null;
  score_salud: number | null;
  confiabilidad: string | null;
  factor1: string | null;
  factor1_pct: number | null;
  factor1_detalle: string | null;
  t_socioeco: number | null;
  t_vivienda: number | null;
  t_acceso: number | null;
  t_enfermedad: number | null;
  t_conductas: number | null;
  salud_esperada: number | null;
  residual: number | null;
  arquetipo: string | null;
  arquetipo_desc: string | null;
  gemelo: string | null;
  gemelo_brecha: number | null;
  gemelo_km: number | null;
  POV150_value: number | null;
  ACCESS2_CrudePrev: number | null;
  DIABETES_CrudePrev: number | null;
  OBESITY_CrudePrev: number | null;
  MHLTH_CrudePrev: number | null;
  CSMOKING_CrudePrev: number | null;
}

/** Un par de vecinos con realidades opuestas, precalculado por 07_gemelos.py */
export interface GemeloDestacado {
  a: string;
  b: string;
  km: number;
  ciudad: string;
  score_a: number; score_b: number;
  pobreza_a: number; pobreza_b: number;
  diabetes_a: number; diabetes_b: number;
  sin_seguro_a: number; sin_seguro_b: number;
  mayores65_a: number; mayores65_b: number;
}

interface ScoredPayload {
  columns: string[];
  lookups: Record<string, string[]>;
  rows: Record<string, (number | null)[]>;
  gemelos_destacados?: GemeloDestacado[];
}

export interface Datos {
  detalles: Record<string, ZCTADetail>;
  gemelos: GemeloDestacado[];
}

export function desempaquetar(payload: ScoredPayload): Datos {
  const { columns, lookups, rows } = payload;
  const detalles: Record<string, ZCTADetail> = {};

  for (const zcta in rows) {
    const vals = rows[zcta];
    const rec: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      const tabla = lookups[col];
      const v = vals[i];
      rec[col] = tabla ? (typeof v === 'number' && v >= 0 ? tabla[v] : null) : v;
    });
    detalles[zcta] = rec as unknown as ZCTADetail;
  }

  return { detalles, gemelos: payload.gemelos_destacados ?? [] };
}

export async function cargarDatos(url = '/datos/zcta_scored.json'): Promise<Datos> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Datos HTTP ${res.status}`);
  return desempaquetar(await res.json());
}

/**
 * Una comparación está bien controlada cuando las dos zonas tienen una
 * estructura de edad parecida. Si una casi no tiene población mayor, suele
 * tratarse de una base militar o un campus universitario: aparece sana porque
 * su población es joven, no porque su contexto social sea mejor. Varias
 * condiciones crónicas aumentan con la edad, así que sin ese control el
 * contraste no es atribuible al contexto social.
 */
export function brechaEdad(g: GemeloDestacado): number {
  return Math.abs(g.mayores65_a - g.mayores65_b);
}

export function esDefendible(g: GemeloDestacado): boolean {
  return brechaEdad(g) <= 5;
}

/**
 * Color de la rampa de vulnerabilidad para un valor 0-100.
 *
 * Es la MISMA rampa que pinta el mapa, a propósito: si una zona sale coral
 * en el mapa, su barra de perfil también sale coral. Un mismo valor no puede
 * tener dos colores según dónde se mire.
 */
const RAMPA_HEX = [
  '#33505f', '#5d6668', '#856455', '#a75f45', '#c65538', '#e3502f', '#ff6b3d',
];

export function colorVulnerabilidad(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '#787c84';
  const t = Math.min(Math.max(v, 0), 100) / 100;
  return RAMPA_HEX[Math.min(RAMPA_HEX.length - 1, Math.floor(t * RAMPA_HEX.length))];
}
