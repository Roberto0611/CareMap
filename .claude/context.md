# Contexto del proyecto — DataRush: Índice de Vulnerabilidad Sociosanitaria por ZCTA

> Documento de contexto para cualquier agente o persona que se sume al proyecto.
> Todos los números marcados como verificados fueron calculados sobre los CSVs reales de `data/`.

---

## 1. El reto

Construir una herramienta que **una datos sociales con datos de salud** a nivel de código
postal (ZCTA) en EE.UU., y que permita a un tomador de decisiones identificar dónde dirigir
recursos limitados.

**El problema real:** el contexto social de una comunidad (pobreza, vivienda, transporte,
educación) y sus resultados de salud viven en bases separadas, con formatos distintos y sin
nombres geográficos. Nadie los cruza sistemáticamente. Quien reparte presupuesto decide con
promedios de condado que esconden desigualdades dentro de una misma ciudad.

**ZCTA** = ZIP Code Tabulation Area, la aproximación del Census Bureau a un código postal.
Análogo a un AGEB del INEGI. Es el nivel más fino donde existen ambos tipos de dato.

### Entregables

1. **Video pitch**, máximo 5 minutos
2. **Dashboard interactivo**, compartido por link público (los jueces lo usan ellos mismos)
3. **Repositorio público de GitHub** con README y todo el código

### Rúbrica

| Rubro | Peso | Qué buscan |
|---|---|---|
| Pitch | 35% | Storytelling con datos. Quién se beneficia y **qué decisión concreta** toma. Mínimo un hallazgo real. |
| Dashboard (demo en vivo) | 35% | Profesional, sin errores. **El mapa debe comunicar el problema de un vistazo.** Nada de tablas crudas. **Debe considerar la incertidumbre MOE.** |
| Impacto y accionabilidad | 15% | Caso de uso concreto. Mostrar **qué lo causa**, no solo dónde. Tener claro el siguiente paso. |
| Checklist técnico (SQL/datos) | 15% | Evidencia de la lógica, pureza de datos, entendimiento del pipeline. |

> **70% de la calificación es comunicación**, no código.

> ⚠️ La rúbrica del PDF dice literalmente "demo en vivo". El equipo entiende que es video
> grabado + link compartido. **Pendiente de confirmar con los organizadores** si hay ronda presencial.

---

## 2. Los datos (`data/`)

| Archivo | Qué es | Filas | Llave |
|---|---|---|---|
| `SDOH_f-Measures_Data.csv` | Contexto social (ACS 2017–2021). **Formato largo**: 9 indicadores × ZCTA | 291,024 (32,336 ZCTAs) | `LocationName` |
| `PLACES_f-ZCTA5_Data.csv` | Salud (CDC PLACES 2020). **Formato ancho**: 27 indicadores + IC95% | 32,409 | `ZCTA5` |
| `COUNTYDAT-f_Data.csv` | Crosswalk ZCTA → condado (+ área para desempatar) | 33,791 | `GEOID_ZCTA5_20` |
| `STATESDAT-f_Data.csv` | Catálogo FIPS estado → nombre/abreviatura | 57 | `STATE` |

**9 indicadores sociales:** pobreza, desempleo, sin preparatoria, hacinamiento, hogares
monoparentales, sin banda ancha, carga del costo de vivienda, minoría racial/étnica, 65+ años.

**27 indicadores de salud:** enfermedades (diabetes, obesidad, hipertensión, asma, EPOC, cáncer,
renal, ACV, salud mental/física), conductas (tabaquismo, alcohol, inactividad, sueño) y
prevención/acceso (sin seguro, chequeo, dentista, mamografía, colon, cervical, colesterol).

### Suciedades conocidas (hay que limpiarlas)

- Población viene como texto con comas: `"1,106"`
- IC95% de PLACES viene como texto: `"(10.2, 17.4)"`
- Coordenadas como WKT: `POINT (-80.700252 32.3553711)`
- **No traen nombre de estado ni condado** — solo códigos numéricos
- 1,834 valores sociales nulos; columnas de salud con faltantes (COREM, COREW, MAMMOUSE)
- Un ZCTA puede tocar varios condados → asignar el de mayor `AREALAND_PART`

---

## 3. Hallazgos verificados (calculados sobre los CSVs reales)

