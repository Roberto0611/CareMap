#!/usr/bin/env python3
"""
etl_zcta_unify.py — Limpieza y Unificación de 4 Datasets a Nivel ZCTA
======================================================================

Unifica:
  1. SDOH_f-Measures_Data.csv   (Determinantes sociales, formato largo)
  2. PLACES_f-ZCTA5_Data.csv    (Indicadores de salud CDC PLACES, formato ancho)
  3. COUNTYDAT-f_Data.csv       (Crosswalk ZCTA → Condado)
  4. STATESDAT-f_Data.csv       (Catálogo de Estados)

Salida:
  - data/zcta_master_analytical.parquet
  - data/zcta_master_analytical.csv

Dependencias: pandas, pyarrow
Autor: DataRush-3 team
"""

import re
import sys
import warnings
from pathlib import Path

import pandas as pd
import numpy as np

warnings.filterwarnings("ignore", category=pd.errors.DtypeWarning)

# ─────────────────────────────────────────────────────────────────────
# Configuración
# ─────────────────────────────────────────────────────────────────────
DATA_DIR = Path(__file__).resolve().parent / "data"

SDOH_FILE     = DATA_DIR / "SDOH_f-Measures_Data.csv"
PLACES_FILE   = DATA_DIR / "PLACES_f-ZCTA5_Data.csv"
COUNTY_FILE   = DATA_DIR / "COUNTYDAT-f_Data.csv"
STATES_FILE   = DATA_DIR / "STATESDAT-f_Data.csv"

OUTPUT_PARQUET = DATA_DIR / "zcta_master_analytical.parquet"
OUTPUT_CSV     = DATA_DIR / "zcta_master_analytical.csv"

# Los 9 MeasureIDs del SDOH
SDOH_MEASURE_IDS = [
    "POV150",   # Pobreza (< 150% nivel federal)
    "UNEMP",    # Desempleo
    "NOHSDP",   # Sin diploma de preparatoria
    "CROWD",    # Hacinamiento
    "SNGPNT",   # Hogares monoparentales
    "BROAD",    # Sin banda ancha
    "HCOST",    # Carga del costo de vivienda
    "REMNRTY",  # Minoría racial/étnica
    "AGE65",    # Personas de 65+ años
]

# Columnas de salud (PLACES) — pares de prevalencia y CI
PLACES_INDICATORS = [
    "ACCESS2", "ARTHRITIS", "BINGE", "BPHIGH", "BPMED", "CANCER",
    "CASTHMA", "CERVICAL", "CHD", "CHECKUP", "CHOLSCREEN",
    "COLON_SCREEN", "COPD", "COREM", "COREW", "CSMOKING", "DENTAL",
    "DIABETES", "HIGHCHOL", "KIDNEY", "LPA", "MAMMOUSE", "MHLTH",
    "OBESITY", "PHLTH", "SLEEP", "STROKE", "TEETHLOST",
]


def log(msg: str) -> None:
    """Imprime mensaje con prefijo de etapa."""
    print(f"  ▸ {msg}")


def section(title: str) -> None:
    """Imprime encabezado de sección."""
    print(f"\n{'─' * 70}")
    print(f"  {title}")
    print(f"{'─' * 70}")


