import React, { useState, useCallback, useEffect, useRef } from 'react';
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
  features: any[];
}

type ColorMetric = 'ALAND20' | 'AWATER20' | 'UNIFORM';

// ── Color helper ──────────────────────────────────────────────────────
function getColor(val: number, max: number, metric: ColorMetric): [number, number, number, number] {
  if (metric === 'UNIFORM') return [99, 179, 237, 180];
  if (max === 0) return [30, 54, 93, 160];
  const t = Math.min(Math.max(val / max, 0), 1);
  // 5-stop gradient: dark-navy → blue → cyan → emerald → amber → rose
  if (t < 0.2)  return [26, 54, 93, 160];
  if (t < 0.4)  return [37, 99, 235, 185];
  if (t < 0.6)  return [34, 211, 238, 200];
  if (t < 0.8)  return [52, 211, 153, 210];
  return [251, 191, 36, 220];
}

function fmtArea(m2: number) {
  const km2 = m2 / 1_000_000;
  return km2 >= 1000
    ? `${(km2 / 1000).toFixed(1)} Mkm²`
    : `${km2.toFixed(2)} km²`;
}

// ── Tooltip Component ─────────────────────────────────────────────────
function Tooltip({ info }: { info: PickingInfo | null }) {
  if (!info?.object) return null;
  const p = info.object.properties as ZCTAProps;
  return (
    <div
      className="deck-tooltip"
      style={{ left: (info.x ?? 0) + 14, top: (info.y ?? 0) - 10 }}
    >
      <div className="tt-zcta">ZCTA {p.ZCTA5CE20}</div>
      <div className="tt-row">
        <span>Terrestre</span>
        <span className="tt-val">{fmtArea(p.ALAND20 ?? 0)}</span>
      </div>
      <div className="tt-row">
        <span>Agua</span>
        <span className="tt-val">{fmtArea(p.AWATER20 ?? 0)}</span>
      </div>
    </div>
  );
}