Estos son los activos del pitch. Todos reproducibles.

### 3.1 El cruce

- **31,742 ZCTAs** hacen match entre SDOH y PLACES (594 solo en SDOH, 667 solo en PLACES)
- Cobertura de indicadores de salud: 99–100% en el cruce

### 3.2 El estado es el nivel equivocado

- Pobreza media por estado: de 12.8% a 35.0%
- **Solo el 12.1% de la variación total de pobreza se explica por el estado. El 87.9% ocurre DENTRO de cada estado.**
- California va de ~3% a >50% de pobreza entre sus ZCTAs (percentiles 1 y 99 en zonas de 5,000+ hab)
- → El estado sirve como **filtro**, nunca como unidad de análisis

### 3.3 El ruido estadístico (MOE) — el diferenciador

- Mediana del cociente `MOE / valor` = **0.46**
- **En el 18.8% de las observaciones, el margen de error es MAYOR que el valor estimado**
- Por indicador (mediana MOE/valor): hacinamiento **0.92**, sin banda ancha 0.70,
  monoparentales 0.64, desempleo 0.62 · vs. pobreza 0.34, 65+ 0.24
- Población por ZCTA: mediana 2,955, rango 50–130,352.
  **5,799 ZCTAs con menos de 500 habitantes; 796 con menos de 100**
- **801 ZCTAs reportan 0% o 100% de pobreza — su población mediana es 155.** Es ruido, no realidad.
- → Rankear por hacinamiento crudo es casi rankear ruido

### 3.4 El modelo: lo social explica el 76% de la salud

- Modelo (GradientBoosting, validación cruzada 5-fold) prediciendo un índice de mala salud
  a partir de los 9 indicadores sociales, en ZCTAs con 1,000+ hab (n=22,680)
- **R² = 0.761**
- Verificado que **NO está confundido por edad**: % de 65+ es 18.5 en las zonas
  "mejor de lo esperado" vs 18.1 en las "peor de lo esperado" (nacional 18.3)
- El 24% no explicado es el oro: zonas peor de lo esperado = algo puntual arreglable;
  zonas mejor de lo esperado = *positive deviance*, hay algo que aprender

### 3.5 Los gemelos geográficos

De 44,194 pares de ZCTAs vecinos (menos de 15 km, ambos con 5,000+ hab), los de mayor contraste:

**Chicago — 60624 vs 60622 (4.2 km) — USAR ESTE**

| | 60624 | 60622 |
|---|---|---|
| Población | 36,986 | 54,650 |
| Pobreza | 51.6% | 14.4% |
| Sin preparatoria | 23.4% | 5.3% |
| **Diabetes** | **19.2%** | **5.3%** |
| Sin seguro | 27.1% | 13.8% |
| Inactividad física | 39.9% | 15.9% |
| Tabaquismo | 28.8% | 12.4% |
| 65+ años | 11.1% | 6.5% |

Otros pares válidos: Memphis (38126 vs 38103, 3.4 km), Dallas (75210 vs 75201),
Houston (77051 vs 77054).

> 🚫 **NO USAR El Paso (79901 vs 79906).** Es el par más extremo (diabetes 28.2% vs 3.5%)
> pero **79906 es una base militar**: 0.1% de población 65+. Población joven de soldados.
> Un juez lo tumba en preguntas. Chicago aguanta porque la zona enferma es incluso *más* vieja.

### 3.6 Los 6 arquetipos

K-means (k=6) sobre indicadores sociales y de salud estandarizados:

| # | Perfil | Zonas | Pobreza | Sin seguro | Diabetes | 65+ | Lo que lo define |
|---|---|---|---|---|---|---|---|
| 1 | Acomodada | 4,585 | 9% | 9% | 8% | 18% | Baja vulnerabilidad en todo |
| 2 | Envejecida estable | 6,487 | 16% | 11% | 11% | 22% | Mayores, pero sí van al doctor |
| 3 | Presión de vivienda | 3,471 | 23% | 16% | 10% | 14% | Carga de renta + hacinamiento, salud aguanta |
| 4 | Rural con riesgo conductual | 5,427 | 27% | 16% | 14% | 19% | Tabaquismo y salud mental altos |
| 5 | Pobreza concentrada | 1,667 | 44% | 20% | **17%** | 16% | Ya enfermos. Carga crónica. |
| 6 | Barrera de acceso | 1,043 | 37% | **31%** | 14% | 11% | Hacinamiento y baja escolaridad altísimos |

