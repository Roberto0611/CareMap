---
workflow: general-video
flow: companion
storyboard: yes
message: "Un índice que cruza contexto social y salud por código postal (ZCTA) revela dónde el presupuesto de salud pública rinde más — y por qué"
audience: "Jueces de un hackathon de datos (DataRush)"
destination: "Archivo mp4, subido al formulario de entrega del reto"
aspect: "16:9, 1920x1080"
language: "es-MX"
length: "4:30 objetivo (tope duro: 5:00, la rúbrica lo especifica)"
angle: "Storytelling con 4 hallazgos reales, en orden creciente de sorpresa, cerrando en una decisión concreta y accionable"
---

## Intent

Video pitch para DataRush. Reto: unir datos sociales (SDOH/ACS) y de salud
(CDC PLACES) por código postal (ZCTA) para que un director de salud pública
decida dónde dirigir presupuesto limitado. Rúbrica pide: comunicar el problema
desde el inicio, quién se beneficia y con qué decisión concreta, storytelling
con datos con al menos un hallazgo real, cierre conciso.

Usuario protagonista: **un director estatal de salud pública repartiendo
presupuesto**, criterio de decisión: personas alcanzadas por peso invertido.

Estructura en 4 golpes narrativos, cada uno con un hallazgo verificado:

1. **Gemelos geográficos** — dos códigos postales a 2.8 km, misma estructura
   de edad, 2.7× más diabetes. Elimina toda excusa (clima, economía, gobierno).
2. **El interruptor de confiabilidad** — el ranking obvio de "peores zonas"
   está lleno de ruido estadístico (18.8% de las estimaciones no son
   confiables); al filtrarlo, el mapa cambia en vivo.
3. **El modelo social→salud** — el contexto social explica el 78% (R²=0.780)
   de la variación en salud; el 22% que falla revela 141 zonas (2.7M
   habitantes) peor de lo que su contexto predice y que el mapa normal no
   distingue.
4. **El asignador** — con el mismo presupuesto, ponderar alcance en vez de
   solo gravedad triplica las personas atendidas (199,904 → 629,365 en Texas
   con 8 recursos), y excluye 363 zonas de la decisión por baja confiabilidad.

## Assets disponibles (del proyecto DataRush)

- `../../.claude/context.md` — todos los hallazgos verificados con sus cifras
  exactas, tabla de arquetipos, casos de gemelos válidos y por qué
- `../../data/zcta_scored.parquet` — la tabla maestra con score, confiabilidad,
  residual, arquetipo, gemelo por cada ZCTA
- `../../mapa_real.png` — render de referencia del mapa de puntos
- El dashboard vive en `../../frontend/frontend` (`/map`, `/gemelos`,
  `/asignador`) — es lo que se graba en vivo para las secciones de demo

## Notes

- **Voz:** propia, grabada por el equipo. Graban video + audio de la pantalla
  en una sola toma (no narración separada) para no tener que sincronizar
  después.
- **Storyboard:** sí — revisar guion + boceto visual antes de renderizar el
  corte final. Solo hay una entrega.
- **Captura de demo:** el equipo ya tiene con qué grabar pantalla (fuera de
  HyperFrames). Ese metraje se entrega como archivo de video y se coloca como
  pista dentro de esta composición.
- **División de trabajo:** intro (0:00–1:00) y cierre (4:00–4:30) son
  generados dentro de HyperFrames con datos y capturas reales, sin esperar a
  que exista la grabación de la demo. Los tres bloques de demo (1:00–4:00) son
  metraje real narrado en vivo, editado aquí con zooms/leyendas encima.
- **Colchón de tiempo:** 4:30 objetivo contra un tope de 5:00 — nunca apuntar
  al límite exacto.
