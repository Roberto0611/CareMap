import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, AlertCircle, Minus, Plus } from 'lucide-react';
import { cargarDatos, type Datos } from '../lib/datos';
import { asignar, type Candidato } from '../lib/asignar';

/**
 * Herramienta de asignación para un director estatal de salud pública.
 * Estilo Apple Dark Glass sin iluminados neón.
 */

const ESTADOS_SUGERIDOS = ['TX', 'CA', 'FL', 'NY', 'IL', 'MI', 'OH', 'PA', 'GA', 'NC'];

function miles(n: number) {
  return n.toLocaleString('es-MX');
}

function Fila({ z, i, acumulado }: { z: Candidato; i: number; acumulado: number }) {
  return (
    <tr>
      <td className="asg-num">{i + 1}</td>
      <td>
        <div className="asg-zcta">ZCTA {z.zcta}</div>
        <div className="asg-lugar">{z.county_name}</div>
      </td>
      <td className="asg-score">{z.score?.toFixed(0)}</td>
      <td className="asg-pob">{miles(z.poblacion ?? 0)}</td>
      <td className="asg-motivo">
        <span className="asg-factor">{z.factor1}</span>
        {z.factor1_detalle && <span className="asg-detalle"> · {z.factor1_detalle}</span>}
      </td>
      <td className="asg-acum" style={{ textAlign: 'right' }}>{miles(acumulado)}</td>
    </tr>
  );
}

