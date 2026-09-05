import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import { GeoJsonLayer } from '@deck.gl/layers';
import { FlyToInterpolator } from '@deck.gl/core';
import type { MapViewState, PickingInfo } from '@deck.gl/core';

// ── Types ─────────────────────────────────────────────────────────────
interface ZCTAProps {
  ZCTA5CE20: string;
  AFFGEOID20: string;
  GEOID20: string;
  NAME20: string;
  LSAD20: string;
  ALAND20: number;
  AWATER20: number;
}

interface GeoData {
  type: string;
  features: GeoJSON.Feature<GeoJSON.Geometry, ZCTAProps>[];
}

interface StateMapData {
  zcta_state: Record<string, string>;   // { "10001": "NY", ... }
  state_names: Record<string, string>;  // { "NY": "New York", ... }
}

type ColorMetric = 'ALAND20' | 'AWATER20' | 'UNIFORM';

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

type ColorMetricKey = 'ALAND20' | 'AWATER20';

function getColor(
  val: number, max: number, metric: ColorMetric, isState: boolean
): [number, number, number, number] {
  if (metric === 'UNIFORM') return isState ? [34, 211, 238, 190] : [99, 179, 237, 175];
  if (max === 0) return [26, 54, 93, 160];
  const t = Math.min(Math.max(val / max, 0), 1);
  if (t < 0.2)  return [26, 54, 93, 160];
  if (t < 0.4)  return [37, 99, 235, 185];
  if (t < 0.6)  return [34, 211, 238, 200];
  if (t < 0.8)  return [52, 211, 153, 210];
  return [251, 191, 36, 220];
}

function fmtArea(m2: number) {
  const km2 = m2 / 1_000_000;
  return km2 >= 10_000
    ? `${(km2 / 1000).toFixed(1)}k km²`
    : `${km2.toFixed(1)} km²`;
}

// ── Tooltip ────────────────────────────────────────────────────────────
function Tooltip({ info }: { info: PickingInfo | null }) {
  if (!info?.object) return null;
  const p = info.object.properties as ZCTAProps;
  return (
    <div className="deck-tooltip" style={{ left: info.x, top: info.y }}>
      <div className="tt-zcta">ZCTA {p.ZCTA5CE20}</div>
      <div className="tt-row"><span>Terrestre</span><span className="tt-val">{fmtArea(p.ALAND20 ?? 0)}</span></div>
      <div className="tt-row"><span>Agua</span><span className="tt-val">{fmtArea(p.AWATER20 ?? 0)}</span></div>
    </div>
  );
}