# =====================================================================
# FASE 1 — Carga y Estandarización de Llaves
# =====================================================================
def load_and_standardize() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Carga los 4 CSVs y normaliza las llaves ZCTA/FIPS."""
    section("FASE 1 — Carga y Estandarización de Llaves")

    # --- SDOH (formato largo) ---
    log("Cargando SDOH...")
    sdoh = pd.read_csv(
        SDOH_FILE,
        dtype={
            "LocationName": str,
            "LocationID": str,
            "MeasureID": str,
            "Data_Value": str,
            "MOE": str,
            "TotalPopulation": str,
            "Geolocation": str,
        },
    )
    log(f"  SDOH crudo: {sdoh.shape[0]:,} filas × {sdoh.shape[1]} columnas")

    # Filtrar solo las filas con MeasureID válido (excluir filas corruptas)
    sdoh = sdoh[sdoh["MeasureID"].isin(SDOH_MEASURE_IDS)].copy()
    log(f"  SDOH filtrado (9 indicadores): {sdoh.shape[0]:,} filas")

    # Normalizar ZCTA a 5 dígitos con ceros a la izquierda
    sdoh["zcta"] = sdoh["LocationName"].str.strip().str.zfill(5)

    # --- PLACES (formato ancho) ---
    log("Cargando PLACES...")
    places = pd.read_csv(PLACES_FILE, dtype={"ZCTA5": str})
    log(f"  PLACES crudo: {places.shape[0]:,} filas × {places.shape[1]} columnas")

    places["zcta"] = places["ZCTA5"].str.strip().str.zfill(5)

    # --- COUNTYDAT (crosswalk) ---
    log("Cargando COUNTYDAT...")
    county = pd.read_csv(
        COUNTY_FILE,
        dtype={
            "GEOID_ZCTA5_20": str,
            "GEOID_COUNTY_20": str,
            "NAMELSAD_COUNTY_20": str,
            "AREALAND_PART": str,
        },
    )
    log(f"  COUNTYDAT crudo: {county.shape[0]:,} filas × {county.shape[1]} columnas")

    county["zcta"] = county["GEOID_ZCTA5_20"].str.strip().str.zfill(5)
    county["county_fips"] = county["GEOID_COUNTY_20"].str.strip().str.zfill(5)
    county["AREALAND_PART"] = pd.to_numeric(county["AREALAND_PART"], errors="coerce")

    # --- STATESDAT (catálogo) ---
    log("Cargando STATESDAT...")
    states = pd.read_csv(STATES_FILE, dtype={"STATE": str, "STUSAB": str, "STATE_NAME": str})
    log(f"  STATESDAT: {states.shape[0]} filas")

    states["state_fips"] = states["STATE"].str.strip().str.zfill(2)
    states = states.rename(columns={"STUSAB": "state_abbr", "STATE_NAME": "state_name"})

    return sdoh, places, county, states


# =====================================================================
# FASE 2 — Limpieza de Tipos de Datos
# =====================================================================
def clean_data_types(sdoh: pd.DataFrame, places: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Limpia poblaciones, coordenadas WKT e intervalos de confianza."""
    section("FASE 2 — Limpieza de Tipos de Datos")

    # --- SDOH: TotalPopulation (texto con comas → Int64) ---
    log("Limpiando TotalPopulation (quitando comas, comillas)...")
    sdoh["TotalPopulation"] = (
        sdoh["TotalPopulation"]
        .str.replace(r'[",\s]', "", regex=True)
    )
    sdoh["TotalPopulation"] = pd.to_numeric(sdoh["TotalPopulation"], errors="coerce").astype("Int64")
    pop_nulls = sdoh["TotalPopulation"].isna().sum()
    log(f"  TotalPopulation: {pop_nulls} nulos tras conversión")

    # --- SDOH: Data_Value y MOE → float64 ---
    log("Convirtiendo Data_Value y MOE a float64...")
    sdoh["Data_Value"] = pd.to_numeric(sdoh["Data_Value"], errors="coerce")
    sdoh["MOE"] = pd.to_numeric(sdoh["MOE"], errors="coerce")
    val_nulls = sdoh["Data_Value"].isna().sum()
    moe_nulls = sdoh["MOE"].isna().sum()
    log(f"  Data_Value nulos: {val_nulls:,} | MOE nulos: {moe_nulls:,}")

    # --- SDOH: Geolocation POINT (lon lat) → latitude, longitude ---
    log("Parseando coordenadas WKT (POINT)...")
    wkt_pattern = re.compile(r"POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)")

    def parse_wkt(val):
        if pd.isna(val) or not isinstance(val, str):
            return pd.Series([np.nan, np.nan], index=["longitude", "latitude"])
        m = wkt_pattern.search(val)
        if m:
            return pd.Series([float(m.group(1)), float(m.group(2))], index=["longitude", "latitude"])
        return pd.Series([np.nan, np.nan], index=["longitude", "latitude"])

    coords = sdoh["Geolocation"].apply(parse_wkt)
    sdoh["longitude"] = coords["longitude"]
    sdoh["latitude"] = coords["latitude"]
    geo_nulls = sdoh["latitude"].isna().sum()
    log(f"  Coordenadas parseadas. Nulos: {geo_nulls:,}")

    # --- PLACES: Parsear IC95% "(inf, sup)" → _ic_lower, _ic_upper ---
    log("Parseando intervalos de confianza 95% de PLACES...")
    # Regex que exige al menos un dígito (evita matchear un '.' suelto)
    ci_pattern = re.compile(r"\(\s*(\d+\.?\d*)\s*,\s*(\d+\.?\d*)\s*\)")

    ci_cols = [c for c in places.columns if c.endswith("_Crude95CI")]
    parsed_count = 0

    for col in ci_cols:
        prefix = col.replace("_Crude95CI", "")
        lower_col = f"{prefix}_ic_lower"
        upper_col = f"{prefix}_ic_upper"

        def parse_ci(val):
            if pd.isna(val) or not isinstance(val, str):
                return np.nan, np.nan
            m = ci_pattern.search(val)
            if m:
                try:
                    return float(m.group(1)), float(m.group(2))
                except (ValueError, TypeError):
                    return np.nan, np.nan
            return np.nan, np.nan

        parsed = places[col].apply(parse_ci)
        places[lower_col] = parsed.apply(lambda x: x[0])
        places[upper_col] = parsed.apply(lambda x: x[1])
        parsed_count += 1

    log(f"  {parsed_count} columnas de IC95% parseadas → {parsed_count * 2} columnas nuevas")

    # Convertir las columnas CrudePrev a float64 (por si alguna es str)
    prev_cols = [c for c in places.columns if c.endswith("_CrudePrev")]
    for col in prev_cols:
        places[col] = pd.to_numeric(places[col], errors="coerce")

    log(f"  {len(prev_cols)} columnas CrudePrev convertidas a float64")

    return sdoh, places


