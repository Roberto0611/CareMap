import fs from 'fs';
import path from 'path';
import pg from 'pg';

const { Client } = pg;

const CONNECTION_STRING =
  process.env.DATABASE_URL ||
  'postgresql://postgres:028bfe1491127f591d11e56c25c15aaa@xvr5kh8n.us-west.database.insforge.app:5432/insforge?sslmode=require';

const JSON_PATH = path.resolve(
  process.cwd(),
  'public/datos/zcta_scored.json'
);

async function run() {
  console.log('--- Iniciando migración a InsForge PostgreSQL ---');
  console.log(`Leyendo datos de: ${JSON_PATH}`);
  const raw = fs.readFileSync(JSON_PATH, 'utf-8');
  const payload = JSON.parse(raw);

  const { columns, lookups, rows } = payload;
  const zctas = Object.keys(rows);
  console.log(`Total de ZCTAs a migrar: ${zctas.length}`);

  const client = new Client({ connectionString: CONNECTION_STRING });
  await client.connect();
  console.log('Conectado a PostgreSQL exitosamente.');

  try {
    // 1. Crear tabla zcta_analytics
    console.log('Creando tabla zcta_analytics e índices...');
    await client.query(`
      DROP TABLE IF EXISTS zcta_analytics CASCADE;

      CREATE TABLE zcta_analytics (
        zcta VARCHAR(5) PRIMARY KEY,
        county_name TEXT,
        state_abbr VARCHAR(2),
        state_name TEXT,
        poblacion INTEGER,
        score NUMERIC(6,2),
        score_social NUMERIC(6,2),
        score_salud NUMERIC(6,2),
        confiabilidad TEXT,
        factor1 TEXT,
        factor1_pct NUMERIC(6,2),
        factor1_detalle TEXT,
        t_socioeco NUMERIC(6,2),
        t_vivienda NUMERIC(6,2),
        t_acceso NUMERIC(6,2),
        t_enfermedad NUMERIC(6,2),
        t_conductas NUMERIC(6,2),
        salud_esperada NUMERIC(6,2),
        residual NUMERIC(6,2),
        arquetipo TEXT,
        arquetipo_desc TEXT,
        gemelo VARCHAR(5),
        gemelo_brecha NUMERIC(6,2),
        gemelo_km NUMERIC(8,2),
        pobreza_pov150 NUMERIC(6,2),
        sin_seguro NUMERIC(6,2),
        diabetes NUMERIC(6,2),
        obesidad NUMERIC(6,2),
        salud_mental NUMERIC(6,2),
        tabaquismo NUMERIC(6,2)
      );

      CREATE INDEX idx_zcta_state ON zcta_analytics (state_abbr);
      CREATE INDEX idx_zcta_score ON zcta_analytics (score);
      CREATE INDEX idx_zcta_residual ON zcta_analytics (residual);
      CREATE INDEX idx_zcta_poblacion ON zcta_analytics (poblacion);
      CREATE INDEX idx_zcta_arquetipo ON zcta_analytics (arquetipo);
    `);

    // 2. Crear función RPC segura execute_readonly_sql
    console.log('Creando función execute_readonly_sql...');
    await client.query(`
      CREATE OR REPLACE FUNCTION execute_readonly_sql(query_text text)
      RETURNS json
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      DECLARE
          result json;
          clean_query text;
      BEGIN
          clean_query := trim(query_text);
          IF right(clean_query, 1) = ';' THEN
              clean_query := left(clean_query, length(clean_query) - 1);
          END IF;

          -- Solo permitir consultas de lectura SELECT
          IF NOT (clean_query ~* '^\\s*SELECT\\b') THEN
              RAISE EXCEPTION 'Solo se permiten consultas de lectura (SELECT).';
          END IF;

          -- Bloquear operaciones destructivas
          IF clean_query ~* '\\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|EXECUTE|COPY)\\b' THEN
              RAISE EXCEPTION 'Operación no permitida por seguridad.';
          END IF;

          EXECUTE format('SELECT json_agg(t) FROM (%s) t', clean_query) INTO result;
          RETURN coalesce(result, '[]'::json);
      END;
      $$;

      GRANT EXECUTE ON FUNCTION execute_readonly_sql(text) TO PUBLIC;
    `);

    // 3. Insertar registros en lotes
    console.log('Insertando registros en lotes...');
    const BATCH_SIZE = 500;
    let inserted = 0;

    for (let i = 0; i < zctas.length; i += BATCH_SIZE) {
      const batchZctas = zctas.slice(i, i + BATCH_SIZE);
      const values = [];
      const placeholders = [];

      batchZctas.forEach((zcta, rowIdx) => {
        const vals = rows[zcta];
        const rec = { zcta };
        columns.forEach((col, cIdx) => {
          const tabla = lookups[col];
          const v = vals[cIdx];
          rec[col] = tabla ? (typeof v === 'number' && v >= 0 ? tabla[v] : null) : v;
        });

        const offset = rowIdx * 30;
        placeholders.push(`(
          $${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5},
          $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10},
          $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15},
          $${offset + 16}, $${offset + 17}, $${offset + 18}, $${offset + 19}, $${offset + 20},
          $${offset + 21}, $${offset + 22}, $${offset + 23}, $${offset + 24}, $${offset + 25},
          $${offset + 26}, $${offset + 27}, $${offset + 28}, $${offset + 29}, $${offset + 30}
        )`);

        values.push(
          rec.zcta,
          rec.county_name ?? null,
          rec.state_abbr ?? null,
          rec.state_name ?? null,
          rec.poblacion != null ? Math.round(rec.poblacion) : null,
          rec.score ?? null,
          rec.score_social ?? null,
          rec.score_salud ?? null,
          rec.confiabilidad ?? null,
          rec.factor1 ?? null,
          rec.factor1_pct ?? null,
          rec.factor1_detalle ?? null,
          rec.t_socioeco ?? null,
          rec.t_vivienda ?? null,
          rec.t_acceso ?? null,
          rec.t_enfermedad ?? null,
          rec.t_conductas ?? null,
          rec.salud_esperada ?? null,
          rec.residual ?? null,
          rec.arquetipo ?? null,
          rec.arquetipo_desc ?? null,
          rec.gemelo ?? null,
          rec.gemelo_brecha ?? null,
          rec.gemelo_km ?? null,
          rec.POV150_value ?? null,
          rec.ACCESS2_CrudePrev ?? null,
          rec.DIABETES_CrudePrev ?? null,
          rec.OBESITY_CrudePrev ?? null,
          rec.MHLTH_CrudePrev ?? null,
          rec.CSMOKING_CrudePrev ?? null
        );
      });

      const sql = `
        INSERT INTO zcta_analytics (
          zcta, county_name, state_abbr, state_name, poblacion,
          score, score_social, score_salud, confiabilidad,
          factor1, factor1_pct, factor1_detalle,
          t_socioeco, t_vivienda, t_acceso, t_enfermedad, t_conductas,
          salud_esperada, residual, arquetipo, arquetipo_desc,
          gemelo, gemelo_brecha, gemelo_km,
          pobreza_pov150, sin_seguro, diabetes, obesidad, salud_mental, tabaquismo
        ) VALUES ${placeholders.join(', ')}
        ON CONFLICT (zcta) DO NOTHING;
      `;

      await client.query(sql, values);
      inserted += batchZctas.length;
      if (inserted % 5000 === 0 || inserted === zctas.length) {
        console.log(`Progreso: ${inserted} / ${zctas.length} registros cargados...`);
      }
    }

    // 4. Verificación
    const countRes = await client.query('SELECT count(*) as total FROM zcta_analytics;');
    console.log(`✅ ¡Migración completada! Registros en PostgreSQL: ${countRes.rows[0].total}`);

    // 5. Test RPC
    const testRpc = await client.query(
      "SELECT execute_readonly_sql('SELECT zcta, county_name, score FROM zcta_analytics WHERE state_abbr = ''TX'' ORDER BY score ASC LIMIT 3;') as res;"
    );
    console.log('✅ Test RPC exitoso:', JSON.stringify(testRpc.rows[0].res, null, 2));

  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error('Error durante la migración:', err);
  process.exit(1);
});
