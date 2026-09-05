#!/usr/bin/env python3
"""
02_score.py — Estación ②③④: Score, Confiabilidad y Desglose
=============================================================

Entrada:  data/zcta_master_analytical.parquet  (salida de etl_zcta_unify.py)
Salida:   data/zcta_scored.parquet

Después de este script corren 05, 06 y 07 (que agregan columnas al mismo
parquet) y al final 08_export_web.py, que escribe el JSON para el frontend.

Método
------
No se pueden promediar indicadores medidos en escalas distintas (22% de pobreza
es "mucho", 22% de obesidad es "poco"). Por eso cada indicador se convierte a
PERCENTIL: "¿qué porcentaje de las 31,742 zonas del país está mejor que esta?"
Todos quedan en la misma regla 0-100 y ahí sí se pueden promediar.

Los indicadores donde MÁS ES MEJOR (ir al dentista, hacerse el chequeo) se
invierten antes de promediar. Si no, premiaríamos a las zonas por tener buena
atención médica.

Todos los indicadores pesan igual. Es defendible y explicable; pesos inventados
invitan a la pregunta "¿y por qué 0.3?".
"""

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

# La consola de Windows usa cp1252 por defecto y truena con acentos/símbolos.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001 - consolas que no lo soportan
    pass

ROOT = Path(__file__).resolve().parent.parent
IN_PARQUET = ROOT / "data" / "zcta_master_analytical.parquet"
OUT_PARQUET = ROOT / "data" / "zcta_scored.parquet"

# ─────────────────────────────────────────────────────────────────────
# Indicadores
# ─────────────────────────────────────────────────────────────────────

# Sociales (SDOH). Sufijo _value. En todos, MÁS = PEOR.
# Nota: REMNRTY (minoría racial/étnica) y AGE65 se incluyen siguiendo el
# precedente del CDC Social Vulnerability Index. Son decisiones discutibles:
# si el equipo prefiere no tratarlas como vulnerabilidad, quítalas de esta
# lista y documenta el cambio en el README.
SOCIAL = [
    "POV150",   # Pobreza (<150% del nivel federal)
    "UNEMP",    # Desempleo
    "NOHSDP",   # Sin diploma de preparatoria
    "CROWD",    # Hacinamiento
    "SNGPNT",   # Hogares monoparentales
    "BROAD",    # Sin banda ancha
    "HCOST",    # Carga del costo de vivienda
    "REMNRTY",  # Minoría racial/étnica
    "AGE65",    # 65 años o más
]

# Salud (PLACES). Sufijo _CrudePrev. MÁS = PEOR.
HEALTH_BAD = [
    "ACCESS2",    # sin seguro médico
    "ARTHRITIS", "BPHIGH", "CASTHMA", "CHD", "COPD",
    "CSMOKING", "DIABETES", "HIGHCHOL", "KIDNEY", "LPA", "MHLTH",
    "OBESITY", "PHLTH", "SLEEP", "STROKE", "TEETHLOST",
]

# EXCLUIDOS del score, con motivo empírico (medido sobre estos datos):
#   BINGE  (consumo excesivo de alcohol) correlaciona -0.31 con pobreza.
#   CANCER (cáncer diagnosticado)        correlaciona -0.15 con pobreza.
# Ambos son MÁS ALTOS en zonas acomodadas: el binge drinking sube con el
# ingreso, y el cáncer diagnosticado depende de tener acceso a diagnóstico.
# Incluirlos como "peor = más" hacía que zonas ricas aparecieran vulnerables.
# Siguen en la tabla para consulta; solo no entran al índice.
HEALTH_EXCLUDED = ["BINGE", "CANCER"]

# Salud (PLACES). MÁS = MEJOR  -> hay que INVERTIR el percentil.
HEALTH_GOOD = [
    "BPMED", "CERVICAL", "CHECKUP", "CHOLSCREEN", "COLON_SCREEN",
    "COREM", "COREW", "DENTAL", "MAMMOUSE",
]

# Etiquetas legibles para el panel del dashboard
LABELS = {
    "POV150": "Pobreza",
    "UNEMP": "Desempleo",
    "NOHSDP": "Sin preparatoria",
    "CROWD": "Hacinamiento",
    "SNGPNT": "Hogares monoparentales",
    "BROAD": "Sin internet",
    "HCOST": "Costo de vivienda",
    "REMNRTY": "Minoría racial/étnica",
    "AGE65": "Población 65+",
    "ACCESS2": "Sin seguro médico",
    "ARTHRITIS": "Artritis",
    "BINGE": "Consumo excesivo de alcohol",
    "BPHIGH": "Hipertensión",
    "BPMED": "Sin medicación para presión",
    "CANCER": "Cáncer",
    "CASTHMA": "Asma",
    "CERVICAL": "Sin tamizaje cervical",
    "CHD": "Enfermedad coronaria",
    "CHECKUP": "Sin chequeo anual",
    "CHOLSCREEN": "Sin tamizaje de colesterol",
    "COLON_SCREEN": "Sin tamizaje de colon",
    "COPD": "EPOC",
    "COREM": "Sin prevención (hombres 65+)",
    "COREW": "Sin prevención (mujeres 65+)",
    "CSMOKING": "Tabaquismo",
    "DENTAL": "Sin visita al dentista",
    "DIABETES": "Diabetes",
    "HIGHCHOL": "Colesterol alto",
    "KIDNEY": "Enfermedad renal",
    "LPA": "Inactividad física",
    "MAMMOUSE": "Sin mamografía",
    "MHLTH": "Mala salud mental",
    "OBESITY": "Obesidad",
    "PHLTH": "Mala salud física",
    "SLEEP": "Sueño insuficiente",
    "STROKE": "Accidente cerebrovascular",
    "TEETHLOST": "Pérdida de dientes",
}


