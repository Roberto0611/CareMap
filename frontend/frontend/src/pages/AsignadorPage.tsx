import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { cargarDatos, type Datos } from '../lib/datos';
import { asignar, type Candidato } from '../lib/asignar';

/**
 * Herramienta de asignación para un director estatal de salud pública.
 *
 * Responde una pregunta operativa: con N recursos disponibles en el estado,
 * ¿dónde colocarlos? Y sobre todo, hace visible el intercambio entre atender
 * a las comunidades más graves y llegar a más personas, que hoy se resuelve
 * a ciegas porque nadie lo tiene medido.
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
        <div className="asg-zcta">{z.zcta}</div>
        <div className="asg-lugar">{z.county_name}</div>
      </td>
      <td className="asg-score">{z.score?.toFixed(0)}</td>
      <td className="asg-pob">{miles(z.poblacion ?? 0)}</td>
      <td className="asg-motivo">
        {z.factor1}
        {z.factor1_detalle && <span className="asg-detalle"> · {z.factor1_detalle}</span>}
      </td>
      <td className="asg-acum">{miles(acumulado)}</td>
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

  if (error) return <div className="gem-wrap"><p className="gem-error">Error: {error}</p></div>;
  if (!datos || !res) return <div className="gem-wrap"><p className="gem-cargando">Cargando…</p></div>;

  const ganancia = res.alcanceIngenuo > 0 ? res.alcance / res.alcanceIngenuo : 1;
  let acum = 0;

  return (
    <div className="gem-wrap">
      <header className="gem-head">
        <div>
          <div className="field-label">ASIGNACIÓN DE RECURSOS</div>
          <h1 className="gem-title">Dónde colocar lo que hay</h1>
        </div>
        <div className="gem-nav">
          <Link className="gem-link" to="/map">Ver el mapa →</Link>
        </div>
      </header>

      <p className="gem-metodo">
        Selección de zonas para desplegar un número limitado de recursos dentro
        de un estado. Solo entran zonas con índice de vulnerabilidad de 60 o más
        y estimaciones de confiabilidad alta: un dato con margen de error amplio
        no puede sostener una decisión de presupuesto.
      </p>

      <div className="asg-controles">
        <div>
          <label className="field-label">Estado</label>
          <select
            className="color-select asg-select"
            value={estado ?? ''}
            onChange={(e) => setEstado(e.target.value || null)}
          >
            {estados.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div>
          <label className="field-label">Recursos disponibles</label>
          <div className="slider-row">
            <input
              type="range" className="slider" min={3} max={30} step={1}
              value={recursos}
              onChange={(e) => setRecursos(Number(e.target.value))}
            />
            <span className="slider-val">{recursos}</span>
          </div>
        </div>

        <div>
          <label className="field-label">Criterio</label>
          <div className="slider-row">
            <input
              type="range" className="slider" min={0} max={1} step={0.1}
              value={balance}
              onChange={(e) => setBalance(Number(e.target.value))}
            />
          </div>
          <div className="asg-extremos">
            <span>Priorizar gravedad</span><span>Priorizar alcance</span>
          </div>
        </div>

        <div>
          <label className="field-label">Separación mínima</label>
          <div className="slider-row">
            <input
              type="range" className="slider" min={0} max={60} step={5}
              value={separacionKm}
              onChange={(e) => setSeparacionKm(Number(e.target.value))}
            />
            <span className="slider-val">{separacionKm ? `${separacionKm} km` : 'libre'}</span>
          </div>
          <p className="modo-nota">
            Evita concentrar todos los recursos en zonas contiguas de una misma ciudad.
          </p>
        </div>
      </div>

      {/* La comparación es el punto: qué se gana frente al criterio intuitivo */}
      <div className="gem-titulares">
        <div className="gem-tit destacado">
          <div className="gem-tit-num">{miles(res.alcance)}</div>
          <div className="gem-tit-cap">personas en las zonas seleccionadas</div>
        </div>
        <div className="gem-tit">
          <div className="gem-tit-num">{miles(res.alcanceIngenuo)}</div>
          <div className="gem-tit-cap">
            si se eligieran solo las de peor índice
            {ganancia > 1.05 && (
              <span className="gem-warn"> · {ganancia.toFixed(1)}× menos alcance</span>
            )}
          </div>
        </div>
        <div className="gem-tit">
          <div className="gem-tit-num">{res.candidatas}</div>
          <div className="gem-tit-cap">
            zonas candidatas en {estado ?? 'el país'}
            {res.descartadasPorRuido > 0 && (
              <> · {res.descartadasPorRuido} excluidas por baja confiabilidad</>
            )}
          </div>
        </div>
      </div>

      {res.elegidas.length < recursos && (
        <p className="gem-aviso">
          Solo hay {res.elegidas.length} zonas que cumplan los criterios con esta
          configuración. Reducir la separación mínima o el número de recursos
          amplía las opciones.
        </p>
      )}

      <table className="asg-tabla">
        <thead>
          <tr>
            <th></th>
            <th>Zona</th>
            <th>Índice</th>
            <th>Población</th>
            <th>Factor dominante</th>
            <th>Alcance acumulado</th>
          </tr>
        </thead>
        <tbody>
          {res.elegidas.map((z, i) => {
            acum += z.poblacion ?? 0;
            return <Fila key={z.zcta} z={z} i={i} acumulado={acum} />;
          })}
        </tbody>
      </table>

      <p className="gem-pie">
        Datos: ACS 2017–2021 · CDC PLACES 2020
      </p>
    </div>
  );
}
