import React, { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { generateSQL } from '../lib/sqlGenerator';
import { executeSQL, type QueryResult } from '../lib/insforgeClient';
import {
  isAssignIntent,
  runAssignIntent,
  formatAssignRows,
  type AsignarIntentResult,
} from '../lib/asignarIntent';
import bloudIcon from '../bloud.svg';
import thinkingGif from '../thinking.gif';
import finishedGif from '../finished.gif';
import laterGif from '../later.gif';

interface AIChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen?: () => void;
  onHighlightZctas: (zctas: string[]) => void;
  highlightedCount?: number;
  onClearHighlight?: () => void;
  onSearchZcta?: (zcta: string) => void;
}

const SAMPLE_QUERIES = [
  'Menor vulnerabilidad en Texas',
  'Salud peor de lo esperado en Florida',
  'Asigna 8 recursos en TX separados 30 km',
  'Gemelos estadísticos de 78701',
  'Mayor prevalencia de diabetes en Texas',
  'Asigna 5 brigadas en California priorizando alcance',
];

// ─── Componente tabla de asignación ─────────────────────────────────────────
function TablaAsignacion({ res, onVerMapa }: {
  res: AsignarIntentResult;
  onVerMapa: () => void;
}) {
  const { asignacion, params } = res;
  const rows = formatAssignRows(asignacion.elegidas);
  const ganancia = asignacion.alcanceIngenuo > 0
    ? asignacion.alcance / asignacion.alcanceIngenuo
    : 1;

  const balanceLabel =
    params.balance === 0 ? 'Gravedad' :
    params.balance === 1 ? 'Alcance' :
    'Equilibrado';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Encabezado de resumen */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Asignación optimizada
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button type="button" className="ai-action-btn-pill" onClick={onVerMapa}>
            Ver en el Mapa
          </button>
        </div>
      </div>

      {/* Métricas clave */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '6px',
      }}>
        {[
          {
            label: 'Personas alcanzadas',
            value: asignacion.alcance.toLocaleString('es-MX'),
            sub: `${params.recursos} zonas · ${params.estado ?? 'Nacional'}`,
          },
          {
            label: 'Criterio ingenuo',
            value: asignacion.alcanceIngenuo.toLocaleString('es-MX'),
            sub: ganancia > 1.05 ? `${ganancia.toFixed(1)}× menos alcance` : 'Similar',
          },
          {
            label: 'Balance',
            value: balanceLabel,
            sub: params.separacionKm > 0 ? `Sep. ${params.separacionKm} km` : 'Sin separación',
          },
        ].map((m) => (
          <div key={m.label} style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px',
            padding: '8px 10px',
          }}>
            <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
              {m.label}
            </div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
              {m.value}
            </div>
            <div style={{ fontSize: '0.67rem', color: 'rgba(255,255,255,0.35)', marginTop: '2px' }}>
              {m.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Tabla de zonas elegidas */}
      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px', color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>
          No se encontraron zonas con los criterios indicados.
        </div>
      ) : (
        <div className="ai-table-wrap">
          <table className="ai-table">
            <thead>
              <tr>
                {Object.keys(rows[0]).map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx}>
                  {Object.entries(row).map(([col, val]) => (
                    <td
                      key={col}
                      className={
                        col === 'zcta' ? 'cell-zcta' :
                        col === 'índice' ? 'cell-score' :
                        ''
                      }
                    >
                      {val}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────
export const AIChatModal: React.FC<AIChatModalProps> = ({
  isOpen,
  onClose,
  onOpen,
  onHighlightZctas,
  highlightedCount = 0,
  onClearHighlight,
  onSearchZcta,
}) => {
  const [prompt, setPrompt] = useState('');
  const [zctaQuery, setZctaQuery] = useState('');
  const [isZctaExpanded, setIsZctaExpanded] = useState(false);
  const zctaInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [agentStatus, setAgentStatus] = useState<'idle' | 'thinking' | 'finished' | 'later'>('idle');
  const [generatedSql, setGeneratedSql] = useState<string | null>(null);

  useEffect(() => {
    if (isZctaExpanded) {
      zctaInputRef.current?.focus();
    }
  }, [isZctaExpanded]);

  const [querySource, setQuerySource] = useState<'llm' | 'template' | 'assign' | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [assignResult, setAssignResult] = useState<AsignarIntentResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSql, setShowSql] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // finished.gif dura 2.4s (una sola vez); luego pasa automáticamente a later.gif
  useEffect(() => {
    if (agentStatus === 'finished') {
      const timer = setTimeout(() => {
        setAgentStatus('later');
      }, 2400);
      return () => clearTimeout(timer);
    }
  }, [agentStatus]);

  const getAgentIcon = () => {
    if (agentStatus === 'finished') return finishedGif;
    if (agentStatus === 'later') return laterGif;
    return bloudIcon;
  };

  // Si está cerrado, mostrar la píldora flotante estilo Apple en el centro inferior
  if (!isOpen) {
    return (
      <button
        type="button"
        className="ai-floating-trigger"
        onClick={onOpen || onClose}
        title="Abrir Asistente Cloudy"
      >
        <img
          src={bloudIcon}
          alt="Cloudy"
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            objectFit: 'contain',
            flexShrink: 0,
          }}
        />
        <span>Consulta con Cloudy</span>
        {highlightedCount > 0 && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              borderRadius: '999px',
              backgroundColor: 'rgba(0, 0, 0, 0.08)',
              color: '#000000',
              fontWeight: 600,
              fontSize: '0.65rem',
            }}
          >
            {highlightedCount} en mapa
          </span>
        )}
      </button>
    );
  }

  const handleRunQuery = async (queryText: string) => {
    if (!queryText.trim()) return;
    setLoading(true);
    setAgentStatus('thinking');
    setError(null);
    setResult(null);
    setAssignResult(null);
    setGeneratedSql(null);
    setIsMinimized(false);

    try {
      // ── 1. Detectar intención de ASIGNACIÓN ──────────────────────────────
      if (isAssignIntent(queryText)) {
        setQuerySource('assign');
        const intentResult = await runAssignIntent(queryText);

        if (intentResult.detected) {
          setAssignResult(intentResult);
          // Resaltar en el mapa automáticamente
          if (intentResult.zctas.length > 0) {
            onHighlightZctas(intentResult.zctas);
          }
          setAgentStatus('finished');
          return;
        }
      }

      // ── 2. Flujo normal: Text-to-SQL ─────────────────────────────────────
      const { sql, source } = await generateSQL(queryText);
      setGeneratedSql(sql);
      setQuerySource(source);

      const queryRes = await executeSQL(sql);
      setResult(queryRes);

      const zctaList = queryRes.rows
        .map((r) => r.zcta || r.gemelo)
        .filter(Boolean) as string[];

      if (zctaList.length > 0) {
        onHighlightZctas(zctaList);
      }

      setAgentStatus('finished');
    } catch (err: any) {
      console.error('Error en agente Cloudy:', err);
      setError(err.message || 'Error ejecutando la consulta.');
      setAgentStatus('idle');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleRunQuery(prompt);
  };

  const hasContent = Boolean(error || generatedSql || result || assignResult);



  return (
    <div className="ai-floating-chat" onClick={(e) => e.stopPropagation()}>
      {/* Resultados expandibles o estado pensando */}
      {!isMinimized && (hasContent || loading) && (
        <div className="ai-chat-content">
          {/* Loading skeleton */}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 0' }}>
              <img src={thinkingGif} alt="Pensando" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'contain' }} />
              <div>
                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>
                  {isAssignIntent(prompt) ? 'Calculando asignación óptima…' : 'Consultando base de datos…'}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', marginTop: '2px' }}>
                  {isAssignIntent(prompt) ? 'El LLM está analizando tu solicitud…' : 'Generando SQL con IA…'}
                </div>
              </div>
            </div>
          )}

          {/* Mensaje de Error */}
          {error && (
            <div
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: 'rgba(255, 255, 255, 0.9)',
                padding: '10px 14px',
                borderRadius: '12px',
                fontSize: '0.8rem',
              }}
            >
              <strong style={{ color: '#ffffff' }}>Nota:</strong> {error}
            </div>
          )}

          {/* ── Resultado de ASIGNACIÓN ── */}
          {assignResult && !loading && (
            <TablaAsignacion
              res={assignResult}
              onVerMapa={() => {
                if (assignResult.zctas.length > 0) {
                  onHighlightZctas(assignResult.zctas);
                }
              }}
            />
          )}

          {/* ── Resultado SQL normal ── */}
          {result && !loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ fontSize: '0.74rem', color: 'rgba(255, 255, 255, 0.6)' }}>
                  ZONAS DEVUELTAS:{' '}
                  <strong
                    style={{
                      color: '#ffffff',
                      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", var(--font-sans)',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                    }}
                  >
                    {result.rowCount}
                  </strong>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {result.rowCount > 0 && (
                    <button
                      type="button"
                      className="ai-action-btn-pill"
                      onClick={() => {
                        const zctas = result.rows
                          .map((r) => r.zcta || r.gemelo)
                          .filter(Boolean);
                        onHighlightZctas(zctas);
                      }}
                    >
                     Ver en el Mapa
                    </button>
                  )}
                  <button
                    type="button"
                    className="ai-hide-btn"
                    onClick={() => setIsMinimized(true)}
                    title="Ocultar resultados"
                  >
                    Ocultar resultados ▼
                  </button>
                </div>
              </div>

              {result.rows.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '24px',
                    color: 'rgba(255, 255, 255, 0.4)',
                    fontSize: '0.8rem',
                  }}
                >
                  No se encontraron zonas coincidentes.
                </div>
              ) : (
                <div className="ai-table-wrap">
                  <table className="ai-table">
                    <thead>
                      <tr>
                        {Object.keys(result.rows[0]).map((col) => (
                          <th key={col}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, idx) => (
                        <tr key={idx}>
                          {Object.entries(row).map(([col, val]) => (
                            <td
                              key={col}
                              className={
                                col === 'zcta' || col === 'gemelo'
                                  ? 'cell-zcta'
                                  : col === 'score'
                                  ? 'cell-score'
                                  : ''
                              }
                            >
                              {val === null || val === undefined ? '—' : String(val)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Barra Inferior estilo Spotlight Apple */}
      <div className="ai-chat-footer">
        {/* Barra de control para mostrar y ocultar resultados */}
        {hasContent && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              paddingBottom: '2px',
            }}
          >
            <button
              type="button"
              className="ai-toggle-results-btn"
              onClick={() => setIsMinimized((v) => !v)}
              title={isMinimized ? 'Mostrar resultados' : 'Ocultar resultados'}
            >
              <span>{isMinimized ? '▲ Mostrar resultados' : '▼ Ocultar resultados'}</span>
            </button>
          </div>
        )}


        {/* Sugerencias Rápidas */}
        <div className="ai-chips-strip">
          {SAMPLE_QUERIES.map((q) => (
            <button
              key={q}
              type="button"
              className="ai-chip-btn"
              onClick={() => {
                setPrompt(q);
                handleRunQuery(q);
              }}
            >
              {q}
            </button>
          ))}
        </div>

        {/* Input con buscador ZCTA al lado izquierdo y botón de envío */}
        <form onSubmit={handleSubmit} className="ai-input-row">
          {/* Botón Search de Lucide que se expande al hacer click */}
          {!isZctaExpanded ? (
            <button
              type="button"
              className="ai-zcta-trigger-btn"
              onClick={() => setIsZctaExpanded(true)}
              title="Buscar ZCTA específico"
            >
              <Search size={18} strokeWidth={2.2} />
            </button>
          ) : (
            <div className="ai-zcta-search-wrap">
              <Search size={15} strokeWidth={2.2} className="ai-zcta-search-icon" />
              <input
                ref={zctaInputRef}
                type="text"
                className="ai-zcta-search-input"
                placeholder="Buscar ZCTA…"
                value={zctaQuery}
                onChange={(e) => setZctaQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (onSearchZcta && zctaQuery.trim()) {
                      onSearchZcta(zctaQuery);
                    }
                  } else if (e.key === 'Escape') {
                    setIsZctaExpanded(false);
                  }
                }}
              />
              <button
                type="button"
                className="ai-zcta-close-btn"
                onClick={() => {
                  setIsZctaExpanded(false);
                  setZctaQuery('');
                }}
                title="Cerrar búsqueda"
              >
                <X size={13} strokeWidth={2.2} />
              </button>
            </div>
          )}

          <input
            type="text"
            className="ai-chat-input"
            placeholder="Ej: asigna 5 recursos en Texas separados 10 km con prioridad balanceada…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <button type="submit" className="ai-submit-btn" disabled={loading}>
            {loading ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <img
                  src={thinkingGif}
                  alt="Pensando"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    objectFit: 'contain',
                  }}
                />
                <span>Pensando…</span>
              </span>
            ) : (
              <>
                <span>Consultar</span>
                <img
                  src={getAgentIcon()}
                  alt="Agente"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    objectFit: 'contain',
                    flexShrink: 0,
                  }}
                />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AIChatModal;