> **El argumento de accionabilidad:** los grupos 5 y 6 tienen scores igual de malos pero
> necesitan intervenciones **opuestas**. El 5 ya está enfermo → manejo de crónicos.
> El 6 no puede entrar al sistema → inscripción a seguro y atención en su idioma.
> Si no actúas en el 6, en 10 años se vuelve el 5.

---

## 4. La propuesta: los 4 golpes del pitch

Orden narrativo del video (4 minutos):

| # | Golpe | Qué dice | Tiempo |
|---|---|---|---|
| 1 | **Gemelos** | "4 km de distancia, 4 veces más diabetes" | 0:00–0:40 |
| 2 | **El interruptor** | "La lista obvia estaba llena de ruido" (toggle MOE en vivo) | 0:40–1:40 |
| 3 | **El modelo** | "Lo social explica el 76%. Donde falla, ahí rinde tu dinero" | 1:40–3:10 |
| 4 | **El asignador** | "No te doy un mapa, te doy las 12 direcciones" | 3:10–4:10 |

Cada golpe monta sobre el anterior.

---

## 5. Arquitectura y stack

```
datarush-3/
├── etl_zcta_unify.py          ①  4 CSVs -> zcta_master_analytical.parquet
├── pipeline/
│   ├── 02_score.py            ②③④ score, confiabilidad, desglose
│   ├── 03_enrich_geojson.py   pega score+confiabilidad a la geometría
│   └── 04_topojson.py         geojson -> topojson (tarda ~3 min)
├── data/                      fuentes + derivados (los derivados en .gitignore)
├── frontend/frontend/         React 19 + Vite + TS + deck.gl
│   ├── public/mapa/zcta_data.topojson    <- lo que sirve el mapa
│   ├── public/datos/zcta_scored.json     <- detalle del panel
│   └── src/pages/MapPage.tsx
└── api/                       FastAPI. ~30 líneas. (pendiente)
```

**Orden para regenerar todo desde cero:**
```
python etl_zcta_unify.py
python pipeline/02_score.py
python pipeline/03_enrich_geojson.py
python pipeline/04_topojson.py       # ~3 min
cp data/zcta_scored.json frontend/frontend/public/datos/
```

### Peso de lo que descarga el juez (medido, comprimido)

| Archivo | En disco | Comprimido |
|---|---|---|
| `zcta_data.topojson` | 9.6 MB | **2.63 MB** |
| `zcta_scored.json` | 3.2 MB | **1.09 MB** |
| `zcta_state_map.json` | 0.4 MB | 0.08 MB |
| | | **≈ 3.8 MB total** |

> Antes eran 4.72 MB solo del geojson. TopoJSON guarda cada frontera compartida
> una vez en vez de dos (33,790 zonas → 101,177 arcos) y cuantiza las coordenadas.
> **Simplificar más la geometría NO ayuda** — se probó con varios epsilon y el
> archivo se movía 0.01 MB; la fuente ya viene simplificada (mediana 22 vértices
> por polígono). Todo el ahorro está en la topología.

> ⚠️ El geojson fuente (`data/zcta_simple.geojson`, 25 MB) y el intermedio
> (`data/zcta_data.geojson`, 19 MB) **no van en `public/`** — si están ahí, Vite
> los sirve y el juez se los descarga sin necesidad.

| Pieza | Con qué | Por qué |
|---|---|---|
| Pipeline | **Python** (pandas, scikit-learn) | Ya está empezado |
| Mapa | **MapLibre / deck.gl** | Gratis, sin llave, mueve 31k puntos |
| Layout | **CSS Grid** | |
| Backend | **FastAPI** | Mismo lenguaje que el pipeline (evita un 3er lenguaje) |
| Hosting front | **Vercel / GitHub Pages** | Estático, no se cae |
| Hosting api | **Render / Vercel** | |

### Decisiones descartadas y por qué

- ❌ **Laravel** — le queda grande. No hay usuarios, ni auth, ni datos que cambien.
- ❌ **AWS** — overkill para 30 líneas. IAM y security groups se comen la tarde.
- ❌ **Backend para los datos** — el payload es **1 MB comprimido** (medido). Cabe en el
  navegador. Un backend solo agrega algo que se puede caer.
