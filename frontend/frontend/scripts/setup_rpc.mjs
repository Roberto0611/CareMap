import pg from 'pg';

const { Client } = pg;
const CONNECTION_STRING =
  'postgresql://postgres:028bfe1491127f591d11e56c25c15aaa@xvr5kh8n.us-west.database.insforge.app:5432/insforge?sslmode=require';

async function main() {
  const client = new Client({ connectionString: CONNECTION_STRING });
  await client.connect();

  const sql = `
    CREATE OR REPLACE FUNCTION execute_readonly_sql(query_text text)
    RETURNS json
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
        result json;
        clean_query text;
        first_word text;
    BEGIN
        clean_query := trim(query_text);
        IF right(clean_query, 1) = ';' THEN
            clean_query := left(clean_query, length(clean_query) - 1);
        END IF;

        -- Extraer primera palabra
        first_word := upper(split_part(clean_query, ' ', 1));
        first_word := replace(replace(first_word, chr(10), ''), chr(13), '');

        IF first_word != 'SELECT' AND first_word != 'WITH' THEN
            RAISE EXCEPTION 'Solo se permiten consultas SELECT de lectura.';
        END IF;

        -- Bloquear palabras destructivas
        IF clean_query ~* '\\y(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY)\\y' THEN
            RAISE EXCEPTION 'Operación destructiva no permitida.';
        END IF;

        EXECUTE format('SELECT json_agg(t) FROM (%s) t', clean_query) INTO result;
        RETURN coalesce(result, '[]'::json);
    END;
    $$;

    GRANT EXECUTE ON FUNCTION execute_readonly_sql(text) TO PUBLIC;
  `;

  await client.query(sql);
  console.log('Función RPC execute_readonly_sql actualizada.');

  // Test 1: Consulta válida
  const test1 = await client.query(
    "SELECT execute_readonly_sql('SELECT zcta, state_abbr, county_name, score FROM zcta_analytics WHERE state_abbr = ''TX'' ORDER BY score ASC LIMIT 3;') as res;"
  );
  console.log('Test 1 (SELECT válido):', JSON.stringify(test1.rows[0].res, null, 2));

  // Test 2: Intento de DROP bloqueado
  try {
    await client.query("SELECT execute_readonly_sql('DROP TABLE zcta_analytics;') as res;");
    console.error('Error: Debería haber fallado!');
  } catch (e) {
    console.log('Test 2 (Inyección bloqueada con éxito):', e.message);
  }

  await client.end();
}

main().catch(console.error);
