import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, AlertCircle, Compass } from 'lucide-react';
import {
  cargarDatos, TEMAS, brechaEdad, esDefendible, colorVulnerabilidad,
  type Datos, type GemeloDestacado, type ZCTADetail,
} from '../lib/datos';

/**
 * Comparador de códigos postales contiguos (Gemelos Geográficos).
 * Estilo Apple Dark Glass.
 */

function fmt(n: number | null | undefined, suf = '%') {
  return n === null || n === undefined ? '—' : `${n.toFixed(1)}${suf}`;
}

function Columna({
  zcta, detalle, pobreza, diabetes, sinSeguro, mayores65, lado,
}: {
  zcta: string;
  detalle: ZCTADetail | undefined;
  pobreza: number; diabetes: number; sinSeguro: number; mayores65: number;
  lado: 'peor' | 'mejor';
}) {
  return (
    <div className={`gem-col gem-${lado}`}>
      <div className="gem-col-header">
        <div className="gem-zcta">ZCTA {zcta}</div>
        <div className="gem-score-box">
          <div className="gem-score">{detalle?.score?.toFixed(0) ?? '—'}</div>
          <div className="gem-score-cap">SCORE / 100</div>
        </div>
      </div>

      {detalle?.arquetipo && (
        <div className="gem-arq">{detalle.arquetipo}</div>
      )}

      <div className="gem-cifras">
        {([
          ['Pobreza', pobreza],
          ['Diabetes', diabetes],
          ['Sin seguro médico', sinSeguro],
          ['Mayores de 65', mayores65],
        ] as const).map(([k, v]) => (
          <div className="gem-cifra" key={k}>
            <span className="gem-cifra-key">{k}</span>
            <strong className="gem-cifra-val">{fmt(v)}</strong>
          </div>
        ))}
      </div>

      <div className="gem-barras">
        <div className="gem-barras-title">PERFIL POR DIMENSIÓN</div>
        {TEMAS.map(([nombre, key]) => {
          const v = (detalle?.[key] as number | null) ?? 0;
          return (
            <div className="bar-row" key={nombre}>
              <div className="bar-label">{nombre}</div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: `${v}%`, background: colorVulnerabilidad(v) }}
                />
              </div>
              <div className="bar-pct">{v.toFixed(0)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function GemelosPage() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [i, setI] = useState(0);

  useEffect(() => {
    cargarDatos().then(setDatos).catch((e) => setError(e.message));
  }, []);

  const pares = useMemo(() => {
    if (!datos) return [];
    const calidad = (g: GemeloDestacado) =>
      (g.score_a - g.score_b) - brechaEdad(g) * 2;
    return [...datos.gemelos].sort((a, b) => calidad(b) - calidad(a));
  }, [datos]);

  if (error) {
    return (
      <div className="gem-wrap">
        <div className="gem-error-box">
          <AlertCircle size={24} />
          <p className="gem-error">Error al cargar datos: {error}</p>
        </div>
      </div>
    );
  }

  if (!datos || pares.length === 0) {
    return (
      <div className="gem-wrap">
        <div className="gem-loading-box">
          <div className="gem-spinner" />
          <p className="gem-cargando">Cargando gemelos geográficos…</p>
        </div>
      </div>
    );
  }

  const g: GemeloDestacado = pares[Math.min(i, pares.length - 1)];
  const veces = g.diabetes_b > 0 ? g.diabetes_a / g.diabetes_b : 0;
  const edad = brechaEdad(g);

  return (
    <div className="gem-wrap">
      {/* Barra de navegación superior Apple */}
      <div className="gem-top-nav">
        <Link className="gem-pill-btn back" to="/map">
          <ArrowLeft size={14} />
          <span>Volver al mapa</span>
        </Link>

        <div className="gem-nav-center">
          <div className="gem-select-wrapper">
            <select
              className="gem-apple-select"
              value={i}
              onChange={(e) => setI(Number(e.target.value))}
            >
              {pares.map((p, k) => (
                <option key={`${p.a}-${p.b}`} value={k}>
                  {p.ciudad} · {p.km} km {esDefendible(p) ? '' : '· edad dispar'}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Link className="gem-pill-btn forward" to="/asignador">
          <span>Asignar recursos</span>
          <ArrowRight size={14} />
        </Link>
      </div>

      {/* Hero Header */}
      <header className="gem-head">
        <div className="gem-kicker">GEMELOS GEOGRÁFICOS · {g.ciudad}</div>
        <h1 className="gem-title">Dos vecinos, dos realidades</h1>
        <p className="gem-metodo">
          Pares de códigos postales contiguos (menos de 15 km) con la mayor
          diferencia en vulnerabilidad. Al compartir clima, mercado laboral e
          infraestructura sanitaria, el contraste aísla el peso del contexto social.
        </p>
      </header>

      {/* Tres cifras resumen estilo KPIs Apple */}
      <div className="gem-titulares">
        <div className="gem-tit">
          <div className="gem-tit-cap">Distancia geográfica</div>
          <div className="gem-tit-num">{g.km}<small> km</small></div>
          <div className="gem-tit-sub">Separados por escasos minutos</div>
        </div>

        <div className="gem-tit">
          <div className="gem-tit-cap">Brecha de prevalencia</div>
          <div className="gem-tit-num">{veces.toFixed(1)}<small>×</small></div>
          <div className="gem-tit-sub">más diabetes en la zona vulnerable</div>
        </div>

        <div className="gem-tit">
          <div className="gem-tit-cap">Población &gt;65 años</div>
          <div className="gem-tit-num">
            {g.mayores65_a.toFixed(0)}<small>%</small> <span className="gem-vs-text">vs</span> {g.mayores65_b.toFixed(0)}<small>%</small>
          </div>
          <div className="gem-tit-sub">
            {edad <= 5
              ? <span className="gem-ok">Estructura de edad comparable</span>
              : <span className="gem-warn">Difieren {edad.toFixed(0)} puntos</span>}
          </div>
        </div>
      </div>

      {edad > 5 && (
        <div className="gem-aviso">
          <AlertCircle size={18} className="gem-aviso-icon" />
          <div>
            <strong>Nota metodológica sobre la edad:</strong> Estas dos zonas presentan
            estructuras demográficas distintas ({g.mayores65_a.toFixed(0)}% vs {g.mayores65_b.toFixed(0)}% mayores de 65).
            Dado que ciertas condiciones crónicas incrementan con la edad, parte del contraste puede atribuirse
            a la edad poblacional y no únicamente al contexto social.
          </div>
        </div>
      )}

      {/* Comparador de Columnas con separador central de distancia */}
      <div className="gem-grid">
        <Columna
          zcta={g.a} detalle={datos.detalles[g.a]} lado="peor"
          pobreza={g.pobreza_a} diabetes={g.diabetes_a}
          sinSeguro={g.sin_seguro_a} mayores65={g.mayores65_a}
        />
        <div className="gem-vs">
          <div className="gem-vs-linea" />
          <div className="gem-vs-km">
            <Compass size={13} />
            <span>{g.km} km</span>
          </div>
          <div className="gem-vs-linea" />
        </div>
        <Columna
          zcta={g.b} detalle={datos.detalles[g.b]} lado="mejor"
          pobreza={g.pobreza_b} diabetes={g.diabetes_b}
          sinSeguro={g.sin_seguro_b} mayores65={g.mayores65_b}
        />
      </div>
    </div>
  );
}