# =====================================================================
# FASE 3 — Pivoteo SDOH (largo → ancho)
# =====================================================================
def pivot_sdoh(sdoh: pd.DataFrame) -> pd.DataFrame:
    """Pivotea SDOH de formato largo a ancho: 1 fila por ZCTA."""
    section("FASE 3 — Pivoteo SDOH (largo → ancho)")

    # Verificar duplicados (ZCTA, MeasureID)
    dupes = sdoh.groupby(["zcta", "MeasureID"]).size()
    dupes_multi = dupes[dupes > 1]
    if len(dupes_multi) > 0:
        log(f"  ⚠ {len(dupes_multi)} combinaciones (ZCTA, MeasureID) duplicadas — se toma la primera")
        sdoh = sdoh.drop_duplicates(subset=["zcta", "MeasureID"], keep="first")

    # Extraer coordenadas únicas por ZCTA (tomar la primera no-nula)
    log("Extrayendo coordenadas únicas por ZCTA...")
    coords_df = (
        sdoh.dropna(subset=["latitude", "longitude"])
        .drop_duplicates(subset=["zcta"], keep="first")[["zcta", "latitude", "longitude"]]
    )
    log(f"  Coordenadas para {coords_df.shape[0]:,} ZCTAs")

    # Pivotar Data_Value
    log("Pivoteando Data_Value...")
    pivot_val = sdoh.pivot_table(
        index="zcta",
        columns="MeasureID",
        values="Data_Value",
        aggfunc="first",
    )
    pivot_val.columns = [f"{c}_value" for c in pivot_val.columns]

    # Pivotar MOE
    log("Pivoteando MOE...")
    pivot_moe = sdoh.pivot_table(
        index="zcta",
        columns="MeasureID",
        values="MOE",
        aggfunc="first",
    )
    pivot_moe.columns = [f"{c}_moe" for c in pivot_moe.columns]

    # Pivotar TotalPopulation
    log("Pivoteando TotalPopulation...")
    pivot_pop = sdoh.pivot_table(
        index="zcta",
        columns="MeasureID",
        values="TotalPopulation",
        aggfunc="first",
    )
    pivot_pop.columns = [f"{c}_total_pop" for c in pivot_pop.columns]

    # Combinar todos los pivotes
    sdoh_wide = pd.concat([pivot_val, pivot_moe, pivot_pop], axis=1).reset_index()

    # Agregar coordenadas
    sdoh_wide = sdoh_wide.merge(coords_df, on="zcta", how="left")

    log(f"  SDOH ancho: {sdoh_wide.shape[0]:,} ZCTAs × {sdoh_wide.shape[1]} columnas")
    log(f"  Columnas generadas: {sorted([c for c in sdoh_wide.columns if c != 'zcta'])[:6]}... (y más)")

    return sdoh_wide


