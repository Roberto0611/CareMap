import React, { useState, useEffect } from 'react';
import { generateSQL } from '../lib/sqlGenerator';
import { executeSQL, type QueryResult } from '../lib/insforgeClient';
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
}

const SAMPLE_QUERIES = [
  'Menor vulnerabilidad en Texas',
  'Salud peor de lo esperado en Florida',
  'Zonas con mayor pobreza en California',
  'Gemelos estadísticos de 78701',
  'Mayor prevalencia de diabetes en Texas',
  'Códigos postales más poblados en New York',
];

export const AIChatModal: React.FC<AIChatModalProps> = ({
  isOpen,
  onClose,
  onOpen,
  onHighlightZctas,
  highlightedCount = 0,
  onClearHighlight,
}) => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [agentStatus, setAgentStatus] = useState<'idle' | 'thinking' | 'finished' | 'later'>('idle');
  const [generatedSql, setGeneratedSql] = useState<string | null>(null);
  const [querySource, setQuerySource] = useState<'llm' | 'template' | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
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
    setIsMinimized(false);

    try {
      // 1. Generar SQL usando OpenRouter con la API Key configurada
      const { sql, source } = await generateSQL(queryText);
      setGeneratedSql(sql);
      setQuerySource(source);

      // 2. Ejecutar SQL en PostgreSQL de InsForge
      const queryRes = await executeSQL(sql);
      setResult(queryRes);

      // 3. Si hay ZCTAs en las columnas resultantes, prepararlos y resaltar en el mapa
      const zctaList = queryRes.rows
        .map((r) => r.zcta || r.gemelo)
        .filter(Boolean) as string[];

      if (zctaList.length > 0) {
        onHighlightZctas(zctaList);
      }

      setAgentStatus('finished');
    } catch (err: any) {
      console.error('Error en Text-to-SQL:', err);
      setError(err.message || 'Error ejecutando la consulta en InsForge.');
      setAgentStatus('idle');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleRunQuery(prompt);
  };

  const hasContent = Boolean(error || generatedSql || result);

  return (
    <div className="ai-floating-chat" onClick={(e) => e.stopPropagation()}>
      {/* Resultados expandibles o estado pensando */}
      {!isMinimized && (hasContent || loading) && (
        <div className="ai-chat-content">
          {/* Indicador cuando está pensando */}
          {loading && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: 'rgba(255, 255, 255, 0.9)',
              }}
            >
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

          {/* Resultados de la Base de Datos */}
          {result && (
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

        {/* Input con icono y botón de envío estilo Apple */}
        <form onSubmit={handleSubmit} className="ai-input-row">
          <input
            type="text"
            className="ai-chat-input"
            placeholder="Pregunta a Cloudy sobre códigos postales (ej. menor vulnerabilidad en Texas)..."
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