- ❌ **Text-to-SQL / chatbot que calcule** — puede alucinar cifras frente a los jueces.

### El copiloto ("Codi") — cómo debe funcionar

**Regla de oro: el LLM nunca calcula. Solo interpreta la intención y narra lo que el
dashboard ya calculó.**

```
Pregunta → LLM traduce a JSON de instrucciones (structured outputs)
         → el dashboard ejecuta y calcula con datos.json
         → LLM redacta con los números YA calculados
```

Tres capas de insight:

1. **Capa 1 — El desglose.** Aritmética pura, de `datos.json`. Instantánea, gratis, exacta.
2. **Capa 2 — El arquetipo.** 6 narrativas escritas UNA vez (con ayuda de LLM, offline),
   rellenadas con los números de cada zona. **6 textos cubren las 31,742 zonas.**
3. **Capa 3 — LLM en vivo.** SOLO para preguntas de seguimiento libres.

> **El insight aparece solo al hacer click, sin spinner.** Pre-generar las 31,742 con LLM
> costaría ~$250 USD; llamar al LLM en cada click mete un spinner de 3s en cada interacción.
> Las capas 1 y 2 lo resuelven.

**Implementación (Python):** `client.messages.parse(model="claude-opus-5", output_format=ModeloPydantic)`
→ `response.parsed_output`. Structured outputs garantiza que la respuesta encaje en el molde;
es imposible que rompa el frontend.

**Los botones de ejemplo NO llaman al LLM** — son instrucciones fijas escritas a mano.
Si el backend se cae, el dashboard sigue funcionando completo.

### Guardas del endpoint público

- Tope de gasto duro en la consola de Anthropic
- Límite por IP (~20 preguntas/hora)
- `max_tokens: 500`
- Prompt caching del system prompt (es idéntico en cada request)
- Costo estimado con `claude-opus-5`: ~1.5 centavos de dólar por pregunta

---

## 6. FASE 1 — El pipeline (7 estaciones)

Cada estación agrega columnas. Corre una vez, se congela en `datos.json`.

### ① Juntar
Voltear SDOH de largo a ancho, unir con PLACES, pegar condado (por mayor `AREALAND_PART`)
y estado. Limpiar población, IC95%, coordenadas. **Resultado: 31,742 filas.**

### ② Score (percentiles)
No se pueden promediar indicadores con escalas distintas. Se convierte cada uno a
**percentil** ("¿cuántas zonas del país están peor que esta?") y se promedia.

Salen tres: `score_social`, `score_salud`, `score` (total).

> ⚠️ **Voltear los indicadores donde "más = mejor"** (dentista, chequeo, mamografía,
> tamizajes, BPMED) antes de promediar. Error fácil de cometer, difícil de notar.

### ③ Confiabilidad
Etiqueta por zona (alta / media / baja) comparando MOE contra el valor y la población.
**Es la columna que enciende el interruptor y lo que la rúbrica pide por escrito.**

### ④ Desglose
Los 35 indicadores se agrupan en **6 temas**; el panel muestra los **5 accionables**
(«Perfil demográfico» cuenta en el score pero no como causa: la edad y la composición
étnica son contexto, no algo que un programa cambie).

**Cada tema se vuelve a rankear nacionalmente**, y esa es la barra: el percentil de
la zona en ese tema, no un reparto porcentual.

> ⚠️ **No promediar el exceso sobre la mediana dentro del tema** — así estaba antes y
> castigaba a los temas amplios. «Carga de enfermedad» tiene 12 indicadores, así que
> dos valores normales le hundían el promedio aunque la zona estuviera en el percentil
> 99 de cinco enfermedades a la vez. Es como comparar el promedio de un alumno con 3
> materias contra uno con 12. Con Chicago 60624 daba «Conductas de riesgo» como causa
> principal en una zona con 51.6% de pobreza; al rankear por tema, sale
> **Socioeconómico percentil 99.6**, que es lo correcto.

Columnas de orden **fijo** (`t_socioeco`, `t_vivienda`, `t_acceso`, `t_enfermedad`,
`t_conductas`) para que al comparar dos zonas las barras no se muevan de lugar y se
lea la diferencia de forma — importa para la pantalla de gemelos.