# Temas para el desglose. Repartir la contribución entre 35 indicadores diluye
# todo (cada uno aporta ~3% y el panel acaba diciendo "sueño insuficiente 4%").
# Agrupados en 6 temas, cada barra significa algo y sugiere una acción distinta.
THEMES: dict[str, list[str]] = {
    "Socioeconómico": ["POV150", "UNEMP", "NOHSDP", "HCOST"],
    "Vivienda y conectividad": ["CROWD", "BROAD", "SNGPNT"],
    "Perfil demográfico": ["REMNRTY", "AGE65"],
    "Acceso a atención": [
        "ACCESS2", "CHECKUP", "DENTAL", "BPMED", "CHOLSCREEN",
        "COLON_SCREEN", "CERVICAL", "MAMMOUSE", "COREM", "COREW",
    ],
    "Carga de enfermedad": [
        "DIABETES", "BPHIGH", "OBESITY", "CHD", "COPD", "KIDNEY",
        "STROKE", "ARTHRITIS", "CASTHMA", "HIGHCHOL", "MHLTH", "PHLTH",
    ],
    "Conductas de riesgo": ["CSMOKING", "LPA", "SLEEP"],
}

# El desglose contesta "¿qué acción tomo aquí?", así que solo lista temas
# accionables. "Perfil demográfico" sigue contando en el score (precedente
# del CDC SVI) pero no aparece como causa: la edad y la composición étnica
# de una comunidad son contexto, no algo que un programa vaya a cambiar.
THEMES_ACCIONABLES = [t for t in THEMES if t != "Perfil demográfico"]

# Nombre de columna por tema. Orden fijo para que el panel siempre muestre
# las mismas cinco barras en el mismo lugar y dos zonas sean comparables.
THEME_COL = {
    "Socioeconómico":          "t_socioeco",
    "Vivienda y conectividad": "t_vivienda",
    "Acceso a atención":       "t_acceso",
    "Carga de enfermedad":     "t_enfermedad",
    "Conductas de riesgo":     "t_conductas",
}


def log(msg: str) -> None:
    print(f"  ▸ {msg}")


def section(title: str) -> None:
    print(f"\n{'─' * 70}\n  {title}\n{'─' * 70}")


def pct_rank(s: pd.Series, invert: bool = False) -> pd.Series:
    """Percentil 0-100. invert=True para indicadores donde más = mejor."""
    r = s.rank(pct=True) * 100
    return (100 - r) if invert else r