# =====================================================================
# FASE 4 — Métricas de Confiabilidad (MOE)
# =====================================================================
def add_reliability_metrics(sdoh_wide: pd.DataFrame) -> pd.DataFrame:
    """Calcula moe_ratio y high_noise_flag por cada indicador social."""
    section("FASE 4 — Métricas de Confiabilidad (MOE)")

    total_flags = 0

    for measure_id in SDOH_MEASURE_IDS:
        val_col = f"{measure_id}_value"
        moe_col = f"{measure_id}_moe"
        pop_col = f"{measure_id}_total_pop"
        ratio_col = f"{measure_id}_moe_ratio"
        flag_col = f"{measure_id}_high_noise"

        if val_col not in sdoh_wide.columns:
            log(f"  ⚠ Columna {val_col} no encontrada, saltando {measure_id}")
            continue

        # MOE ratio = MOE / valor (protección contra div por cero)
        sdoh_wide[ratio_col] = np.where(
            (sdoh_wide[val_col] == 0) | sdoh_wide[val_col].isna(),
            np.nan,
            sdoh_wide[moe_col] / sdoh_wide[val_col],
        )

        # High noise flag: moe_ratio > 0.5 OR población < 500
        sdoh_wide[flag_col] = (
            (sdoh_wide[ratio_col] > 0.5) | (sdoh_wide[pop_col] < 500)
        )
        # Donde no podemos determinar (ambos nulos), dejamos False
        sdoh_wide[flag_col] = sdoh_wide[flag_col].fillna(False).astype(bool)

        n_flagged = sdoh_wide[flag_col].sum()
        median_ratio = sdoh_wide[ratio_col].median()
        total_flags += n_flagged
        log(f"  {measure_id}: mediana MOE ratio = {median_ratio:.3f}, "
            f"high_noise = {n_flagged:,} ({n_flagged / len(sdoh_wide) * 100:.1f}%)")

    log(f"  Total banderas de ruido alto (todos los indicadores): {total_flags:,}")
    return sdoh_wide


# =====================================================================
# FASE 5 — Desempate Crosswalk ZCTA → Condado
# =====================================================================
def resolve_county_crosswalk(county: pd.DataFrame) -> pd.DataFrame:
    """Asigna un único condado principal a cada ZCTA por mayor área terrestre."""
    section("FASE 5 — Desempate Crosswalk ZCTA → Condado")

    total_rows = len(county)
    unique_zctas = county["zcta"].nunique()
    log(f"  Filas totales: {total_rows:,} | ZCTAs únicos: {unique_zctas:,}")

    # Ordenar por ZCTA y área descendente, tomar la primera fila por ZCTA
    county_sorted = county.sort_values(["zcta", "AREALAND_PART"], ascending=[True, False])
    county_primary = county_sorted.drop_duplicates(subset=["zcta"], keep="first").copy()

    multi_county = total_rows - unique_zctas
    log(f"  ZCTAs que cruzan múltiples condados: {multi_county:,} filas extra eliminadas")

    # Extraer FIPS de estado (primeros 2 dígitos del FIPS de condado)
    county_primary["state_fips"] = county_primary["county_fips"].str[:2]
    county_primary = county_primary.rename(columns={"NAMELSAD_COUNTY_20": "county_name"})

    result = county_primary[["zcta", "county_fips", "county_name", "state_fips"]].copy()
    log(f"  Crosswalk desempatado: {result.shape[0]:,} ZCTAs → 1 condado cada uno")

    return result


# =====================================================================
# FASE 6 — Join con Catálogo de Estados
# =====================================================================
def join_states(county_xwalk: pd.DataFrame, states: pd.DataFrame) -> pd.DataFrame:
    """Agrega nombre y abreviatura de estado al crosswalk."""
    section("FASE 6 — Join con Catálogo de Estados")

    result = county_xwalk.merge(
        states[["state_fips", "state_abbr", "state_name"]],
        on="state_fips",
        how="left",
    )

    no_state = result["state_name"].isna().sum()
    if no_state > 0:
        log(f"  ⚠ {no_state} ZCTAs sin match de estado (territorios u otros)")
    else:
        log("  Todos los ZCTAs matchearon con un estado")

    log(f"  Crosswalk enriquecido: {result.shape[0]:,} filas × {result.shape[1]} columnas")
    return result


