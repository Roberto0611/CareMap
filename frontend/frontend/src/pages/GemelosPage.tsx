import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  cargarDatos, TEMAS, brechaEdad, esDefendible, colorVulnerabilidad,
  type Datos, type GemeloDestacado, type ZCTADetail,
} from '../lib/datos';

/**
 * Comparador de códigos postales contiguos.
 *
 * Comparar zonas lejanas admite demasiadas explicaciones alternativas (clima,
 * economía, política sanitaria). Comparar vecinos las elimina casi todas: dos
 * ZCTAs a pocos kilómetros comparten ciudad, condado, mercado laboral e
 * infraestructura médica, así que el contraste que quede es atribuible al
 * contexto social.
 *
 * Las cinco barras van en el mismo orden en ambas columnas para que la
 * diferencia se lea como una silueta y no como una tabla.
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

  // Una comparación es informativa cuando hay mucho contraste en salud Y poca
  // diferencia de edad entre las dos zonas: si difieren en edad, el contraste
  // podría explicarse por demografía en vez de por contexto social. Se penaliza
  // cada punto de diferencia de edad para que los pares mejor controlados
  // aparezcan primero, no los de contraste más llamativo.
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
                {p.ciudad} · {p.km} km {esDefendible(p) ? '' : '· edad dispar'}
              </option>
            ))}
          </select>
          <Link className="gem-link" to="/map">Ver en el mapa →</Link>
          <Link className="gem-link" to="/asignador">Asignar recursos →</Link>
        </div>
      </header>

      <p className="gem-metodo">
        Pares de códigos postales contiguos (menos de 15 km) con la mayor
        diferencia en el índice de vulnerabilidad. Al ser vecinos comparten
        clima, mercado laboral, gobierno local e infraestructura sanitaria, lo
        que aísla el peso del contexto social. Los pares marcados como
        <em> edad dispar</em> difieren en estructura demográfica y se
        interpretan con cautela.
      </p>

      {/* Tres cifras resumen la comparación antes de entrar al detalle */}
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
        // Advertencia metodológica: varias condiciones crónicas aumentan con
        // la edad, así que un par con estructuras demográficas distintas no
        // aísla el efecto del contexto social.
        <p className="gem-aviso">
          Estas dos zonas tienen estructuras de edad distintas
          ({g.mayores65_a.toFixed(0)}% y {g.mayores65_b.toFixed(0)}% de población
          mayor de 65). Como la prevalencia de varias condiciones crónicas
          aumenta con la edad, parte de la diferencia observada puede deberse a
          la composición demográfica y no al contexto social. La comparación es
          menos directa que en los pares marcados como comparables.
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