export default function AsignadorPage() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [recursos, setRecursos] = useState(8);
  const [estado, setEstado] = useState<string | null>('TX');
  const [balance, setBalance] = useState(0.5);
  const [separacionKm, setSeparacionKm] = useState(0);

  useEffect(() => {
    cargarDatos().then(setDatos).catch((e) => setError(e.message));
  }, []);

  const estados = useMemo(() => {
    if (!datos) return ESTADOS_SUGERIDOS;
    const s = new Set<string>();
    Object.values(datos.detalles).forEach((d) => d.state_abbr && s.add(d.state_abbr));
    return [...s].sort();
  }, [datos]);

  const res = useMemo(() => {
    if (!datos) return null;
    return asignar(datos.detalles, {
      recursos, estado, balance, separacionKm, scoreMinimo: 60,
    });
  }, [datos, recursos, estado, balance, separacionKm]);

  if (error) {
    return (
      <div className="gem-wrap">
        <div className="gem-error-box">
          <AlertCircle size={24} />
          <p className="gem-error">Error: {error}</p>
        </div>
      </div>
    );
  }

  if (!datos || !res) {
    return (
      <div className="gem-wrap">
        <div className="gem-loading-box">
          <div className="gem-spinner" />
          <p className="gem-cargando">Cargando datos de asignación…</p>
        </div>
      </div>
    );
  }

  const ganancia = res.alcanceIngenuo > 0 ? res.alcance / res.alcanceIngenuo : 1;
  let acum = 0;

  return (
    <div className="gem-wrap">
      {/* Barra de navegación superior Apple */}
      <div className="gem-top-nav">
        <Link className="gem-pill-btn back" to="/map">
          <ArrowLeft size={14} />
          <span>Volver al mapa</span>
        </Link>

        <Link className="gem-pill-btn forward" to="/gemelos">
          <span>Ver gemelos geográficos</span>
          <ArrowRight size={14} />
        </Link>
      </div>

      <header className="gem-head">
        <div className="gem-kicker">ASIGNACIÓN ESTRATÉGICA · ESTADO DE {estado ?? 'EE.UU.'}</div>
        <h1 className="gem-title">Dónde colocar lo que hay</h1>
        <p className="gem-metodo">
          Selección de zonas para desplegar un número limitado de recursos dentro
          de un estado. Solo entran zonas con índice de vulnerabilidad de 60 o más
          y estimaciones de confiabilidad alta.
        </p>
      </header>

      {/* Panel de Controles estilo Apple Dark Glass */}
      <div className="asg-controles">
        {/* 1. Estado */}
        <div className="asg-control-group">
          <label className="field-label">Estado</label>
          <div className="asg-select-wrap">
            <select
              className="gem-apple-select asg-select"
              value={estado ?? ''}
              onChange={(e) => setEstado(e.target.value || null)}
            >
              {estados.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* 2. Recursos Disponibles: Apple Stepper + Presets */}
        <div className="asg-control-group">
          <label className="field-label">Recursos disponibles</label>
          <div className="asg-stepper-container">
            <div className="asg-stepper">
              <button
                type="button"
                className="asg-step-btn"
                onClick={() => setRecursos((v) => Math.max(3, v - 1))}
                disabled={recursos <= 3}
                title="Disminuir recursos"
              >
                <Minus size={14} strokeWidth={2.5} />
              </button>
              <div className="asg-step-value">
                <span className="asg-step-number">{recursos}</span>
                <span className="asg-step-unit">zonas</span>
              </div>
              <button
                type="button"
                className="asg-step-btn"
                onClick={() => setRecursos((v) => Math.min(30, v + 1))}
                disabled={recursos >= 30}
                title="Aumentar recursos"
              >
                <Plus size={14} strokeWidth={2.5} />
              </button>
            </div>

            <div className="asg-presets">
              {[5, 10, 15, 20].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`asg-preset-pill${recursos === n ? ' active' : ''}`}
                  onClick={() => setRecursos(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 3. Criterio de Balance: Apple Segmented Control */}
        <div className="asg-control-group">
          <label className="field-label">Criterio de balance</label>
          <div className="asg-segmented">
            <button
              type="button"
              className={`asg-seg-btn${balance === 0 ? ' active' : ''}`}
              onClick={() => setBalance(0)}
            >
              Gravedad
            </button>
            <button
              type="button"
              className={`asg-seg-btn${balance === 0.5 ? ' active' : ''}`}
              onClick={() => setBalance(0.5)}
            >
              Equilibrado
            </button>
            <button
              type="button"
              className={`asg-seg-btn${balance === 1 ? ' active' : ''}`}
              onClick={() => setBalance(1)}
            >
              Alcance
            </button>
          </div>
          <p className="modo-nota">
            {balance === 0
              ? 'Prioriza zonas con mayor gravedad sanitaria.'
              : balance === 1
              ? 'Prioriza volumen de población beneficiada.'
              : 'Balance equilibrado entre gravedad y población.'}
          </p>
        </div>

        {/* 4. Separación Geográfica Mínima: Apple Segmented Control */}
        <div className="asg-control-group">
          <label className="field-label">Separación mínima</label>
          <div className="asg-segmented">
            {[
              { label: 'Libre', val: 0 },
              { label: '15 km', val: 15 },
              { label: '30 km', val: 30 },
              { label: '50 km', val: 50 },
            ].map(({ label, val }) => (
              <button
                key={val}
                type="button"
                className={`asg-seg-btn${separacionKm === val ? ' active' : ''}`}
                onClick={() => setSeparacionKm(val)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="modo-nota">
            Evita concentrar los recursos en zonas contiguas de una misma ciudad.
          </p>
        </div>
      </div>

      {/* Cifras de impacto y comparación (sin iluminados neón) */}
      <div className="gem-titulares">
        <div className="gem-tit">
          <div className="gem-tit-cap">Población alcanzada</div>
          <div className="gem-tit-num">{miles(res.alcance)}</div>
          <div className="gem-tit-sub">personas en las zonas seleccionadas</div>
        </div>

        <div className="gem-tit">
          <div className="gem-tit-cap">Criterio ingenuo</div>
          <div className="gem-tit-num">{miles(res.alcanceIngenuo)}</div>
          <div className="gem-tit-sub">
            si se eligieran solo las de peor índice
            {ganancia > 1.05 && (
              <span className="gem-warn"> · {ganancia.toFixed(1)}× menos alcance</span>
            )}
          </div>
        </div>

        <div className="gem-tit">
          <div className="gem-tit-cap">Zonas candidatas</div>
          <div className="gem-tit-num">{res.candidatas}</div>
          <div className="gem-tit-sub">
            elegibles en {estado ?? 'el país'}
            {res.descartadasPorRuido > 0 && (
              <> · {res.descartadasPorRuido} descartadas por baja confiabilidad</>
            )}
          </div>
        </div>
      </div>

      {res.elegidas.length < recursos && (
        <div className="gem-aviso">
          <AlertCircle size={18} className="gem-aviso-icon" />
          <div>
            Solo hay {res.elegidas.length} zonas que cumplan los criterios con esta
            configuración. Reducir la separación mínima o el número de recursos
            amplía las opciones.
          </div>
        </div>
      )}

      {/* Tabla de Zonas estilo Apple Glass Card */}
      <div className="asg-table-wrap">
        <table className="asg-tabla">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Zona ZCTA</th>
              <th>Índice</th>
              <th>Población</th>
              <th>Factor dominante</th>
              <th style={{ textAlign: 'right' }}>Alcance acumulado</th>
            </tr>
          </thead>
          <tbody>
            {res.elegidas.map((z, i) => {
              acum += z.poblacion ?? 0;
              return <Fila key={z.zcta} z={z} i={i} acumulado={acum} />;
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
}
