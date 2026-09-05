---
format: 1920x1080
duration: 4m30s
message: Un índice que cruza contexto social y salud por código postal revela dónde el presupuesto de salud pública rinde más — y por qué
arc: Gancho → Problema → Presentación → Evidencia (×3) → Cierre
audience: Jueces de un hackathon de datos (DataRush)
mode: collaborative
---

## Frame 01 — El gancho

- status: outline
- src: compositions/frames/01-gancho.html
- duration: 20s
- transition_in: cut
- scene: Dos códigos postales de Detroit, lado a lado, con la distancia entre ellos marcada. Un número se dispara.
- voiceover: "Estos dos códigos postales están a 2.8 kilómetros. Misma ciudad, mismo condado, la misma proporción de adultos mayores. En uno, 21 de cada 100 personas tienen diabetes. En el otro, 8."
- blueprint: comparison-split (tarjetas de datos en vez de features de producto) + dataviz-countup para el "2.7×"
- extra_datos: ZCTA 48215 (score 79, diabetes 20.8%) vs ZCTA 48230 (score 22, diabetes 7.6%), 2.8 km, 65+ 17.9% vs 17.7%

Dos tarjetas oscuras entran desde los costados y se detienen a los lados de una línea punteada central que mide "2.8 km". Cada tarjeta muestra su ZCTA, su score (79 / 22, en la rampa pizarra→coral real del dashboard) y su cifra de diabetes. El "2.7×" se dispara al centro en el mismo instante que la voz dice "diabetes". Fondo: el mapa de puntos real, desenfocado, apenas visible detrás de las tarjetas — ancla visual con el producto desde el segundo 1.

## Frame 02 — El problema

- status: outline
- src: compositions/frames/02-problema.html
- duration: 25s
- transition_in: crossfade
- scene: Tres cifras se ensamblan como un tablero de datos: 88% de variación dentro del estado, 18.8% de estimaciones no confiables, 31,742 códigos postales.
- voiceover: "Hoy, quien reparte presupuesto de salud pública decide con promedios de estado o de condado. Pero el 88% de esa variación ocurre DENTRO de cada estado. Y casi 1 de cada 5 estimaciones tiene tanto margen de error que el número no significa nada."
- blueprint: grid-card-assemble (tablero de datos autoensamblado) componiendo dataviz-countup por cifra
- extra_datos: 87.9% de la variación de pobreza es intra-estado (12.1% inter-estado); 18.8% de observaciones con MOE > valor

Tres tarjetas se ensamblan de izquierda a derecha, cada una con su cifra en mono grande (estilo idéntico al score del panel del dashboard) y una etiqueta corta debajo. La tercera tarjeta (18.8%) se queda encendida un beat más que las otras dos — es el gancho hacia el interruptor que se ve en el Frame 04.

## Frame 03 — Presentamos la herramienta

- status: outline
- src: compositions/frames/03-titulo.html
- duration: 15s
- transition_in: crossfade
- scene: Título del proyecto sobre el mapa de puntos completo de EE. UU., con la fuente de datos acreditada.
- voiceover: "Construimos un índice de vulnerabilidad sociosanitaria para los 31,742 códigos postales de Estados Unidos, con su margen de error incluido."
- blueprint: titlecard-reveal (prólogo de tres tiempos: mapa → nombre → fuente de datos)
- extra_datos: "Datos: ACS 2017–2021 · CDC PLACES 2020" (acreditar con orgullo, nunca fingir datos en vivo)

El mapa nacional de puntos (el real, no una recreación) se revela con un decelerating pull-back, el nombre del proyecto aparece encima, y remata con la línea de fuente de datos en monoespaciada pequeña — la misma que ya vive en el pie del dashboard.

## Frame 04 — Demo: el mapa y el ruido

- status: outline
- src: (pendiente — metraje grabado, no generado)
- duration: 60s
- transition_in: cut
- scene: Grabación en vivo del mapa nacional. Filtran por estado, hacen click en una zona, y activan el interruptor de confiabilidad.
- voiceover: "Así se ve nuestro mapa. Rojo es más vulnerable. [click en una zona] Aquí vemos el desglose: qué factor pesa más, y qué tan confiable es el dato. Pero miren qué pasa si solo dejamos las zonas confiables. [activar interruptor] La lista cambia. Estas zonas que parecían las peores del país... eran ruido."
- blueprint: (footage real — overlay generado: leyenda + resaltado del interruptor con `spotlight-callout` de rules-index)
- extra_datos: el interruptor de confiabilidad; el panel de desglose por temas (percentil nacional)