def main() -> int:
    if not IN_PARQUET.exists():
        print(f"ERROR: no existe {IN_PARQUET}. Corre etl_zcta_unify.py primero.")
        return 1

    df = pd.read_parquet(IN_PARQUET)
    section(f"Cargado: {len(df):,} ZCTAs × {df.shape[1]} columnas")

    # ── Población de la zona ──────────────────────────────────────────
    pop_cols = [f"{m}_total_pop" for m in SOCIAL if f"{m}_total_pop" in df.columns]
    df["poblacion"] = df[pop_cols].max(axis=1)

    # ═════════════════════════════════════════════════════════════════
    # ② SCORE — percentiles
    # ═════════════════════════════════════════════════════════════════
    section("② Score (percentiles)")

    pct: dict[str, pd.Series] = {}

    for m in SOCIAL:
        col = f"{m}_value"
        if col in df.columns:
            pct[m] = pct_rank(df[col])
        else:
            log(f"⚠ falta {col}")

    for m in HEALTH_BAD:
        col = f"{m}_CrudePrev"
        if col in df.columns:
            pct[m] = pct_rank(df[col])
        else:
            log(f"⚠ falta {col}")

    for m in HEALTH_GOOD:
        col = f"{m}_CrudePrev"
        if col in df.columns:
            pct[m] = pct_rank(df[col], invert=True)   # más = mejor -> invertir
        else:
            log(f"⚠ falta {col}")

    pct_df = pd.DataFrame(pct, index=df.index)

    soc_cols = [m for m in SOCIAL if m in pct_df]
    hea_cols = [m for m in HEALTH_BAD + HEALTH_GOOD if m in pct_df]

    df["score_social"] = pct_df[soc_cols].mean(axis=1, skipna=True)
    df["score_salud"] = pct_df[hea_cols].mean(axis=1, skipna=True)
    # El score total pesa social y salud por igual (no por número de indicadores,
    # que sería 9 vs 28 y dejaría a lo social sin voz).
    df["score"] = df[["score_social", "score_salud"]].mean(axis=1, skipna=True)

    log(f"indicadores usados: {len(soc_cols)} sociales + {len(hea_cols)} de salud")
    log(f"score: min {df.score.min():.1f} | mediana {df.score.median():.1f} | max {df.score.max():.1f}")

    # ═════════════════════════════════════════════════════════════════
    # ③ CONFIABILIDAD
    # ═════════════════════════════════════════════════════════════════
    section("③ Confiabilidad")

    noise_cols = [f"{m}_high_noise" for m in SOCIAL if f"{m}_high_noise" in df.columns]
    df["n_ruido"] = df[noise_cols].sum(axis=1)

    # Umbrales calibrados: n_ruido es casi un termómetro de población.
    # Mediana de habitantes por tramo -> n=0: 34,612 | n=4: 3,281 | n=7: 1,090 | n=9: 254
    # "baja" a partir de n>=7 aísla las zonas de ~1,000 habitantes o menos,
    # que es donde la encuesta deja de ser informativa.
    df["confiabilidad"] = np.select(
        [
            (df.poblacion < 500) | (df.n_ruido >= 7),
            (df.n_ruido >= 4),
        ],
        ["baja", "media"],
        default="alta",
    )

    for k, v in df.confiabilidad.value_counts().items():
        log(f"{k}: {v:,} ({v / len(df) * 100:.1f}%)")

    # ═════════════════════════════════════════════════════════════════
    # ④ DESGLOSE — qué lo causa aquí
    # ═════════════════════════════════════════════════════════════════
    section("④ Desglose (top 4 factores por zona)")

    # Cada tema se mide contra SU PROPIA distribución nacional.
    #
    # Antes se promediaba cuánto se pasaba cada indicador de la mediana, y eso
    # castigaba a los temas amplios: "Carga de enfermedad" tiene 12 indicadores,
    # así que un par de valores normales le hundían el promedio aunque la zona
    # estuviera en el percentil 99 de cinco enfermedades a la vez. Es como
    # comparar el promedio de un alumno con 3 materias contra uno con 12.
    #
    # Al volver a rankear el tema entre las 31,742 zonas, el número de
    # indicadores dentro del tema deja de importar.
    theme_raw = pd.DataFrame(
        {
            name: pct_df[[m for m in THEMES[name] if m in pct_df.columns]].mean(axis=1)
            for name in THEMES_ACCIONABLES
        },
        index=df.index,
    )
    theme_pct = theme_raw.rank(pct=True) * 100

    # Orden FIJO de columnas: así, al comparar dos zonas, las barras se quedan
    # en su lugar y se puede leer la diferencia de forma (clave para gemelos).
    for name in THEMES_ACCIONABLES:
        df[THEME_COL[name]] = theme_pct[name].round(1)

    # Titular: el tema más alto y, dentro de él, el indicador que manda
    arr = np.nan_to_num(theme_pct.to_numpy())
    names = np.array(theme_pct.columns)
    top_idx = np.argmax(arr, axis=1)
    df["factor1"] = names[top_idx]
    df["factor1_pct"] = np.round(arr[np.arange(len(arr)), top_idx], 1)

    detail = []
    p = pct_df.fillna(0)
    for row, theme in enumerate(names[top_idx]):
        members = [m for m in THEMES[theme] if m in p.columns]
        vals = p.iloc[row][members]
        detail.append(LABELS.get(vals.idxmax(), None) if vals.max() > 50 else None)
    df["factor1_detalle"] = detail

    log("tema dominante más común:")
    for k, v in df.factor1.value_counts().items():
        log(f"   {k}: {v:,} zonas")

    # ═════════════════════════════════════════════════════════════════
    # Salida
    # ═════════════════════════════════════════════════════════════════
    section("Salida")

    keep = [
        "zcta", "latitude", "longitude", "county_name", "state_abbr", "state_name",
        "poblacion", "score", "score_social", "score_salud",
        "confiabilidad", "n_ruido",
        "factor1", "factor1_pct", "factor1_detalle",
        *THEME_COL.values(),
        # indicadores destacados para el panel / tooltip
        "POV150_value", "ACCESS2_CrudePrev", "DIABETES_CrudePrev",
        "OBESITY_CrudePrev", "MHLTH_CrudePrev", "CSMOKING_CrudePrev",
    ]
    keep = [c for c in keep if c in df.columns]
    out = df[keep].copy()

    # OJO: las coordenadas NO se redondean junto con lo demás.
    # A 1 decimal el error es de ~11 km — suficiente para que dos ZCTAs
    # distintas caigan en el mismo punto y el cálculo de gemelos (07) diga
    # "0.0 km" entre zonas que están a kilómetros. Se quedan con 5 decimales
    # (~1 m), que es la precisión del centroide del Census.
    COORDS = {"latitude", "longitude"}
    for c in out.select_dtypes("float").columns:
        out[c] = out[c].round(5 if c in COORDS else 1)

    out.to_parquet(OUT_PARQUET, index=False)
    log(f"{OUT_PARQUET.name}  ({OUT_PARQUET.stat().st_size / 1e6:.1f} MB)")

    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