// ── Inspector ──────────────────────────────────────────────────────────
function Inspector({ props, onClose }: { props: ZCTAProps; onClose: () => void }) {
  return (
    <div className="inspector">
      <div className="inspector-head">
        <div>
          <div className="field-label" style={{ marginBottom: 4 }}>Polígono seleccionado</div>
          <div className="zcta-badge">ZCTA {props.ZCTA5CE20}</div>
        </div>
        <button className="close-btn" onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className="prop-grid">
        <div className="prop-item">
          <div className="prop-key">GEOID</div>
          <div className="prop-val">{props.GEOID20}</div>
        </div>
        <div className="prop-item">
          <div className="prop-key">Tipo</div>
          <div className="prop-val">{props.LSAD20 === 'Z5' ? 'ZCTA-5' : props.LSAD20}</div>
        </div>
        <div className="prop-item">
          <div className="prop-key">Área Terrestre</div>
          <div className="prop-val">{fmtArea(props.ALAND20 ?? 0)}</div>
        </div>
        <div className="prop-item">
          <div className="prop-key">Área de Agua</div>
          <div className="prop-val">{fmtArea(props.AWATER20 ?? 0)}</div>
        </div>
        <div className="prop-item full">
          <div className="prop-key">AFFGEOID</div>
          <div className="prop-val" style={{ fontSize: '0.75rem' }}>{props.AFFGEOID20}</div>
        </div>
      </div>
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

// ── Main App ───────────────────────────────────────────────────────────
export default function App() {
  const [geoData, setGeoData]     = useState<GeoData | null>(null);
  const [stateMap, setStateMap]   = useState<StateMapData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [loadMsg, setLoadMsg]     = useState('Cargando geometrías ZCTA...');
  const [hoverInfo, setHoverInfo] = useState<PickingInfo | null>(null);
  const [selected, setSelected]   = useState<ZCTAProps | null>(null);
  const [colorMetric, setColorMetric] = useState<ColorMetric>('ALAND20');
  const [opacity, setOpacity]     = useState(0.72);
  const [searchVal, setSearchVal] = useState('');
  const [activeState, setActiveState] = useState<string | null>(null);

  const [viewState, setViewState] = useState<MapViewState>({
    longitude: -98.58, latitude: 39.83,
    zoom: 3.5, pitch: 0, bearing: 0,
  });

  const maxVal = useRef({ ALAND20: 1, AWATER20: 1 });

  // ── Load both data sources in parallel ──
  useEffect(() => {
    (async () => {
      try {
        const [geoRes, stateRes] = await Promise.all([
          fetch('/mapa/zcta_simple.geojson'),
          fetch('/mapa/zcta_state_map.json'),
        ]);
        if (!geoRes.ok) throw new Error(`GeoJSON HTTP ${geoRes.status}`);
        if (!stateRes.ok) throw new Error(`StateMap HTTP ${stateRes.status}`);

        setLoadMsg('Procesando 33k polígonos…');
        const [geo, sm]: [GeoData, StateMapData] = await Promise.all([
          geoRes.json(),
          stateRes.json(),
        ]);

        let mxLand = 0, mxWater = 0;
        geo.features.forEach((f) => {
          if ((f.properties.ALAND20 ?? 0) > mxLand)  mxLand  = f.properties.ALAND20;
          if ((f.properties.AWATER20 ?? 0) > mxWater) mxWater = f.properties.AWATER20;
        });
        maxVal.current = { ALAND20: mxLand || 1, AWATER20: mxWater || 1 };

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
    if (!filteredFeatures) return { count: 0, landKm: 0, waterKm: 0 };
    let land = 0, water = 0;
    filteredFeatures.features.forEach((f) => {
      land  += f.properties.ALAND20  ?? 0;
      water += f.properties.AWATER20 ?? 0;
    });
    return {
      count:   filteredFeatures.features.length,
      landKm:  Math.round(land / 1_000_000),
      waterKm: Math.round(water / 1_000_000),
    };
  }, [filteredFeatures]);

  // ── Max for state-relative color scale ──
  const stateMaxVal = useMemo(() => {
    if (!filteredFeatures || !activeState) return maxVal.current;
    let mxL = 0, mxW = 0;
    filteredFeatures.features.forEach((f) => {
      if ((f.properties.ALAND20 ?? 0) > mxL)  mxL  = f.properties.ALAND20;
      if ((f.properties.AWATER20 ?? 0) > mxW)  mxW  = f.properties.AWATER20;
    });
    return { ALAND20: mxL || 1, AWATER20: mxW || 1 };
  }, [filteredFeatures, activeState]);

  // ── GeoJSON layer ──
  const layers = filteredFeatures
    ? [
        new GeoJsonLayer({
          id: `zcta-${activeState ?? 'national'}`,
          data: filteredFeatures,
          pickable: true,
          stroked: true,
          filled: true,
          lineWidthMinPixels: 0.4,
          lineWidthMaxPixels: 1.5,
          getFillColor: (feature: any) => {
            const p = feature.properties as ZCTAProps;
            const metric: ColorMetricKey = colorMetric === 'AWATER20' ? 'AWATER20' : 'ALAND20';
            const [r, g, b, a] = getColor(
              p[metric] ?? 0, stateMaxVal[metric], colorMetric, !!activeState
            );
            return [r, g, b, Math.round(a * opacity)];
          },
          getLineColor: [255, 255, 255, 25],
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
          updateTriggers: { getFillColor: [colorMetric, opacity, activeState, stateMaxVal] },
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
                    <div className="mini-stat-val">{stateStats.landKm.toLocaleString()} km²</div>
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
              <div>
                <label className="field-label">Colorear por</label>
                <select
                  className="color-select"
                  value={colorMetric}
                  onChange={(e) => setColorMetric(e.target.value as ColorMetric)}
                >
                  <option value="ALAND20">Área Terrestre (km²)</option>
                  <option value="AWATER20">Área de Agua (km²)</option>
                  <option value="UNIFORM">Color uniforme</option>
                </select>
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
              {colorMetric !== 'UNIFORM' && (
                <div>
                  <label className="field-label">
                    Escala {activeState ? `(relativa a ${activeState})` : '(nacional)'}
                  </label>
                  <div className="legend-bar" />
                  <div className="legend-ends"><span>Menor</span><span>Mayor</span></div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Inspector */}
        {selected && (
          <Inspector props={selected} onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  );
}