Es lo que hace que dos zonas con el mismo score tengan acciones distintas.

### ⑤ Residual
Modelo social → salud con **validación cruzada** (obligatorio: sin CV el modelo ya vio
la zona y los residuales salen mal). Guardar `esperado` y `residual`.

### ⑥ Arquetipo
K-means k=6. Una columna de texto. Las 6 narrativas van en un archivo aparte.

### ⑦ Gemelos
Para cada zona, el vecino geográfico (menos de 15 km) con mayor contraste en salud.
Columnas `gemelo` y `brecha`.

### Salida

`web/datos.json` — 31,742 filas × ~50 columnas ≈ **1 MB comprimido** (medido).

### Decisiones tomadas

| Decisión | Elección |
|---|---|
| ~600 zonas incompletas | Descartar y documentar en el README |
| Pesos de los indicadores | **Todos iguales.** Defendible y explicable; pesos inventados invitan a "¿por qué 0.3?" |
| Umbral de confiabilidad | Simple y justificable en una frase |
| Score combinado o separado | **Guardar los tres.** Cuesta nada y el separado da mejores historias |

---

## 7. Sistema de diseño

Inspiración: **browserbase.com** — imagen dithered de puntos, fondo con textura, acento
naranja único, micro-etiquetas monoespaciadas, grid de tarjetas.

> **Por qué encaja:** el mapa de 31,742 puntos **ya es una imagen dithered.** La estética
> y el dato son el mismo lenguaje visual. La forma de EE.UU. debe emerger de la densidad
> de puntos, **sin contorno dibujado**. (Verificado: se ve bien, ver `mapa_real.png`.)

### Colores

| Uso | Valor |
|---|---|
| **Mapa (vulnerabilidad)** | Rampa de riesgo, pizarra fría → rojo coral: `#33505f` `#5d6668` `#856455` `#a75f45` `#c65538` `#e3502f` `#ff6b3d` |
| **Acento / botones / Codi** | Naranja `#eb6834` |
| Confiabilidad alta | `#0ca30c` |
| Confiabilidad media | `#fab219` |
| Confiabilidad baja | `#d03b3b` |

La rampa del mapa **fue elegida midiendo, no a ojo.** Se probaron 7 candidatas
simulando deuteranopia, protanopia y tritanopia. La adoptada cumple las tres:

| Prueba | Resultado |
|---|---|
| Luminancia estrictamente creciente | ✅ se lee ordenada en escala de grises / impresa |
| Contraste mínimo contra el fondo oscuro | ✅ 2.15:1 — el extremo bajo no se confunde con el fondo ni con "sin datos" |
| Separación mínima entre pasos bajo daltonismo | ✅ 21.5 (mínimo aceptable 18) |

> 🚫 **NUNCA verde→rojo en el mapa.** ~8% de los hombres no distingue ese par;
> es probable que un juez no pueda leer el mapa. El extremo "seguro" de la rampa
> adoptada es **azul pizarra**, que sí se distingue del rojo bajo daltonismo.

> 🚫 **Tampoco un azul claro→oscuro**: se probó primero y no comunica riesgo.
> El script de verificación está en el historial; si se cambia la rampa,
> hay que volver a correr las tres pruebas antes de adoptarla.

> **Confiabilidad siempre con ícono + texto**, nunca solo color.

> **Arquetipos: NUNCA 6 colores en el mapa.** Verificado con validador de paletas: en un
> mapa de puntos, más de 3 colores categóricos deja de ser distinguible para daltónicos.
> **Uno a la vez**: el arquetipo filtrado se prende en naranja, el resto se apaga a gris.

### Otros

- Fondo con textura de grano sutil (no blanco plano). Modo oscuro es válido.
- **Monoespaciada** para etiquetas y números; sans neutra para párrafos
- El score como **número enorme** (72px), no un gauge
- Bordes de 1px, **sin sombras**
- Transiciones de 200ms
- `tabular-nums` en los números para que no bailen
- **En modo oscuro, el punto más claro nunca debe fundirse con el fondo** — hay que poder
  distinguir "poca vulnerabilidad" de "sin datos"