// ── Inspector Panel ───────────────────────────────────────────────────
function Inspector({
  props,
  onClose,
}: {
  props: ZCTAProps;
  onClose: () => void;
}) {
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
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="prop-grid">
        <div className="prop-item">
          <div className="prop-key">GEOID</div>
          <div className="prop-val">{props.GEOID20}</div>
        </div>
        <div className="prop-item">
          <div className="prop-key">Clasificación</div>
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
          <div className="prop-val" style={{ fontSize: '0.78rem' }}>{props.AFFGEOID20}</div>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────
export default function App() {
  const [geoData, setGeoData] = useState<GeoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadMsg, setLoadMsg] = useState('Cargando geometrías ZCTA...');
  const [hoverInfo, setHoverInfo] = useState<PickingInfo | null>(null);
  const [selected, setSelected] = useState<ZCTAProps | null>(null);
  const [colorMetric, setColorMetric] = useState<ColorMetric>('ALAND20');
  const [opacity, setOpacity] = useState(0.7);
  const [searchVal, setSearchVal] = useState('');
  const [stats, setStats] = useState({ count: 0, landKm: 0 });

  const [viewState, setViewState] = useState<MapViewState>({
    longitude: -98.58,
    latitude: 39.83,
    zoom: 3.5,
    pitch: 0,
    bearing: 0,
  });

  const maxVal = useRef({ ALAND20: 1, AWATER20: 1 });

  // Load GeoJSON
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/mapa/zcta_simple.geojson');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setLoadMsg('Procesando 33k polígonos...');
        const data: GeoData = await r.json();

        let maxLand = 0, maxWater = 0, totalLand = 0;
        data.features.forEach((f) => {
          const p = f.properties as ZCTAProps;
          if ((p.ALAND20 ?? 0) > maxLand) maxLand = p.ALAND20;
          if ((p.AWATER20 ?? 0) > maxWater) maxWater = p.AWATER20;
          totalLand += p.ALAND20 ?? 0;
        });
        maxVal.current = { ALAND20: maxLand || 1, AWATER20: maxWater || 1 };

        setStats({ count: data.features.length, landKm: Math.round(totalLand / 1_000_000) });
        setGeoData(data);
        setLoading(false);
      } catch (e: any) {
        setLoadMsg(`Error: ${e.message}`);
      }
    })();
  }, []);

  // GeoJSON layer
  const layers = geoData
    ? [
        new GeoJsonLayer({
          id: 'zcta-layer',
          data: geoData,
          pickable: true,
          stroked: true,
          filled: true,
          lineWidthMinPixels: 0.5,
          lineWidthMaxPixels: 1.5,

          getFillColor: (feature: any) => {
            const p = feature.properties as ZCTAProps;
            const metric = colorMetric === 'AWATER20' ? 'AWATER20' : 'ALAND20';
            const [r, g, b, a] = getColor(p[metric] ?? 0, maxVal.current[metric], colorMetric);
            return [r, g, b, Math.round(a * opacity)];
          },
          getLineColor: (_: any, info: any) =>
            info?.index === (selected ? -1 : -1) ? [99, 179, 237, 200] : [255, 255, 255, 30],
          lineWidthScale: 1,

          onHover: setHoverInfo,
          onClick: (info: PickingInfo) => {
            if (!info.object) { setSelected(null); return; }
            const p = info.object.properties as ZCTAProps;
            setSelected(p);
            // Fly to bounding box centroid of clicked feature
            if (info.coordinate) {
              setViewState((v) => ({
                ...v,
                longitude: info.coordinate![0],
                latitude:  info.coordinate![1],
                zoom: Math.max(v.zoom, 8),
                transitionDuration: 800,
                transitionInterpolator: new FlyToInterpolator({ speed: 1.5 }),
              }));
            }
          },

          updateTriggers: {
            getFillColor: [colorMetric, opacity],
          },
        }),
      ]
    : [];

  // Search handler
  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const q = searchVal.trim().padStart(5, '0');
      if (!geoData) return;
      const feat = geoData.features.find(
        (f) => (f.properties as ZCTAProps).ZCTA5CE20 === q
      );
      if (!feat) { alert(`ZCTA "${searchVal.trim()}" no encontrado.`); return; }
      setSelected(feat.properties as ZCTAProps);
      // Fly to approximate centroid (first coordinate of first ring)
      const coords = feat.geometry?.coordinates;
      if (coords) {
        const flat = feat.geometry.type === 'MultiPolygon' ? coords[0][0] : coords[0];
        const lons = flat.map((c: number[]) => c[0]);
        const lats = flat.map((c: number[]) => c[1]);
        const lon = (Math.min(...lons) + Math.max(...lons)) / 2;
        const lat = (Math.min(...lats) + Math.max(...lats)) / 2;
        setViewState((v) => ({
          ...v, longitude: lon, latitude: lat, zoom: 10,
          transitionDuration: 1000,
          transitionInterpolator: new FlyToInterpolator({ speed: 1.6 }),
        }));
      }
    },
    [geoData, searchVal]
  );

  const resetView = () => {
    setViewState({
      longitude: -98.58, latitude: 39.83, zoom: 3.5, pitch: 0, bearing: 0,
      transitionDuration: 1200,
      transitionInterpolator: new FlyToInterpolator({ speed: 1.4 }),
    });
    setSelected(null);
  };

  return (
    <div className="shell">
      {/* Topbar */}
      <header className="topbar">
        <div className="brand">
          <div className="brand-logo">🗺</div>
          <div className="brand-text">
            <div className="title">DataRush — ZCTA Analytics</div>
            <div className="sub">Canvas WebGL · CDC PLACES + ACS SDOH</div>
          </div>
        </div>
        <div className="topbar-right">
          {!loading && (
            <>
              <div className="chip">
                ZCTAs: <strong>{stats.count.toLocaleString()}</strong>
              </div>
              <div className="chip">
                Tierra: <strong>{stats.landKm.toLocaleString()} km²</strong>
              </div>
            </>
          )}
          <button className="btn-ghost" onClick={resetView}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Vista EE.UU.
          </button>
        </div>
      </header>

      {/* Canvas area */}
      <div className="canvas-wrap">
        {/* Loading screen */}
        {loading && (
          <div className="loading-screen">
            <div className="pulse-ring">
              <div className="pulse-ring-inner" />
            </div>
            <div className="loading-label">{loadMsg}</div>
            <div className="loading-sub">33,791 polígonos de códigos postales • EE.UU.</div>
          </div>
        )}

        {/* deck.gl — renders on a single <canvas> element */}
        <DeckGL
          viewState={viewState}
          onViewStateChange={({ viewState: vs }: any) => setViewState(vs)}
          controller
          layers={layers}
          style={{ width: '100%', height: '100%', background: '#070c15' }}
          getCursor={({ isHovering }: any) => (isHovering ? 'pointer' : 'grab')}
        />

        {/* Custom tooltip */}
        <Tooltip info={hoverInfo} />

        {/* Left panel */}
        {!loading && (
          <div className="left-panel">
            {/* Search */}
            <div className="glass-card">
              <form onSubmit={handleSearch} className="search-wrap">
                <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Buscar ZCTA (ej. 30114)…"
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
                  <label className="field-label">Escala de color</label>
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