# =====================================================================
# FASE 7 — Join Final
# =====================================================================
def final_join(
    sdoh_wide: pd.DataFrame,
    places: pd.DataFrame,
    county_xwalk: pd.DataFrame,
) -> pd.DataFrame:
    """INNER JOIN SDOH × PLACES, luego LEFT JOIN con crosswalk+estados."""
    section("FASE 7 — Join Final")

    # --- Preparar PLACES (quitar columnas originales CI y ZCTA5) ---
    ci_cols_orig = [c for c in places.columns if c.endswith("_Crude95CI")]
    places_clean = places.drop(columns=ci_cols_orig + ["ZCTA5"], errors="ignore")

    sdoh_zctas = set(sdoh_wide["zcta"])
    places_zctas = set(places_clean["zcta"])

    only_sdoh = sdoh_zctas - places_zctas
    only_places = places_zctas - sdoh_zctas
    both = sdoh_zctas & places_zctas

    log(f"  ZCTAs en SDOH:   {len(sdoh_zctas):,}")
    log(f"  ZCTAs en PLACES: {len(places_zctas):,}")
    log(f"  ZCTAs en ambos (INNER JOIN): {len(both):,}")
    log(f"  ZCTAs solo en SDOH (excluidos): {len(only_sdoh):,}")
    log(f"  ZCTAs solo en PLACES (excluidos): {len(only_places):,}")

    # INNER JOIN
    merged = sdoh_wide.merge(places_clean, on="zcta", how="inner")
    log(f"  Tras INNER JOIN: {merged.shape[0]:,} filas × {merged.shape[1]} columnas")

    # LEFT JOIN con crosswalk + estados
    merged = merged.merge(county_xwalk, on="zcta", how="left")

    no_county = merged["county_fips"].isna().sum()
    log(f"  ZCTAs sin condado asignado: {no_county:,}")
    log(f"  Tabla final: {merged.shape[0]:,} filas × {merged.shape[1]} columnas")

    # Verificar unicidad
    assert merged["zcta"].is_unique, "¡ERROR! Hay ZCTAs duplicados en la tabla final"
    log("  ✓ Verificación de unicidad pasada (1 fila por ZCTA)")

    return merged


