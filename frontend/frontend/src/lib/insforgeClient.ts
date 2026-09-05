/**
 * Cliente de consulta segura a PostgreSQL en InsForge
 */

const INSFORGE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_INSFORGE_URL) ||
  'https://xvr5kh8n.us-west.insforge.app';

const INSFORGE_API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_INSFORGE_API_KEY) ||
  'ik_25949c05497b038282266edc8f5ce47d';

export interface QueryResult {
  rows: Record<string, any>[];
  rowCount: number;
  error?: string;
}

/**
 * Valida que la consulta sea estrictamente de lectura (SELECT / WITH)
 */
export function validateReadOnlySQL(sql: string): { valid: boolean; error?: string } {
  const clean = sql.trim();
  const withoutComments = clean.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();

  // Debe comenzar con SELECT o WITH
  if (!/^\s*(SELECT|WITH)\b/i.test(withoutComments)) {
    return { valid: false, error: 'Solo se permiten consultas de lectura (SELECT).' };
  }

  // Bloquear palabras reservadas destructivas
  const destructiveRegex = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|EXECUTE)\b/i;
  if (destructiveRegex.test(withoutComments)) {
    return { valid: false, error: 'Operación no permitida: contiene palabras destructivas o de modificación.' };
  }

  return { valid: true };
}

/**
 * Ejecuta una consulta SQL en InsForge PostgreSQL
 */
export async function executeSQL(sql: string): Promise<QueryResult> {
  const validation = validateReadOnlySQL(sql);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Asegurar que tenga un LIMIT de seguridad si no tiene uno
  let finalSql = sql.trim();
  if (finalSql.endsWith(';')) {
    finalSql = finalSql.slice(0, -1).trim();
  }
  if (!/\bLIMIT\s+\d+/i.test(finalSql)) {
    finalSql += ' LIMIT 50';
  }

  const endpoint = `${INSFORGE_URL}/api/database/advance/rawsql/unrestricted`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${INSFORGE_API_KEY}`,
    },
    body: JSON.stringify({ query: finalSql }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Error en InsForge Database (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(data.message || data.error);
  }

  return {
    rows: data.rows || [],
    rowCount: data.rowCount || (data.rows ? data.rows.length : 0),
  };
}
