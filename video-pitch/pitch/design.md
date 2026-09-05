# Diseño — Video pitch DataRush

El video reutiliza el sistema visual real del dashboard, no uno inventado para
la ocasión. Esto es deliberado: los jueces ven la demo en vivo entre escena y
escena, y cualquier discontinuidad visual (otro fondo, otra tipografía, otros
colores) rompe la sensación de que el video y la herramienta son lo mismo.

## Paleta

Fondo oscuro. Mismos valores exactos que `frontend/frontend/src/index.css`:

| Rol | Valor | Uso |
|---|---|---|
| Fondo | `#05080d` (barra) / `#0d1424` (tarjetas) | Todas las escenas |
| Borde | `rgba(255,255,255,0.10)` | Líneas divisorias, tarjetas |
| Texto principal | `#f0f6ff` | Titulares, cifras |
| Texto atenuado | `#8899b4` | Subtítulos, etiquetas |
| Texto tenue | `#556070` | Pies de página, acreditación de fuente |
| **Acento** | `#eb6834` (naranja) | Un solo uso por escena — nunca decoración repetida |

**Rampa de vulnerabilidad** (verificada contra daltonismo, ya en producción):

```
#33505f → #5d6668 → #856455 → #a75f45 → #c65538 → #e3502f → #ff6b3d
 pizarra fría (seguro)                              rojo coral (riesgo)
```

Se usa para colorear cualquier score o barra que aparezca en el video —
el mismo valor siempre pinta el mismo color, en el video y en el dashboard.

## Tipografía

| Rol | Dashboard | Video | Motivo del cambio |
|---|---|---|---|
| Cifras, etiquetas, ZCTA | JetBrains Mono | **JetBrains Mono** | Sin cambio — está en la lista de fuentes embebidas de HyperFrames |
| Texto de cuerpo | Plus Jakarta Sans | **Montserrat** | Plus Jakarta Sans no está pre-empaquetada; en un render en la nube fallaría si no hay red. Montserrat es geométrica como Jakarta y sí está garantizada |

Pesos: JetBrains Mono 400/700 · Montserrat 400/700/900.

## Reglas de la marca visual

- **Un fondo, todas las escenas.** Nunca cambia entre generado y metraje real.
- **El acento naranja se usa una vez por escena**, casi siempre en el dato que
  importa más. Si todo es naranja, nada destaca — ya nos pasó una vez en el
  dashboard y lo corregimos.
- **Las cifras siempre en `font-variant-numeric: tabular-nums`** para que no
  bailen al animarse.
- **Nunca verde→rojo.** Igual que en el mapa: ~8% de los hombres no distingue
  ese par. El color de riesgo va de pizarra fría a coral, nunca de verde a rojo.
- **Acreditar la fuente de datos con orgullo**, nunca simular "datos en vivo":
  `Datos: ACS 2017–2021 · CDC PLACES 2020` en mono pequeño, pie de escena.
- Fondo con textura sutil de grano (igual que el dashboard) — nunca negro
  plano sin textura.

## Formato

1920×1080, 30fps. Cada escena es una sub-composición en `compositions/frames/`;
`index.html` es el orquestador delgado que las coloca en el tiempo.

## Dirección visual — informe de agencia, no lanzamiento de producto

**Referencia real:** el U.S. Web Design System (USWDS) — el sistema que usan
cdc.gov, census.gov, irs.gov — y el formato de figura de un reporte técnico
(GAO, CDC MMWR, Census). Restringido, tipográfico, sin decoración. **No** el
lenguaje de un video de lanzamiento de SaaS.

> ⚠️ Esto es lenguaje visual, no identidad institucional. El video nunca lleva
> sello oficial, nombre de agencia real, ni nada que sugiera que es un sistema
> federal — se acredita al proyecto y al equipo, siempre.

### Prohibido — son las señas de "hecho por una IA" (documentadas en house-style.md)

| Rasgo | Por qué se prohíbe aquí | Qué se usa en su lugar |
|---|---|---|
| Resplandor radial (glow/bloom) detrás de tarjetas o cifras | Es el fondo por defecto de cualquier demo de SaaS generada | Fondo plano, o una retícula de líneas finas tipo papel milimétrico |
| Tarjetas con giro 3D (`rotateY`, "libro abriéndose") | Animación de anuncio de producto | Entradas planas: opacidad + un desplazamiento corto, sin perspectiva |
| Número con `text-shadow` brillante | El remate clásico de video de producto | Color plano, tabular, sin sombra de color |
| Insignias en píldora flotante | Lenguaje de app de consumo | Etiqueta entre corchetes o subrayada, en línea con el texto |
| Todo centrado y espejado con peso idéntico | La guía lo marca como *el* patrón #1 que delata una IA | Anclar a bordes/esquinas; asimetría deliberada — un elemento lidera |
| Entradas con rebote (`back.out`, spring-pop con overshoot) | Registro "juguetón", nunca corporativo/serio | `power3.out` sin overshoot — asentamiento limpio |

### Convenciones de "figura de reporte" (sí usar)

- **Número de figura** en la esquina (`FIG. 01`), como en cualquier reporte técnico
- **Reglas finas** (1px) como divisores y como elemento animado (`scaleX` desde 0)
- **Barra de escala / línea de acotación** para distancias — como un plano, con
  marcas en los extremos, no una insignia flotante
- **Cifras siempre en JetBrains Mono, tabular, color plano** — nunca con brillo
- **Cita de fuente como pie de figura**, no como marca de agua discreta:
  `FUENTE: ACS 2017–2021 · CDC PLACES 2020`
- **Composición dividida en zonas** (paneles/columnas), nunca un bloque
  flotando centrado en el vacío

### Tipografía — una sola familia, jugando con peso y tracking

Se descarta añadir una serif "de reporte" (Bitter, Source Serif, Georgia): no
están pre-empaquetadas en HyperFrames y un render en la nube fallaría sin red
— el mismo motivo por el que ya se descartó Plus Jakarta Sans. En su lugar,
la sensación de "encabezado oficial" sale de **Montserrat en mayúsculas, peso
700, tracking amplio** para eyebrows/figuras — y Montserrat 400 normal para
cuerpo. JetBrains Mono se reserva estrictamente para números y datos.

### Movimiento

Medio a lento (0.4–0.6s), nunca el "salto rápido" de 0.2s que se siente
como notificación de app. Fases del guion de motion-principles.md:
**construir → respirar → resolver** — un solo movimiento ambiental por escena
(nunca varios brillos pulsando a la vez), y quietud después del movimiento
en vez de loops constantes.