# =====================================================================
# FASE 8 — Salida y Reporte
# =====================================================================
def save_and_report(df: pd.DataFrame) -> None:
    """Guarda el resultado y genera reporte de sanidad."""
    section("FASE 8 — Salida y Reporte")

    # --- Reordenar columnas ---
    # Geo primero, luego SDOH, luego PLACES, luego IC
    geo_cols = ["zcta", "latitude", "longitude", "county_fips", "county_name",
                "state_fips", "state_abbr", "state_name"]
    geo_cols = [c for c in geo_cols if c in df.columns]

    sdoh_cols = sorted([c for c in df.columns if any(c.startswith(m) for m in SDOH_MEASURE_IDS)])
    places_prev_cols = sorted([c for c in df.columns if c.endswith("_CrudePrev")])
    places_ic_cols = sorted([c for c in df.columns if c.endswith("_ic_lower") or c.endswith("_ic_upper")])

    other_cols = [c for c in df.columns
                  if c not in geo_cols + sdoh_cols + places_prev_cols + places_ic_cols]

    ordered = geo_cols + sdoh_cols + places_prev_cols + places_ic_cols + other_cols
    # Eliminar duplicados preservando orden
    seen = set()
    ordered_unique = []
    for c in ordered:
        if c not in seen:
            ordered_unique.append(c)
            seen.add(c)
    df = df[ordered_unique]

    # --- Guardar ---
    log(f"Guardando Parquet → {OUTPUT_PARQUET}")
    df.to_parquet(OUTPUT_PARQUET, index=False, engine="pyarrow")
    parquet_size = OUTPUT_PARQUET.stat().st_size / (1024 * 1024)
    log(f"  Tamaño: {parquet_size:.1f} MB")

    log(f"Guardando CSV → {OUTPUT_CSV}")
    df.to_csv(OUTPUT_CSV, index=False)
    csv_size = OUTPUT_CSV.stat().st_size / (1024 * 1024)
    log(f"  Tamaño: {csv_size:.1f} MB")

    # --- Reporte de Sanidad ---
    section("REPORTE DE SANIDAD")

    print(f"\n  Shape final: {df.shape[0]:,} filas × {df.shape[1]} columnas")
    print(f"  ZCTAs únicos: {df['zcta'].nunique():,}")

    # Nulos por grupo
    print("\n  ── Nulos por grupo de columnas ──")

    for group_name, cols in [
        ("Geográficas", geo_cols),
        ("SDOH (valores)", [c for c in sdoh_cols if c.endswith("_value")]),
        ("SDOH (MOE)", [c for c in sdoh_cols if c.endswith("_moe")]),
        ("SDOH (confiabilidad)", [c for c in sdoh_cols if c.endswith("_moe_ratio") or c.endswith("_high_noise")]),
        ("PLACES (prevalencias)", places_prev_cols),
        ("PLACES (IC inferior)", [c for c in places_ic_cols if c.endswith("_ic_lower")]),
        ("PLACES (IC superior)", [c for c in places_ic_cols if c.endswith("_ic_upper")]),
    ]:
        if not cols:
            continue
        null_counts = df[cols].isna().sum()
        total_cells = len(df) * len(cols)
        total_nulls = null_counts.sum()
        pct = (total_nulls / total_cells * 100) if total_cells > 0 else 0
        print(f"    {group_name}: {total_nulls:,} nulos / {total_cells:,} celdas ({pct:.1f}%)")

        # Mostrar las columnas con más nulos
        worst = null_counts[null_counts > 0].sort_values(ascending=False).head(3)
        if len(worst) > 0:
            for col_name, cnt in worst.items():
                print(f"      → {col_name}: {cnt:,} ({cnt / len(df) * 100:.1f}%)")

    # High noise flags
    print("\n  ── Banderas de ruido alto (high_noise) ──")
    for measure_id in SDOH_MEASURE_IDS:
        flag_col = f"{measure_id}_high_noise"
        if flag_col in df.columns:
            n = df[flag_col].sum()
            print(f"    {measure_id}: {n:,} ZCTAs marcados ({n / len(df) * 100:.1f}%)")

    # Distribución geográfica
    print("\n  ── Distribución por Estado (top 10) ──")
    if "state_abbr" in df.columns:
        top_states = df["state_abbr"].value_counts().head(10)
        for st, cnt in top_states.items():
            print(f"    {st}: {cnt:,} ZCTAs")

    print(f"\n{'═' * 70}")
    print(f"  ✅ ETL completado exitosamente")
    print(f"  📁 Archivos generados:")
    print(f"     • {OUTPUT_PARQUET}")
    print(f"     • {OUTPUT_CSV}")
    print(f"{'═' * 70}\n")


# =====================================================================
# MAIN
# =====================================================================
def main() -> None:
    print(f"\n{'═' * 70}")
    print("  ETL ZCTA UNIFY — Limpieza y Unificación de Datasets")
    print(f"{'═' * 70}")

    # Verificar que los archivos existen
    for f in [SDOH_FILE, PLACES_FILE, COUNTY_FILE, STATES_FILE]:
        if not f.exists():
            print(f"  ✗ Archivo no encontrado: {f}")
            sys.exit(1)
        log(f"✓ {f.name} ({f.stat().st_size / (1024 * 1024):.1f} MB)")

    # Fase 1 — Carga
    sdoh, places, county, states = load_and_standardize()

    # Fase 2 — Limpieza de tipos
    sdoh, places = clean_data_types(sdoh, places)

    # Fase 3 — Pivoteo
    sdoh_wide = pivot_sdoh(sdoh)

    # Fase 4 — Confiabilidad
    sdoh_wide = add_reliability_metrics(sdoh_wide)

    # Fase 5 — Crosswalk
    county_xwalk = resolve_county_crosswalk(county)

    # Fase 6 — Estados
    county_xwalk = join_states(county_xwalk, states)

    # Fase 7 — Join final
    master = final_join(sdoh_wide, places, county_xwalk)

    # Fase 8 — Salida
    save_and_report(master)


if __name__ == "__main__":
    main()
