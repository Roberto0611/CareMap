import { matchTemplateQuery } from '../frontend/frontend/src/lib/sqlGenerator.ts';

// Test offline template generator
const queries = [
  '¿Cuáles son los 5 códigos postales de menor vulnerabilidad en Texas?',
  'Top 10 zonas con peor salud de lo esperado en Florida',
  'Comunidades con mayor pobreza en California',
  'Zonas con más diabetes en Texas',
  'Códigos postales más poblados en New York'
];

console.log('=== Probando Generador de Consultas Text-to-SQL ===\n');

for (const q of queries) {
  const sql = matchTemplateQuery(q);
  console.log(`Pregunta: "${q}"`);
  console.log(`SQL generado:\n${sql}\n---`);
}

// Test against InsForge endpoint directly
const INSFORGE_URL = 'https://xvr5kh8n.us-west.insforge.app';
const API_KEY = 'ik_25949c05497b038282266edc8f5ce47d';

async function testQuery(sql) {
  console.log('\n=== Ejecutando en PostgreSQL de InsForge ===\n');
  console.log('Query:', sql);
  const resp = await fetch(`${INSFORGE_URL}/api/database/advance/rawsql/unrestricted`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': API_KEY,
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ query: sql })
  });

  const data = await resp.json();
  if (data.error) {
    console.error('Error:', data.error);
  } else {
    console.log(`Resultados obtenidos: ${data.rowCount} filas.`);
    console.table(data.rows.slice(0, 5));
  }
}

const sampleSql = matchTemplateQuery('¿Cuáles son los 5 códigos postales de menor vulnerabilidad en Texas?');
await testQuery(sampleSql);
