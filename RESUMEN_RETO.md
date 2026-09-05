# DataRush — Resumen del reto (en cristiano)

## 1. El problema en una frase
En EE.UU. nadie tiene, en un solo lugar, **quién vive en cada código postal** (contexto social) junto con
**qué tan enferma está esa gente** (resultados de salud). Están en bases separadas, con formatos distintos y
sin nombres de estado/condado. Por eso, quien decide dónde poner una clínica, un programa o un presupuesto,
decide a ciegas o con promedios de condado que esconden las desigualdades dentro de una misma ciudad.

## 2. Lo que piden construir
Una **herramienta (dashboard) + un índice compuesto de vulnerabilidad sociosanitaria por ZCTA** que sea:

1. **Estadísticamente sólido** — que tome en cuenta el margen de error (MOE) y no confunda ruido con vulnerabilidad real.
2. **Geográficamente navegable** — mapa por ZCTA, agregable a condado y estado.
3. **Accionable** — que no solo diga *dónde* está mal, sino **qué factor específico** lo está causando en cada
   zona, para que la acción sugerida sea distinta según el caso.

> ZCTA = aproximación del Census a un código postal. Es el nivel más fino donde existen ambos tipos de dato.
> Equivalente mental: un AGEB del INEGI.

## 3. Los 4 datasets

| Archivo | Qué es | Filas | Llave |
|---|---|---|---|
| `SDOH_f-Measures_Data.csv` | Contexto social (ACS 2017–2021), **formato largo**: 9 indicadores × ZCTA | 291,024 (32,336 ZCTAs) | `LocationName` |
| `PLACES_f-ZCTA5_Data.csv` | Salud (CDC PLACES 2020), **formato ancho**: 27 indicadores + IC95% | 32,409 | `ZCTA5` |
| `COUNTYDAT-f_Data.csv` | Crosswalk ZCTA → condado (+ área para desempatar) | 33,791 | `GEOID_ZCTA5_20` |
| `STATESDAT-f_Data.csv` | Catálogo FIPS estado → nombre/abreviatura | 57 | `STATE` |

**9 indicadores sociales (SDOH):** pobreza, desempleo, sin preparatoria, hacinamiento, hogares monoparentales,
sin banda ancha, carga del costo de vivienda, minoría racial/étnica, 65+ años.

**27 indicadores de salud (PLACES):** resultados (diabetes, obesidad, hipertensión, asma, EPOC, cáncer, renal,
infarto cerebral, salud mental/física mala, sueño), conductas (tabaquismo, alcohol, inactividad física),
y prevención/acceso (sin seguro, chequeo, dentista, mamografía, colon, cervical, colesterol).

## 4. Hallazgos de una primera exploración (ya verificados sobre los CSV)

- **Cruce SDOH × PLACES: 31,742 ZCTAs** hacen match. 594 quedan solo en SDOH y 667 solo en PLACES → hay que
  decidir y documentar qué hacer con ellos.
- **La población está guardada como texto con comas** (`"1,106"`) → hay que limpiarla antes de usarla como peso.
- **Población por ZCTA es brutalmente desigual:** mediana 2,955 pero va de 50 a 130,352.
  **5,799 ZCTAs tienen menos de 500 habitantes** y 796 tienen menos de 100.
- **El MOE es enorme y ahí está la historia:** la mediana del cociente MOE/valor es **0.46**, y en el
  **18.8% de las observaciones el margen de error es MAYOR que el valor estimado**.
  Por indicador (mediana MOE/valor): hacinamiento 0.92, sin banda ancha 0.70, monoparentales 0.64,
  desempleo 0.62 … vs. pobreza 0.34 y 65+ 0.24.
  → **Traducción:** rankear ZCTAs por hacinamiento crudo es casi rankear ruido. Este es el gancho del pitch.
- Los datos vienen "sucios a propósito": IC95% de PLACES viene como texto `"(10.2, 17.4)"`, hay nulos
  (1,834 valores sociales vacíos, y columnas de salud con muchos faltantes como COREM/COREW/MAMMOUSE),
  y las coordenadas vienen como `POINT (-80.70 32.35)`.

## 5. Entregables y cómo se califica

| Rubro | Peso | Qué buscan |
|---|---|---|
| **Video pitch** (máx 5 min) | 35% | Storytelling con datos. Quién se beneficia y **qué decisión concreta** toma. Mínimo un hallazgo real. |
| **Dashboard en vivo** | 35% | Profesional, sin errores. **El mapa debe explicarse solo.** Nada de tablas crudas. Debe considerar el MOE. |
| **Impacto y accionabilidad** | 15% | Caso de uso concreto y creíble. Mostrar el *qué lo causa*, no solo el *dónde*. Tener claro el siguiente paso. |
| **Checklist técnico (SQL/datos)** | 15% | Evidencia de la lógica, pureza de los datos, entendimiento del pipeline. |

También: **repo público de GitHub con README** y todo el código.

## 6. Preguntas que hay que responder en ideación
1. **¿Quién es el usuario exacto?** (ej. director de salud estatal repartiendo presupuesto de prevención;
   una ONG eligiendo dónde poner unidades móviles; una aseguradora). Elegir UNO.
2. **¿Qué decisión concreta toma con el dashboard?** — de esto sale todo lo demás.
3. **¿Cómo se construye el índice?** ¿Percentiles por indicador? ¿Ponderación igual o por evidencia?
   ¿Un índice social + uno de salud y la interacción entre ambos?
4. **¿Cómo se maneja el MOE?** Esta es la diferenciación clara vs. otros equipos:
   marcar confiabilidad, dar rangos en lugar de un número, o penalizar/ocultar estimaciones no confiables.
5. **¿Cómo se muestra "qué lo causa"?** Contribución de cada indicador al score de esa ZCTA
   (una barra de descomposición al hacer click en el mapa).
