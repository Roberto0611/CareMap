/**
 * Generador Text-to-SQL para la tabla zcta_analytics en InsForge
 */

export const DATABASE_SCHEMA = `
Tabla: zcta_analytics
Descripción: Contiene métricas de vulnerabilidad, salud y determinantes sociales para 31,742 códigos postales (ZCTAs) de EE.UU.

Columnas:
- zcta: VARCHAR(5) - Código postal ZCTA de 5 dígitos (ej. '78701', '90210')
- county_name: TEXT - Nombre del condado (ej. 'Travis County', 'Miami-Dade County')
- state_abbr: VARCHAR(2) - Abreviatura del estado en 2 letras mayúsculas (ej. 'TX', 'CA', 'FL', 'NY')
- state_name: TEXT - Nombre completo del estado (ej. 'Texas', 'California', 'Florida')
- poblacion: INTEGER - Población total estimada de la zona
- score: NUMERIC - Índice general de vulnerabilidad de 0 a 100 (menor score = menor vulnerabilidad/riesgo, mayor score = mayor vulnerabilidad/riesgo)
- score_social: NUMERIC - Sub-índice de determinantes sociales (0 a 100)
- score_salud: NUMERIC - Sub-índice de carga de enfermedad / salud (0 a 100)
- confiabilidad: TEXT - Nivel de confiabilidad estadística ('alta', 'media', 'baja')
- factor1: TEXT - Tema que más empuja el score en esta zona ('Socioeconómico', 'Vivienda y conectividad', 'Acceso a atención', 'Carga de enfermedad', 'Conductas de riesgo')
- factor1_pct: NUMERIC - Percentil nacional del factor dominante (0 a 100)
- factor1_detalle: TEXT - Indicador específico que más pesa
- t_socioeco: NUMERIC - Percentil nacional socioeconómico (0 a 100)
- t_vivienda: NUMERIC - Percentil nacional de vivienda y conectividad (0 a 100)
- t_acceso: NUMERIC - Percentil nacional de acceso a salud (0 a 100)
- t_enfermedad: NUMERIC - Percentil nacional de carga de enfermedad (0 a 100)
- t_conductas: NUMERIC - Percentil nacional de conductas de riesgo (0 a 100)
- salud_esperada: NUMERIC - Score de salud esperado estadísticamente según su contexto social
- residual: NUMERIC - Brecha (salud observada menos salud esperada). Si residual > 0 significa salud PEOR de lo esperado; si residual < 0 significa salud MEJOR de lo esperado.
- arquetipo: TEXT - Código de arquetipo de comunidad
- arquetipo_desc: TEXT - Descripción del arquetipo de comunidad
- gemelo: VARCHAR(5) - Código postal del gemelo estadístico más cercano en el país
- gemelo_brecha: NUMERIC - Distancia estadística con su gemelo
- gemelo_km: NUMERIC - Distancia geográfica en km con su gemelo
- pobreza_pov150: NUMERIC - Porcentaje de población bajo el 150% de la línea de pobreza
- sin_seguro: NUMERIC - Porcentaje de adultos sin seguro médico
- diabetes: NUMERIC - Porcentaje de prevalencia de diabetes
- obesidad: NUMERIC - Porcentaje de prevalencia de obesidad
- salud_mental: NUMERIC - Porcentaje de prevalencia de mala salud mental frecuente
- tabaquismo: NUMERIC - Porcentaje de fumadores actuales
`;

