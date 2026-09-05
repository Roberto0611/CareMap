import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { desempaquetar, colorVulnerabilidad, type ZCTADetail } from '../lib/datos';
import DeckGL from '@deck.gl/react';
import { GeoJsonLayer } from '@deck.gl/layers';
import { FlyToInterpolator } from '@deck.gl/core';
import type { MapViewState, PickingInfo } from '@deck.gl/core';
import { feature as topoFeature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import AIChatModal from '../components/AIChatModal';

// ── Types ─────────────────────────────────────────────────────────────
// Lo que viene DENTRO del geojson: solo lo necesario para pintar.
// s = score 0-100 · c = confiabilidad (2 alta, 1 media, 0 baja, -1 sin datos)
// r = residual: salud real menos la que predice el contexto social
interface ZCTAProps {
  ZCTA5CE20: string;
  s: number | null;
  c: -1 | 0 | 1 | 2;
  r: number | null;
}

/** Qué mide el color del mapa. */
type Modo = 'vulnerabilidad' | 'residual';

interface GeoData {
  type: string;
  features: GeoJSON.Feature<GeoJSON.Geometry, ZCTAProps>[];
}

interface StateMapData {
  zcta_state: Record<string, string>;   // { "10001": "NY", ... }
  state_names: Record<string, string>;  // { "NY": "New York", ... }
}

// ── State Bounding Boxes (lon_min, lat_min, lon_max, lat_max) ─────────
const STATE_BBOX: Record<string, [number, number, number, number]> = {
  AK: [-168.5, 54.0, -130.0, 71.5],
  AL: [-88.5, 30.2, -84.9, 35.0],
  AR: [-94.6, 33.0, -89.6, 36.5],
  AZ: [-114.8, 31.3, -109.0, 37.0],
  CA: [-124.5, 32.5, -114.1, 42.0],
  CO: [-109.1, 36.9, -102.0, 41.0],
  CT: [-73.7, 40.9, -71.8, 42.1],
  DC: [-77.12, 38.79, -76.91, 38.99],
  DE: [-75.8, 38.4, -75.0, 39.8],
  FL: [-87.6, 24.5, -80.0, 31.0],
  GA: [-85.6, 30.4, -80.8, 35.0],
  HI: [-160.3, 18.9, -154.8, 22.3],
  IA: [-96.6, 40.4, -90.1, 43.5],
  ID: [-117.2, 41.9, -111.0, 49.0],
  IL: [-91.5, 36.9, -87.0, 42.5],
  IN: [-88.1, 37.8, -84.8, 41.8],
  KS: [-102.0, 36.9, -94.6, 40.0],
  KY: [-89.6, 36.5, -81.9, 39.1],
  LA: [-94.0, 28.9, -88.8, 33.0],
  MA: [-73.5, 41.2, -69.9, 42.9],
  MD: [-79.5, 37.9, -75.0, 39.7],
  ME: [-71.1, 43.0, -66.9, 47.5],
  MI: [-90.4, 41.7, -82.4, 48.2],
  MN: [-97.2, 43.5, -89.5, 49.4],
  MO: [-95.8, 36.0, -89.1, 40.6],
  MS: [-91.7, 30.2, -88.1, 35.0],
  MT: [-116.1, 44.4, -104.0, 49.0],
  NC: [-84.3, 33.8, -75.5, 36.6],
  ND: [-104.1, 45.9, -96.6, 49.0],
  NE: [-104.1, 40.0, -95.3, 43.0],
  NH: [-72.6, 42.7, -70.7, 45.3],
  NJ: [-75.6, 38.9, -73.9, 41.4],
  NM: [-109.1, 31.3, -103.0, 37.0],
  NV: [-120.0, 35.0, -114.0, 42.0],
  NY: [-79.8, 40.5, -71.9, 45.0],
  OH: [-84.8, 38.4, -80.5, 42.0],
  OK: [-103.0, 33.6, -94.4, 37.0],
  OR: [-124.6, 41.9, -116.5, 46.3],
  PA: [-80.5, 39.7, -74.7, 42.3],
  RI: [-71.9, 41.1, -71.1, 42.0],
  SC: [-83.4, 32.0, -78.5, 35.2],
  SD: [-104.1, 42.5, -96.4, 45.9],
  TN: [-90.3, 34.9, -81.6, 36.7],
  TX: [-106.6, 25.8, -93.5, 36.5],
  UT: [-114.1, 37.0, -109.0, 42.0],
  VA: [-83.7, 36.5, -75.2, 39.5],
  VT: [-73.4, 42.7, -71.5, 45.0],
  WA: [-124.8, 45.5, -116.9, 49.0],
  WI: [-92.9, 42.5, -86.8, 47.1],
  WV: [-82.6, 37.2, -77.7, 40.6],
  WY: [-111.1, 40.9, -104.0, 45.0],
};

function bboxToViewState(bbox: [number, number, number, number]): Partial<MapViewState> {
  const [lonMin, latMin, lonMax, latMax] = bbox;
  const centerLon = (lonMin + lonMax) / 2;
  const centerLat = (latMin + latMax) / 2;
  const spanLon = lonMax - lonMin;
  const spanLat = latMax - latMin;
  // Rough zoom from span
  const zoom = Math.log2(360 / Math.max(spanLon, spanLat * 1.5)) + 0.5;
  return { longitude: centerLon, latitude: centerLat, zoom: Math.max(4, Math.min(zoom, 10)) };
}

/**
 * Rampa de riesgo: pizarra fría (seguro) -> rojo coral (riesgo).
 *
 * Verificada con simulación de daltonismo antes de adoptarla:
 *   · luminancia estrictamente creciente  -> se lee ordenada incluso en
 *     escala de grises o impresa en blanco y negro
 *   · contraste mínimo 2.15:1 contra el fondo oscuro -> el extremo bajo
 *     nunca se confunde con "sin datos" ni con el fondo
 *   · separación mínima entre pasos de 21.5 bajo deuteranopia, protanopia
 *     y tritanopia -> legible para quien no distingue rojo de verde
 *
 * Por eso NO es verde->rojo: ese par colapsa para ~8% de los hombres.
 * Aquí el extremo frío es azul pizarra, que sí se distingue del rojo.
 */
const RAMP: [number, number, number][] = [
  [ 51,  80,  95],  // #33505f  menor vulnerabilidad — frío, recede
  [ 93, 102, 104],  // #5d6668
  [133, 100,  85],  // #856455
  [167,  95,  69],  // #a75f45
  [198,  85,  56],  // #c65538
  [227,  80,  47],  // #e3502f
  [255, 107,  61],  // #ff6b3d  mayor vulnerabilidad — salta a la vista
];

/**
 * Rampa DIVERGENTE para el modo "peor de lo esperado".
 *
 * Aquí sí hay dos polos con un cero con significado, así que la escala va de
 * un extremo frío (la zona está MEJOR de lo que su contexto predice) a uno
 * cálido (PEOR), con un neutro en medio. Verificada igual que la otra:
 * los extremos se separan 194 bajo daltonismo y el paso mínimo es 35.
 */
const RAMP_DIV: [number, number, number][] = [
  [ 57, 135, 229],  // #3987e5  mucho mejor de lo esperado
  [106, 158, 214],  // #6a9ed6
  [143, 163, 184],  // #8fa3b8
  [ 96, 101, 111],  // #60656f  como se esperaba
  [176, 106,  78],  // #b06a4e
  [224,  90,  52],  // #e05a34
  [255, 107,  61],  // #ff6b3d  mucho peor de lo esperado
];

/** ±LIMITE_RESIDUAL puntos cubre el 94% de las zonas; más allá satura. */
const LIMITE_RESIDUAL = 15;

function getColorResidual(r: number | null): [number, number, number] {
  if (r === null || Number.isNaN(r)) return GRIS_SIN_DATOS;
  const t = (Math.min(Math.max(r, -LIMITE_RESIDUAL), LIMITE_RESIDUAL) + LIMITE_RESIDUAL)
    / (2 * LIMITE_RESIDUAL);
  return RAMP_DIV[Math.min(RAMP_DIV.length - 1, Math.floor(t * RAMP_DIV.length))];
}

const GRIS_SIN_DATOS: [number, number, number] = [120, 124, 132];

function getColor(score: number | null): [number, number, number] {
  if (score === null || Number.isNaN(score)) return GRIS_SIN_DATOS;
  const t = Math.min(Math.max(score, 0), 100) / 100;
  return RAMP[Math.min(RAMP.length - 1, Math.floor(t * RAMP.length))];
}

const CONF_LABEL: Record<number, string> = {
  2: 'Alta', 1: 'Media', 0: 'Baja', [-1]: 'Sin datos',
};
const CONF_ICON: Record<number, string> = {
  2: '✔', 1: '○', 0: '⚠', [-1]: '—',
};

function fmtPob(n: number | null) {
  return n === null ? '—' : n.toLocaleString('es-MX');
}

// ── Tooltip ────────────────────────────────────────────────────────────
function Tooltip({ info }: { info: PickingInfo | null }) {
  if (!info?.object) return null;
  const p = info.object.properties as ZCTAProps;
  return (
    <div className="deck-tooltip" style={{ left: info.x, top: info.y }}>
      <div className="tt-zcta">ZCTA {p.ZCTA5CE20}</div>
      <div className="tt-row">
        <span>Vulnerabilidad</span>
        <span className="tt-val">{p.s === null ? 'sin datos' : p.s.toFixed(1)}</span>
      </div>
      <div className="tt-row">
        <span>vs. lo esperado</span>
        <span className="tt-val">
          {p.r === null ? '—' : `${p.r > 0 ? '+' : ''}${p.r.toFixed(0)}`}
        </span>
      </div>
      <div className="tt-row">
        <span>Confiabilidad</span>
        <span className="tt-val">{CONF_ICON[p.c]} {CONF_LABEL[p.c]}</span>
      </div>
    </div>
  );
}

// ── Inspector ──────────────────────────────────────────────────────────
function Inspector({
  zcta, detail, onClose,
}: { zcta: string; detail: ZCTADetail | null; onClose: () => void }) {
  // Los cinco temas, SIEMPRE en el mismo orden y siempre los cinco.
  // Cada barra es el percentil nacional de esa zona en ese tema, no un
  // reparto porcentual: "percentil 99.6 en lo socioeconómico" le dice al
  // usuario dónde está parada la zona en el país.
  const TEMAS = [
    ['Socioeconómico', 't_socioeco'],
    ['Vivienda y conectividad', 't_vivienda'],
    ['Acceso a atención', 't_acceso'],
    ['Carga de enfermedad', 't_enfermedad'],
    ['Conductas de riesgo', 't_conductas'],
  ] as const;

  const factores = detail
    ? TEMAS.map(([nombre, key]) => ({
        nombre,
        pct: (detail[key] as number | null) ?? 0,
        dominante: nombre === detail.factor1,
      }))
    : [];

  const conf = detail?.confiabilidad ?? null;
  const confIcon = conf === 'alta' ? '✔' : conf === 'media' ? '○' : conf === 'baja' ? '⚠' : '—';

  return (
    <div className="inspector">
      <div className="inspector-head">
        <div>
          <div className="field-label" style={{ marginBottom: 4 }}>
            {detail?.county_name ?? 'Zona seleccionada'}
            {detail?.state_abbr ? `, ${detail.state_abbr}` : ''}
          </div>
          <div className="zcta-badge">ZCTA {zcta}</div>
        </div>
        <button className="close-btn" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {!detail ? (
        <div className="prop-grid">
          <div className="prop-item full">
            <div className="prop-val">Sin datos para esta zona.</div>
          </div>
        </div>
      ) : (
        <>
          {/* El número grande: el score manda visualmente */}
          <div className="score-hero">
            <div className="score-num">{detail.score?.toFixed(0) ?? '—'}</div>
            <div className="score-cap">VULNERABILIDAD / 100</div>
            <div className={`conf-chip conf-${conf}`}>
              {confIcon} Confiabilidad {conf ?? 'sin datos'}
            </div>
          </div>

          <div className="prop-grid">
            <div className="prop-item">
              <div className="prop-key">Población</div>
              <div className="prop-val">{fmtPob(detail.poblacion)}</div>
            </div>
            <div className="prop-item">
              <div className="prop-key">Social / Salud</div>
              <div className="prop-val">
                {detail.score_social?.toFixed(0) ?? '—'} / {detail.score_salud?.toFixed(0) ?? '—'}
              </div>
            </div>
          </div>

          {/* Esto es lo que hace accionable el dashboard: dos zonas con el
              mismo score salen con barras distintas -> acciones distintas. */}
          {factores.length > 0 && (
            <div className="desglose">
              <div className="field-label">
                QUÉ LO CAUSA AQUÍ
                <span className="field-hint">percentil nacional</span>
              </div>
              {factores.map((f) => (
                <div className={`bar-row${f.dominante ? ' dominante' : ''}`} key={f.nombre}>
                  <div className="bar-label">{f.nombre}</div>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ width: `${f.pct}%`, background: colorVulnerabilidad(f.pct) }}
                    />
                  </div>
                  <div className="bar-pct">{f.pct.toFixed(0)}</div>
                </div>
              ))}
              {detail.factor1_detalle && (
                <div className="desglose-note">
                  Lo que más pesa: <strong>{detail.factor1_detalle}</strong>
                </div>
              )}
            </div>
          )}

          {/* Contraste entre la salud observada y la que predice el contexto
              social. La brecha señala factores locales no capturados por los
              indicadores socioeconómicos. */}
          {detail.residual !== null && detail.salud_esperada !== null && (
            <div className="desglose">
              <div className="field-label">FRENTE A LO ESPERADO</div>
              <div className="resid-fila">
                <span>Salud esperada por su contexto</span>
                <strong>{detail.salud_esperada.toFixed(0)}</strong>
              </div>
              <div className="resid-fila">
                <span>Salud observada</span>
                <strong>{detail.score_salud?.toFixed(0) ?? '—'}</strong>
              </div>
              <div className={`resid-chip ${detail.residual > 3 ? 'peor' : detail.residual < -3 ? 'mejor' : 'igual'}`}>
                {detail.residual > 3
                  ? `${detail.residual.toFixed(0)} puntos peor de lo esperado`
                  : detail.residual < -3
                    ? `${Math.abs(detail.residual).toFixed(0)} puntos mejor de lo esperado`
                    : 'En línea con lo esperado'}
              </div>
              <p className="resid-nota">
                {detail.residual > 3
                  ? 'La salud de esta comunidad es peor de lo que explica su contexto social. Suele apuntar a barreras locales concretas —cobertura, transporte, oferta de servicios— más que a privación estructural.'
                  : detail.residual < -3
                    ? 'Esta comunidad presenta mejores resultados de salud que otras con contexto social equivalente.'
                    : 'Sus resultados de salud coinciden con los de comunidades de contexto social similar.'}
              </p>
            </div>
          )}

          <div className="prop-grid">
            {([
              ['Pobreza', detail.POV150_value],
              ['Sin seguro', detail.ACCESS2_CrudePrev],
              ['Diabetes', detail.DIABETES_CrudePrev],
              ['Mala salud mental', detail.MHLTH_CrudePrev],
            ] as const).map(([k, v]) => (
              <div className="prop-item" key={k}>
                <div className="prop-key">{k}</div>
                <div className="prop-val">{v === null ? '—' : `${v.toFixed(1)}%`}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Pastel Color Palette (matching reference image style) ───────────────
const PASTEL_PALETTE = [
  { bg: '#ffb4bd', border: '#fda4af' }, // Salmon / Pink (like 800,000 card)
  { bg: '#dbeafe', border: '#bfdbfe' }, // Soft Blue / Lavender (like 100,000 card)
  { bg: '#fef08a', border: '#fde047' }, // Soft Yellow (like 10,000 card)
  { bg: '#bae6fd', border: '#7dd3fc' }, // Soft Sky / Cyan (like Millions card)
  { bg: '#bbf7d0', border: '#86efac' }, // Soft Mint
  { bg: '#fed7aa', border: '#fdba74' }, // Soft Peach
  { bg: '#e9d5ff', border: '#d8b4fe' }, // Soft Purple
];

// ── State Grid Selector ────────────────────────────────────────────────
function StateGrid({
  activeState,
  stateNames,
  onSelect,
}: {
  activeState: string | null;
  stateNames: Record<string, string>;
  onSelect: (abbr: string | null) => void;
}) {
  const sorted = useMemo(() => Object.keys(stateNames).sort(), [stateNames]);
  const stripRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to active state card
  useEffect(() => {
    if (!activeState || !stripRef.current) return;
    const btn = stripRef.current.querySelector(`[data-state="${activeState}"]`) as HTMLElement | null;
    btn?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeState]);

  const handleWheel = (e: React.WheelEvent) => {
    if (stripRef.current && e.deltaY !== 0) {
      stripRef.current.scrollLeft += e.deltaY * 1.5;
    }
  };

  return (
    <div className="state-grid-container">
      <div className="state-grid-strip" ref={stripRef} onWheel={handleWheel}>
        {/* National / USA First Card */}
        <button
          className={`state-card national${!activeState ? ' active' : ''}`}
          onClick={() => onSelect(null)}
          style={{
            backgroundColor: !activeState ? '#ffb4bd' : '#ffd1d7',
          }}
        >
          <div className="state-card-code">USA</div>
          <div className="state-card-label">MAPA NACIONAL</div>
        </button>

        {sorted.map((abbr, idx) => {
          const color = PASTEL_PALETTE[(idx + 1) % PASTEL_PALETTE.length];
          const isActive = activeState === abbr;
          return (
            <button
              key={abbr}
              data-state={abbr}
              className={`state-card${isActive ? ' active' : ''}`}
              onClick={() => onSelect(abbr)}
              style={{
                backgroundColor: color.bg,
                borderColor: isActive ? '#0f172a' : color.border,
              }}
              title={stateNames[abbr]}
            >
              <div className="state-card-code">{abbr}</div>
              <div className="state-card-label">{stateNames[abbr]}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Map Page Component ────────────────────────────────────────────────
export default function MapPage() {
  const [geoData, setGeoData]     = useState<GeoData | null>(null);
  const [stateMap, setStateMap]   = useState<StateMapData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [loadMsg, setLoadMsg]     = useState('Cargando geometrías ZCTA...');
  const [hoverInfo, setHoverInfo] = useState<PickingInfo | null>(null);
  const [selected, setSelected]   = useState<ZCTAProps | null>(null);
  const [detalles, setDetalles]   = useState<Record<string, ZCTADetail> | null>(null);
  // Atenúa las zonas cuyo margen de error es tan grande que la estimación no
  // es informativa; evita rankear ruido estadístico como si fuera vulnerabilidad.
  const [soloConfiables, setSoloConfiables] = useState(false);
  const [modo, setModo] = useState<Modo>('vulnerabilidad');
  const [opacity, setOpacity]     = useState(0.72);
  const [searchVal, setSearchVal] = useState('');
  const [activeState, setActiveState] = useState<string | null>(null);
  const [isAiModalOpen, setIsAiModalOpen] = useState(true);
  const [highlightedZctas, setHighlightedZctas] = useState<Set<string>>(new Set());

  const [viewState, setViewState] = useState<MapViewState>({
    longitude: -98.58, latitude: 39.83,
    zoom: 3.5, pitch: 0, bearing: 0,
  });

  const handleHighlightZctas = useCallback(
    (zctas: string[]) => {
      const zctaSet = new Set(zctas);
      setHighlightedZctas(zctaSet);

      if (!geoData || zctas.length === 0) return;

      const matched = geoData.features.filter((f) =>
        zctaSet.has(f.properties.ZCTA5CE20)
      );
      if (matched.length > 0) {
        let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
        matched.forEach((feat) => {
          const coords =
            feat.geometry?.type === 'MultiPolygon'
              ? (feat.geometry as any).coordinates[0][0]
              : (feat.geometry as any).coordinates[0];
          if (coords) {
            coords.forEach((c: number[]) => {
              if (c[0] < minLon) minLon = c[0];
              if (c[0] > maxLon) maxLon = c[0];
              if (c[1] < minLat) minLat = c[1];
              if (c[1] > maxLat) maxLat = c[1];
            });
          }
        });

        if (minLon !== Infinity) {
          const centerLon = (minLon + maxLon) / 2;
          const centerLat = (minLat + maxLat) / 2;
          const spanLon = maxLon - minLon;
          const spanLat = maxLat - minLat;
          const zoom =
            matched.length === 1
              ? 10
              : Math.max(
                  4,
                  Math.min(
                    Math.log2(360 / Math.max(spanLon, spanLat * 1.5)) + 0.5,
                    9.5
                  )
                );

          setViewState((v) => ({
            ...v,
            longitude: centerLon,
            latitude: centerLat,
            zoom,
            transitionDuration: 1100,
            transitionInterpolator: new FlyToInterpolator({ speed: 1.5 }),
          }));
        }
      }
    },
    [geoData]
  );


  // ── Load both data sources in parallel ──
  useEffect(() => {
    (async () => {
      try {
        const [geoRes, stateRes, scoreRes] = await Promise.all([
          // TopoJSON en vez de GeoJSON: las 33,790 zonas son un mosaico, así
          // que cada frontera se guarda una sola vez en vez de dos.
          // Medido: 4.72 MB -> 2.63 MB comprimido.
          fetch('/mapa/zcta_data.topojson'),
          fetch('/mapa/zcta_state_map.json'),
          fetch('/datos/zcta_scored.json'),   // el detalle para el panel
        ]);
        if (!geoRes.ok) throw new Error(`TopoJSON HTTP ${geoRes.status}`);
        if (!stateRes.ok) throw new Error(`StateMap HTTP ${stateRes.status}`);
        if (!scoreRes.ok) throw new Error(`Scores HTTP ${scoreRes.status}`);

        setLoadMsg('Procesando 33k polígonos…');
        const [topo, sm, scored] = await Promise.all([
          geoRes.json(),
          stateRes.json(),
          scoreRes.json(),
        ]);

        // Reconstituye los polígonos a partir de los arcos compartidos.
        const geo = topoFeature(
          topo as Topology,
          (topo as Topology).objects.data as GeometryCollection,
        ) as unknown as GeoData;

        const { detalles: detalle } = desempaquetar(scored);
        setDetalles(detalle);
        setGeoData(geo);
        setStateMap(sm);
        setLoading(false);
      } catch (e: any) {
        setLoadMsg(`Error: ${e.message}`);
      }
    })();
  }, []);

  // ── Filtered features for the active state ──
  const filteredFeatures = useMemo(() => {
    if (!geoData || !stateMap) return null;
    if (!activeState) return geoData; // show all for national

    const allowed = new Set(
      Object.entries(stateMap.zcta_state)
        .filter(([, st]) => st === activeState)
        .map(([zcta]) => zcta)
    );

    return {
      ...geoData,
      features: geoData.features.filter(
        (f) => allowed.has(f.properties.ZCTA5CE20)
      ),
    };
  }, [geoData, stateMap, activeState]);

  // ── State stats ──
  const stateStats = useMemo(() => {
    if (!filteredFeatures) return { count: 0, scorePromedio: 0, confiables: 0 };
    let suma = 0, n = 0, confiables = 0;
    filteredFeatures.features.forEach((f) => {
      const { s, c } = f.properties;
      if (s !== null) { suma += s; n += 1; }
      if (c === 2) confiables += 1;
    });
    return {
      count: filteredFeatures.features.length,
      scorePromedio: n ? suma / n : 0,
      confiables,
    };
  }, [filteredFeatures]);

  // ── GeoJSON layer ──
  const layers = filteredFeatures
    ? [
        new GeoJsonLayer({
          id: `zcta-${activeState ?? 'national'}`,
          data: filteredFeatures as unknown as GeoJSON.FeatureCollection,
          pickable: true,
          stroked: true,
          filled: true,
          lineWidthMinPixels: 0.4,
          lineWidthMaxPixels: 6,
          getFillColor: (feature: any) => {
            const p = feature.properties as ZCTAProps;
            // Con el interruptor prendido, las zonas no confiables se apagan
            // en vez de desaparecer: así se ve QUE existen pero no se rankean.
            if (soloConfiables && p.c < 2) return [...GRIS_SIN_DATOS, 40];
            const [r, g, b] = modo === 'residual'
              ? getColorResidual(p.r)
              : getColor(p.s);
            return [r, g, b, Math.round(220 * opacity)];
          },
          getLineColor: (feature: any) => {
            const p = feature.properties as ZCTAProps;
            if (highlightedZctas.has(p.ZCTA5CE20)) {
              return [255, 220, 0, 255]; // Oro brillante para resaltar resultados IA
            }
            return [255, 255, 255, 25];
          },
          getLineWidth: (feature: any) => {
            const p = feature.properties as ZCTAProps;
            return highlightedZctas.has(p.ZCTA5CE20) ? 3.5 : 0.4;
          },
          onHover: setHoverInfo,
          onClick: (info: PickingInfo) => {
            if (!info.object) { setSelected(null); return; }
            setSelected(info.object.properties as ZCTAProps);
            if (info.coordinate) {
              setViewState((v) => ({
                ...v,
                longitude: info.coordinate![0],
                latitude:  info.coordinate![1],
                zoom: Math.max(v.zoom, 9),
                transitionDuration: 700,
                transitionInterpolator: new FlyToInterpolator({ speed: 1.8 }),
              }));
            }
          },
          updateTriggers: {
            getFillColor: [opacity, activeState, soloConfiables, modo],
            getLineColor: [highlightedZctas],
            getLineWidth: [highlightedZctas],
          },
        }),
      ]
    : [];

  // ── Handle tab change ──
  const handleStateSelect = useCallback(
    (abbr: string | null) => {
      setActiveState(abbr);
      setSelected(null);
      setSearchVal('');

      if (!abbr) {
        // Go to national view
        setViewState((v) => ({
          ...v,
          longitude: -98.58, latitude: 39.83, zoom: 3.5,
          transitionDuration: 1200,
          transitionInterpolator: new FlyToInterpolator({ speed: 1.3 }),
        }));
        return;
      }

      const bbox = STATE_BBOX[abbr];
      if (bbox) {
        const vs = bboxToViewState(bbox);
        setViewState((v) => ({
          ...v, ...vs,
          transitionDuration: 1000,
          transitionInterpolator: new FlyToInterpolator({ speed: 1.6 }),
        }));
      }
    },
    []
  );

  // ── Search ──
  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const q = searchVal.trim().padStart(5, '0');
      if (!geoData) return;

      const feat = geoData.features.find(
        (f) => f.properties.ZCTA5CE20 === q
      );
      if (!feat) { alert(`ZCTA "${searchVal.trim()}" no encontrado.`); return; }

      // If state tab is active, switch to its state if needed
      if (stateMap) {
        const st = stateMap.zcta_state[q];
        if (st && st !== activeState) setActiveState(st);
      }

      setSelected(feat.properties);
      const coords = feat.geometry?.type === 'MultiPolygon'
        ? (feat.geometry as any).coordinates[0][0]
        : (feat.geometry as any).coordinates[0];
      if (coords) {
        const lons = coords.map((c: number[]) => c[0]);
        const lats = coords.map((c: number[]) => c[1]);
        setViewState((v) => ({
          ...v,
          longitude: (Math.min(...lons) + Math.max(...lons)) / 2,
          latitude:  (Math.min(...lats) + Math.max(...lats)) / 2,
          zoom: 10,
          transitionDuration: 900,
          transitionInterpolator: new FlyToInterpolator({ speed: 1.6 }),
        }));
      }
    },
    [geoData, stateMap, searchVal, activeState]
  );

  const stateLabel = activeState
    ? stateMap?.state_names[activeState] ?? activeState
    : 'Estados Unidos';

  return (
    <div className="shell">
      {/* ── State Grid Selector (replaces topbar & tabs) ── */}
      {!loading && stateMap && (
        <StateGrid
          activeState={activeState}
          stateNames={stateMap.state_names}
          onSelect={handleStateSelect}
        />
      )}

      {/* ── Canvas ── */}
      <div className="canvas-wrap">
        {loading && (
          <div className="loading-screen">
            <div className="pulse-ring"><div className="pulse-ring-inner" /></div>
            <div className="loading-label">{loadMsg}</div>
            <div className="loading-sub">
              33,791 códigos postales ZCTA · EE.UU.<br/>
              Cargando mapa y tabla de estados…
            </div>
          </div>
        )}

        <DeckGL
          viewState={viewState}
          onViewStateChange={({ viewState: vs }: any) => setViewState(vs)}
          controller
          layers={layers}
          style={{ width: '100%', height: '100%', background: '#000000' }}
          getCursor={({ isHovering }: any) => (isHovering ? 'pointer' : 'grab')}
        />

        <Tooltip info={hoverInfo} />

        {/* Left panel */}
        {!loading && (
          <div className="left-panel">
            {/* State info card (only when state active) */}
            {activeState && stateMap && (
              <div className="glass-card">
                <div className="state-card-header">
                  <div>
                    <div className="state-name-big">
                      {stateMap.state_names[activeState] ?? activeState}
                    </div>
                    <div className="state-abbr-sub">{activeState}</div>
                  </div>
                </div>
                <div className="mini-stat-row">
                  <div className="mini-stat">
                    <div className="mini-stat-key">ZCTAs</div>
                    <div className="mini-stat-val">{stateStats.count.toLocaleString()}</div>
                  </div>
                  <div className="mini-stat">
                    <div className="mini-stat-key">Tierra</div>
                    <div className="mini-stat-val">{stateStats.scorePromedio.toFixed(1)}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Search */}
            <div className="glass-card">
              <form onSubmit={handleSearch} className="search-wrap">
                <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text" className="search-input"
                  placeholder={activeState
                    ? `Buscar ZCTA en ${stateLabel}…`
                    : 'Buscar ZCTA (ej. 30114)…'}
                  value={searchVal}
                  onChange={(e) => setSearchVal(e.target.value)}
                />
              </form>
            </div>

            {/* Style controls */}
            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Dos preguntas distintas sobre el mismo mapa: dónde está peor,
                  y dónde la salud no se explica por el contexto social. */}
              <div>
                <label className="field-label">El mapa muestra</label>
                <div className="modo-switch">
                  <button
                    type="button"
                    className={modo === 'vulnerabilidad' ? 'on' : ''}
                    onClick={() => setModo('vulnerabilidad')}
                  >
                    Vulnerabilidad
                  </button>
                  <button
                    type="button"
                    className={modo === 'residual' ? 'on' : ''}
                    onClick={() => setModo('residual')}
                  >
                    Peor de lo esperado
                  </button>
                </div>
                <p className="modo-nota">
                  {modo === 'vulnerabilidad'
                    ? 'Qué tan desfavorable es la situación de cada zona, combinando contexto social y resultados de salud.'
                    : 'Diferencia entre la salud observada y la que predice el contexto social de la zona. El naranja marca comunidades más enfermas de lo que su situación explica.'}
                </p>
              </div>

              <Link className="gem-link" to="/gemelos">
                Ver gemelos geográficos →
              </Link>
              <Link className="gem-link" to="/asignador">
                Asignar recursos →
              </Link>

              {/* Atenúa las zonas cuya estimación no es confiable, para que
                  el ranking no lo dominen áreas con muy poca población. */}
              <div>
                <label className="field-label">Confiabilidad del dato</label>
                <button
                  type="button"
                  className={`conf-toggle${soloConfiables ? ' on' : ''}`}
                  onClick={() => setSoloConfiables((v) => !v)}
                >
                  <span className="conf-toggle-track"><span className="conf-toggle-knob" /></span>
                  {soloConfiables ? 'Solo zonas confiables' : 'Todas las zonas'}
                </button>
              </div>
              <div>
                <label className="field-label">Opacidad</label>
                <div className="slider-row">
                  <input
                    type="range" className="slider" min={0.2} max={1} step={0.05}
                    value={opacity}
                    onChange={(e) => setOpacity(parseFloat(e.target.value))}
                  />
                  <span className="slider-val">{Math.round(opacity * 100)}%</span>
                </div>
              </div>
              {(
                <div>
                  <label className="field-label">
                    {modo === 'residual' ? 'Desviación respecto a lo esperado' : 'Índice de vulnerabilidad'}
                  </label>
                  <div className={modo === 'residual' ? 'legend-bar div' : 'legend-bar'} />
                  <div className="legend-ends">
                    {modo === 'residual'
                      ? <><span>Mejor</span><span>Como se esperaba</span><span>Peor</span></>
                      : <><span>Menor</span><span>Mayor</span></>}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Inspector */}
        {selected && (
          <Inspector
            zcta={selected.ZCTA5CE20}
            detail={detalles?.[selected.ZCTA5CE20] ?? null}
            onClose={() => setSelected(null)}
          />
        )}

        {/* AI Chat Modal / Floating Bottom Chat (Apple Monochrome Style) */}
        <AIChatModal
          isOpen={isAiModalOpen}
          onClose={() => setIsAiModalOpen(false)}
          onOpen={() => setIsAiModalOpen(true)}
          onHighlightZctas={handleHighlightZctas}
          highlightedCount={highlightedZctas.size}
          onClearHighlight={() => setHighlightedZctas(new Set())}
        />
      </div>
    </div>
  );
}
