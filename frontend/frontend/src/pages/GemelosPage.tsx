import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  cargarDatos, TEMAS, brechaEdad, esDefendible,
  type Datos, type GemeloDestacado, type ZCTADetail,
} from '../lib/datos';

/**
 * Comparador de gemelos geográficos.
 *
 * El argumento: decir "Mississippi está peor que Massachusetts" no impresiona
 * — son estados distintos, la excusa está ahí. Decir "estos dos códigos
 * postales están a 2.8 km y uno tiene 2.7 veces más diabetes" no tiene excusa.
 *
 * Las cinco barras van en el mismo orden en ambas columnas justamente para
 * que la diferencia se lea como una silueta, no como una tabla.
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
      <div className="gem-zcta">ZCTA {zcta}</div>
      <div className="gem-score">{detalle?.score?.toFixed(0) ?? '—'}</div>
      <div className="gem-score-cap">VULNERABILIDAD / 100</div>
      {detalle?.arquetipo && <div className="gem-arq">{detalle.arquetipo}</div>}

      <div className="gem-cifras">
        {([
          ['Pobreza', pobreza],
          ['Diabetes', diabetes],
          ['Sin seguro médico', sinSeguro],
          ['Mayores de 65', mayores65],
        ] as const).map(([k, v]) => (
          <div className="gem-cifra" key={k}>
            <span>{k}</span>
            <strong>{fmt(v)}</strong>
          </div>
        ))}
      </div>

      <div className="gem-barras">
        <div className="field-label">PERFIL</div>
        {TEMAS.map(([nombre, key]) => {
          const v = (detalle?.[key] as number | null) ?? 0;
          return (
            <div className="bar-row" key={nombre}>
              <div className="bar-label">{nombre}</div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${v}%` }} />
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

  // Un buen par para el pitch necesita DOS cosas: mucho contraste en salud y
  // poca diferencia de edad (si no, "es que una zona es más vieja" tumba el
  // argumento). Se penaliza cada punto de diferencia de edad para que el par
  // más defendible quede primero, no el más espectacular.
  const pares = useMemo(() => {
    if (!datos) return [];
    const calidad = (g: GemeloDestacado) =>
      (g.score_a - g.score_b) - brechaEdad(g) * 2;
    return [...datos.gemelos].sort((a, b) => calidad(b) - calidad(a));
  }, [datos]);

  if (error) return <div className="gem-wrap"><p className="gem-error">Error: {error}</p></div>;
  if (!datos || pares.length === 0) {
    return <div className="gem-wrap"><p className="gem-cargando">Cargando…</p></div>;
  }

  const g: GemeloDestacado = pares[Math.min(i, pares.length - 1)];
  const veces = g.diabetes_b > 0 ? g.diabetes_a / g.diabetes_b : 0;
  const edad = brechaEdad(g);

  return (
    <div className="gem-wrap">
      <header className="gem-head">
        <div>
          <div className="field-label">GEMELOS GEOGRÁFICOS</div>
          <h1 className="gem-title">Dos vecinos, dos realidades</h1>
        </div>
        <div className="gem-nav">
          <select
            className="color-select"
            value={i}
            onChange={(e) => setI(Number(e.target.value))}
          >
            {pares.map((p, k) => (
              <option key={`${p.a}-${p.b}`} value={k}>
                {p.ciudad} · {p.km} km {esDefendible(p) ? '' : '⚠'}
              </option>
            ))}
          </select>
          <Link className="gem-link" to="/map">Ver en el mapa →</Link>
        </div>
      </header>

      {/* El titular: tres números y ya se entiende el problema */}
      <div className="gem-titulares">
        <div className="gem-tit">
          <div className="gem-tit-num">{g.km}<small> km</small></div>
          <div className="gem-tit-cap">de distancia entre ellos</div>
        </div>
        <div className="gem-tit destacado">
          <div className="gem-tit-num">{veces.toFixed(1)}<small>×</small></div>
          <div className="gem-tit-cap">más diabetes</div>
        </div>
        <div className="gem-tit">
          <div className="gem-tit-num">
            {g.mayores65_a.toFixed(0)}<small>%</small> vs {g.mayores65_b.toFixed(0)}<small>%</small>
          </div>
          <div className="gem-tit-cap">
            población mayor de 65
            {edad <= 5
              ? <span className="gem-ok"> · misma estructura de edad</span>
              : <span className="gem-warn"> · ⚠ difieren {edad.toFixed(0)} puntos</span>}
          </div>
        </div>
      </div>

      {edad > 5 && (
        // Si las edades no coinciden, el par no aguanta preguntas. Mejor
        // decirlo aquí que enterarse frente a los jueces.
        <p className="gem-aviso">
          Ojo: estas dos zonas tienen estructuras de edad distintas, así que
          parte de la diferencia en salud puede ser por edad y no por contexto
          social. Para el pitch conviene un par sin ⚠.
        </p>
      )}

      <div className="gem-grid">
        <Columna
          zcta={g.a} detalle={datos.detalles[g.a]} lado="peor"
          pobreza={g.pobreza_a} diabetes={g.diabetes_a}
          sinSeguro={g.sin_seguro_a} mayores65={g.mayores65_a}
        />
        <div className="gem-vs">
          <div className="gem-vs-linea" />
          <div className="gem-vs-km">{g.km} km</div>
          <div className="gem-vs-linea" />
        </div>
        <Columna
          zcta={g.b} detalle={datos.detalles[g.b]} lado="mejor"
          pobreza={g.pobreza_b} diabetes={g.diabetes_b}
          sinSeguro={g.sin_seguro_b} mayores65={g.mayores65_b}
        />
      </div>

      <p className="gem-pie">
        {g.ciudad} · Datos: ACS 2017–2021 · CDC PLACES 2020
      </p>
    </div>
  );
}