export const SYSTEM_PROMPT = `Eres un experto analista SQL especializado en PostgreSQL para analítica de salud geoespacial.
Tu trabajo es convertir preguntas en lenguaje natural a consultas SQL precisas y eficientes sobre la tabla "zcta_analytics".

${DATABASE_SCHEMA}

REGLAS CRÍTICAS:
1. Genera ÚNICAMENTE código SQL ejecutable. NO agregues explicaciones, ni bloques de markdown (\`\`\`sql), solo la sentencia SQL limpia.
2. Solo se permiten consultas de lectura (SELECT ...).
3. Asegúrate de incluir siempre la columna 'zcta' en los resultados para poder visualizar los polígonos en el mapa.
4. Para rankings de menor vulnerabilidad: usa 'ORDER BY score ASC'.
5. Para rankings de mayor vulnerabilidad: usa 'ORDER BY score DESC'.
6. Para "salud peor de lo esperado": usa 'residual > 0 ORDER BY residual DESC'.
7. Para "salud mejor de lo esperado": usa 'residual < 0 ORDER BY residual ASC'.
8. Si se menciona un estado, filtra por 'state_abbr = 'XX'' (ej. 'TX', 'CA', 'FL', 'NY') o 'LOWER(state_name) = LOWER(...)'.
9. Si no se especifica un límite, agrega 'LIMIT 10'. Si se piden "los 5...", usa 'LIMIT 5'.
10. Siempre agrega 'WHERE ... IS NOT NULL' en la métrica ordenada para no listar nulos al inicio.

EJEMPLOS:
Pregunta: "los 5 codigos postales con menor vulnerabilidad en Texas"
SQL: SELECT zcta, county_name, score, poblacion FROM zcta_analytics WHERE state_abbr = 'TX' AND score IS NOT NULL ORDER BY score ASC LIMIT 5;

Pregunta: "zonas en Florida con salud peor de lo que predice su contexto social"
SQL: SELECT zcta, county_name, residual, score_salud, salud_esperada, poblacion FROM zcta_analytics WHERE state_abbr = 'FL' AND residual IS NOT NULL AND residual > 3 ORDER BY residual DESC LIMIT 10;

Pregunta: "gemelo estadistico del codigo postal 78701"
SQL: SELECT zcta, county_name, state_abbr, score, gemelo, gemelo_brecha, gemelo_km FROM zcta_analytics WHERE zcta = '78701';

Pregunta: "codigos postales con mayor tasa de diabetes y sin seguro en California"
SQL: SELECT zcta, county_name, diabetes, sin_seguro, score, poblacion FROM zcta_analytics WHERE state_abbr = 'CA' AND diabetes IS NOT NULL ORDER BY diabetes DESC LIMIT 10;
`;

/**
 * Fallback inteligente basado en patrones para consultas comunes
 * cuando no se haya configurado una API key de LLM externa.
 */
