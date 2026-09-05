/**
 * Asignación de recursos limitados entre zonas.
 *
 * Usuario: un director estatal de salud pública que debe colocar un número
 * finito de recursos (unidades móviles, brigadas, programas) y quiere
 * maximizar personas alcanzadas por peso invertido.
 *
 * El punto NO es que el algoritmo decida. Es hacer visible un intercambio que
 * hoy nadie ve: elegir "las zonas con peor índice" es lo intuitivo, pero deja
 * fuera a mucha gente porque las zonas más extremas suelen ser las más chicas.
 * Medido en Texas con 8 unidades: 199,904 personas por el criterio obvio contra
 * 632,397 ponderando población. Mismo presupuesto, 3.2× más alcance — y aun así
 * el criterio obvio tiene defensa, porque las zonas chicas y extremas son reales.
 * Por eso el peso entre gravedad y alcance es un control del usuario, no una
 * constante escondida en el código.
 */

import type { ZCTADetail } from './datos';

export interface Candidato extends ZCTADetail {
  zcta: string;
}

export interface OpcionesAsignacion {
  /** Cuántos recursos hay que colocar. */
  recursos: number;
  /** Abreviatura del estado, o null para todo el país. */
  estado: string | null;
  /**
   * 0 = priorizar gravedad (las zonas con peor índice)
   * 1 = priorizar alcance (llegar a más personas)
   */
  balance: number;
  /**
   * Separación mínima en km entre zonas elegidas. Evita concentrar todos los
   * recursos en barrios contiguos de una misma ciudad, que para un despliegue
   * estatal suele ser indeseable. 0 lo desactiva.
   */
  separacionKm: number;
  /** Índice mínimo para que una zona sea candidata. */
  scoreMinimo: number;
}

export interface Asignacion {
  elegidas: Candidato[];
  alcance: number;
  /** La misma cantidad de recursos puesta en las zonas de peor índice. */
  alcanceIngenuo: number;
  elegidasIngenuo: Candidato[];
  candidatas: number;
  descartadasPorRuido: number;
}

const RADIO_TIERRA_KM = 6371;

function distanciaKm(a: Candidato, b: Candidato): number {
  if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) {
    return Infinity;
  }
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.sqrt(h));
}

/**
 * Impacto estimado de colocar un recurso en la zona.
 *
 * Con balance=0 solo pesa la gravedad; con balance=1 solo el tamaño de la
 * población. En medio, el producto de ambos: es la forma estándar de medir
 * carga en salud pública (cuánta gente y qué tan mal está).
 */
function impacto(z: Candidato, balance: number, poblacionMax: number): number {
  const gravedad = (z.score ?? 0) / 100;
  const alcance = poblacionMax > 0 ? (z.poblacion ?? 0) / poblacionMax : 0;
  return gravedad ** (1 - balance) * alcance ** balance;
}

export function asignar(
  detalles: Record<string, ZCTADetail>,
  opciones: OpcionesAsignacion,
): Asignacion {
  const { recursos, estado, balance, separacionKm, scoreMinimo } = opciones;

  const enEstado = Object.entries(detalles)
    .map(([zcta, d]) => ({ zcta, ...d }) as Candidato)
    .filter((z) => (estado ? z.state_abbr === estado : true))
    .filter((z) => z.score != null && z.poblacion != null && z.score >= scoreMinimo);

  // Una estimación con margen de error enorme no puede sostener una decisión
  // de presupuesto: se excluye de las candidatas y se reporta cuántas fueron.
  const candidatas = enEstado.filter((z) => z.confiabilidad === 'alta');
  const descartadasPorRuido = enEstado.length - candidatas.length;

  const poblacionMax = Math.max(1, ...candidatas.map((z) => z.poblacion ?? 0));
  const ordenadas = [...candidatas].sort(
    (a, b) => impacto(b, balance, poblacionMax) - impacto(a, balance, poblacionMax),
  );

  const elegidas: Candidato[] = [];
  for (const z of ordenadas) {
    if (elegidas.length >= recursos) break;
    if (separacionKm > 0 && elegidas.some((e) => distanciaKm(e, z) < separacionKm)) {
      continue;
    }
    elegidas.push(z);
  }

  // Referencia: lo que saldría de ordenar por índice y ya.
  const elegidasIngenuo = [...candidatas]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, recursos);

  const suma = (xs: Candidato[]) => xs.reduce((t, z) => t + (z.poblacion ?? 0), 0);

  return {
    elegidas,
    alcance: suma(elegidas),
    elegidasIngenuo,
    alcanceIngenuo: suma(elegidasIngenuo),
    candidatas: candidatas.length,
    descartadasPorRuido,
  };
}