Este frame es 100% metraje de pantalla — HyperFrames solo agrega una leyenda discreta en la esquina (mono, fondo semitransparente) y un resalte sutil alrededor del interruptor en el momento exacto en que lo activan, para que el ojo del juez no lo pierda entre los controles.

## Frame 05 — Demo: el hallazgo escondido

- status: outline
- src: (pendiente — metraje grabado, no generado)
- duration: 55s
- transition_in: cut
- scene: Cambian al modo "Peor de lo esperado". El mapa se repinta por completo. Hacen click en una zona que en el modo normal no llamaba la atención.
- voiceover: "Entrenamos un modelo que predice la salud de una zona SOLO con su contexto social. Acierta el 78% de las veces. Lo interesante es donde falla. Esta zona [click] tiene un score de apenas 58 — no destaca en el mapa normal. Pero está 32 puntos peor de lo que su contexto explica. Hay 141 zonas así en el país. 2.7 millones de personas invisibles para cualquiera que solo mire el mapa obvio."
- blueprint: (footage real — overlay: video-text-pivot en el instante del click, la cifra "141 zonas · 2.7M personas" ocupa el cuadro un instante)
- extra_datos: R²=0.780; ZCTA 92518 (score 58, residual +32) vs ZCTA 90011 (score 76.6, residual −0.8, "sin sorpresa"); 141 zonas confiables con residual >15, 2.7M habitantes

El momento de mayor peso del video. Tras el click, el metraje se atenúa medio segundo y el dato "141 zonas · 2.7 millones de personas" entra en tipografía grande, mono, centrado — el mismo tratamiento que un stat-card del dashboard, no un elemento ajeno.

## Frame 06 — Demo: el asignador

- status: outline
- src: (pendiente — metraje grabado, no generado)
- duration: 50s
- transition_in: cut
- scene: Abren el asignador, seleccionan Texas y 8 recursos, mueven el criterio de "gravedad" a "equilibrado" en vivo.
- voiceover: "Esto es para quien reparte el presupuesto. Texas, 8 unidades móviles. Si eligiéramos solo las peores zonas, alcanzamos a 199,904 personas. [mover el criterio] Equilibrando gravedad y alcance, alcanzamos a 629,365. Mismo presupuesto. Tres veces más gente. Y noten esto: 363 zonas quedaron fuera de la decisión porque su dato no es confiable."
- blueprint: video-text-pivot (el metraje se desliza y cede el centro a la cifra 629,365, luego a la línea de impacto tipográfica)
- extra_datos: Texas, 8 recursos: 199,904 (solo gravedad) → 629,365 (equilibrado), 363 zonas excluidas por confiabilidad

El clímax del video. Cuando el número salta de 199,904 a 629,365, el metraje se desliza a un costado (no corta) y la cifra nueva llena el cuadro por un instante antes de que el metraje regrese — la misma coreografía visual del Frame 05, para que el patrón "el dato revela algo que no se veía" se sienta repetido y reconocible.

## Frame 07 — Cierre

- status: outline
- src: compositions/frames/07-cierre.html
- duration: 25s
- transition_in: crossfade
- scene: Cadena de tarjetas de cierre monocromáticas: la frase de valor, el nombre del equipo, el link al repositorio, el logo/nombre del proyecto sostenido en el último cuadro.
- voiceover: "No construimos solo un mapa. Construimos una decisión: dónde ayuda más cada peso del presupuesto. Gracias."
- blueprint: titlecard-reveal (cadena de end-cards monocromática, remata sostenido en el logo)
- extra_datos: nombre del equipo, link al repositorio de GitHub, nombre del proyecto

Tres tarjetas encadenadas por cortes secos: frase de valor → créditos del equipo + link al repo → nombre del proyecto sostenido a cuadro completo hasta el final. Sin música que se corte abruptamente; el silencio o un pad suave que se desvanece con la última tarjeta.