export function matchTemplateQuery(prompt: string): string | null {
  const p = prompt.toLowerCase().trim();

  // Estados conocidos
  const stateMap: Record<string, string> = {
    texas: 'TX', california: 'CA', florida: 'FL', 'new york': 'NY', 'nueva york': 'NY',
    georgia: 'GA', illinois: 'IL', ohio: 'OH', pennsylvania: 'PA', michigan: 'MI',
    arizona: 'AZ', washington: 'WA', colorado: 'CO', nevada: 'NV', 'north carolina': 'NC',
  };

  let foundState = '';
  for (const [st, abbr] of Object.entries(stateMap)) {
    if (p.includes(st)) { foundState = abbr; break; }
  }

  // Extraer límite si existe (ej. "los 5", "los 10")
  const limitMatch = p.match(/\b([0-9]{1,2})\b/);
  const limit = limitMatch ? parseInt(limitMatch[1], 10) : 10;

  // Menor vulnerabilidad
  if ((p.includes('menor') || p.includes('baja') || p.includes('menos')) && p.includes('vulnerab')) {
    const where = foundState ? `WHERE state_abbr = '${foundState}' AND score IS NOT NULL` : 'WHERE score IS NOT NULL';
    return `SELECT zcta, county_name, state_abbr, score, poblacion FROM zcta_analytics ${where} ORDER BY score ASC LIMIT ${limit};`;
  }

  // Mayor vulnerabilidad
  if ((p.includes('mayor') || p.includes('alta') || p.includes('mas')) && p.includes('vulnerab')) {
    const where = foundState ? `WHERE state_abbr = '${foundState}' AND score IS NOT NULL` : 'WHERE score IS NOT NULL';
    return `SELECT zcta, county_name, state_abbr, score, poblacion FROM zcta_analytics ${where} ORDER BY score DESC LIMIT ${limit};`;
  }

  // Peor de lo esperado / residual alto
  if (p.includes('peor') && (p.includes('esperad') || p.includes('residual') || p.includes('salud'))) {
    const where = foundState
      ? `WHERE state_abbr = '${foundState}' AND residual IS NOT NULL AND residual > 3`
      : 'WHERE residual IS NOT NULL AND residual > 3';
    return `SELECT zcta, county_name, state_abbr, residual, score_salud, salud_esperada, poblacion FROM zcta_analytics ${where} ORDER BY residual DESC LIMIT ${limit};`;
  }

  // Gemelos de un ZCTA específico (ej. "gemelo de 78701")
  const zctaMatch = p.match(/\b([0-9]{5})\b/);
  if (p.includes('gemelo') && zctaMatch) {
    return `SELECT zcta, county_name, state_abbr, score, gemelo, gemelo_brecha, gemelo_km FROM zcta_analytics WHERE zcta = '${zctaMatch[1]}';`;
  }

  // Diabetes / salud
  if (p.includes('diabetes')) {
    const where = foundState ? `WHERE state_abbr = '${foundState}' AND diabetes IS NOT NULL` : 'WHERE diabetes IS NOT NULL';
    return `SELECT zcta, county_name, state_abbr, diabetes, sin_seguro, score, poblacion FROM zcta_analytics ${where} ORDER BY diabetes DESC LIMIT ${limit};`;
  }

  // Pobreza
  if (p.includes('pobreza')) {
    const where = foundState ? `WHERE state_abbr = '${foundState}' AND pobreza_pov150 IS NOT NULL` : 'WHERE pobreza_pov150 IS NOT NULL';
    return `SELECT zcta, county_name, state_abbr, pobreza_pov150, score, poblacion FROM zcta_analytics ${where} ORDER BY pobreza_pov150 DESC LIMIT ${limit};`;
  }

  // Población
  if (p.includes('pobla') || p.includes('habitantes')) {
    const where = foundState ? `WHERE state_abbr = '${foundState}' AND poblacion IS NOT NULL` : 'WHERE poblacion IS NOT NULL';
    return `SELECT zcta, county_name, state_abbr, poblacion, score FROM zcta_analytics ${where} ORDER BY poblacion DESC LIMIT ${limit};`;
  }

  // Sin seguro médico
  if (p.includes('sin seguro') || p.includes('cobertura')) {
    const where = foundState ? `WHERE state_abbr = '${foundState}' AND sin_seguro IS NOT NULL` : 'WHERE sin_seguro IS NOT NULL';
    return `SELECT zcta, county_name, state_abbr, sin_seguro, score, poblacion FROM zcta_analytics ${where} ORDER BY sin_seguro DESC LIMIT ${limit};`;
  }

  return null;
}

const OPENROUTER_API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_OPENROUTER_API_KEY) ||
  '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';

/**
 * Traduce lenguaje natural a SQL mediante OpenRouter LLM (Llama 3.3 70B / GPT-4o-mini)
 * con fallback inteligente local.
 */
export async function generateSQL(
  userPrompt: string
): Promise<{ sql: string; source: 'llm' | 'template' }> {
  // 1. Intentar con OpenRouter API
  if (OPENROUTER_API_KEY) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://datarush.app',
          'X-Title': 'DataRush ZCTA Analytics',
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-3.3-70b-instruct',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const rawContent = data.choices?.[0]?.message?.content || '';
        if (rawContent) {
          // Limpieza de SQL (eliminar bloques ```sql si el modelo los incluyó)
          let clean = rawContent.trim();
          clean = clean.replace(/```sql\n?/gi, '').replace(/```\n?/g, '').trim();
          return { sql: clean, source: 'llm' };
        }
      } else {
        console.warn('OpenRouter status:', res.status, await res.text());
      }
    } catch (e) {
      console.warn('Fallo llamada a OpenRouter, recurriendo al motor de plantillas:', e);
    }
  }

  // 2. Fallback inteligente basado en plantillas
  const templateSql = matchTemplateQuery(userPrompt);
  if (templateSql) {
    return { sql: templateSql, source: 'template' };
  }

  // 3. Consulta por defecto si no coincide
  return {
    sql: `SELECT zcta, county_name, state_abbr, score, poblacion FROM zcta_analytics WHERE score IS NOT NULL ORDER BY score ASC LIMIT 10;`,
    source: 'template',
  };
}