- Debe verse bien en celular (grid a una columna) — los jueces lo abrirán en su teléfono
- **La página abre en la historia de Chicago**, no en un mapa vacío. El juez tiene 5 segundos.

### La mascota (Codi)

Es la **cara del copiloto**, no decoración. Sirve de manual de instrucciones para jueces
que usan el dashboard sin nadie que les explique.

Expresiones: Attentive (default) · Curious (esperando) · Confused (no entendió) ·
Surprised (hallazgo) · Proud (terminó) · Neutral (sin resultados). ~6 PNG/SVG.

> ⚠️ **REGLA DE TONO:** Codi reacciona a **lo que el usuario hace**, NUNCA a lo que los
> datos dicen de una comunidad. Nada de Happy/Laughing/Excited junto a una zona con 19%
> de diabetes; nada de Angry/Sad señalando una comunidad. Es gente enferma real.

---

## 8. 🚫 Prohibiciones duras

1. **Nunca poner marca de agencias reales.** Un mockup previo decía "PUBLIC HEALTH
   SURVEILLANCE SYSTEM" y "© 2025 U.S. DEPARTMENT OF HEALTH AND HUMAN SERVICES".
   Eso es hacerse pasar por una agencia federal en un link público. **Usar nombre propio
   del producto y del equipo** — además así el crédito es del equipo.

2. **Nunca decir "LIVE DATA", "Last 7 days" ni mostrar tendencias temporales.**
   Los datos son ACS 2017–2021 y PLACES 2020. **No hay dimensión temporal.**
   Un juez de datos lo cacha en 5 segundos. Poner con orgullo:
   `Datos: ACS 2017–2021 · CDC PLACES 2020`.

3. **Nunca inventar indicadores** que no estén en los datasets.

4. **El LLM nunca produce cifras.** Solo interpreta intención y redacta con números ya calculados.

5. **No usar el par de El Paso** en los gemelos (base militar, ver 3.5).

---

## 9. Estado actual

### Ya hecho
- `analitica_zcta.parquet` — las 4 fuentes unidas, 31,742 × 40 columnas
- `residuales.parquet` — con el modelo (R²=0.761) y residuales calculados
- `web_payload.parquet` — payload de prueba, 1 MB
- `mapa_real.png` — render de prueba del mapa de puntos con datos reales
- `RESUMEN_RETO.md` — resumen del reto
- Verificados: los 6 hallazgos de la sección 3

### Pendiente
- Fase 1 formalizada en `pipeline/` (7 estaciones como scripts separados y comentados —
  el repo debe contar la historia solo, es el 15% técnico)
- Fase 2: mapa + panel lateral
- Fase 3: gemelos, residuales, asignador
- Fase 4: copiloto + Codi
- Video

### Orden de trabajo
```
FASE 1  Motor              ██████░░░░  (medio hecho)
FASE 2  Mapa + panel       ░░░░░░░░░░  ← el más largo
FASE 3  Las 3 historias    ░░░░░░░░░░
FASE 4  Copiloto + Codi    ░░░░░░░░░░
        Diseño y pulido    ░░░░░░░░░░
        Video              ░░░░░░░░░░
```

**Al terminar la Fase 2 ya hay algo entregable.** Todo lo demás suma pero no es indispensable.

### Riesgos
1. Que el mapa se coma todo el tiempo → por eso la Fase 1 se congela en un archivo
2. Que el video se deje al final → vale 35%, empezar el guion en paralelo
3. Que la mascota se vuelva el proyecto → son 6 imágenes, hasta después de la Fase 2

### Reparto sugerido
| Quién | Qué |
|---|---|
| A | Fase 1 completa (Python) |
| B | Fases 2 y 3 (el mapa, lo más pesado) |
| C | Fase 4 + diseño + Codi + guion del video |

C puede arrancar con datos falsos mientras A termina.

---

## 10. Preguntas abiertas

- ¿Hay ronda presencial de demo en vivo? (la rúbrica lo sugiere; confirmar con organizadores)
- ¿Quién es el usuario exacto y qué decisión concreta toma? — **la más importante, sin resolver.**
  De aquí sale la narrativa del pitch. Candidatos: director de salud estatal repartiendo
  presupuesto; ONG eligiendo dónde poner unidades móviles; aseguradora.
- Nombre del producto y del equipo
