#!/usr/bin/env python3
"""
08_export_web.py — Empaqueta la tabla final para el frontend
=============================================================

Entrada:  data/zcta_scored.parquet
Salida:   frontend/frontend/public/datos/zcta_scored.json

Formato columnar con textos "interned"
--------------------------------------
En vez de repetir la palabra "Massachusetts" 800 veces y el nombre de cada
columna 31,742 veces, se guarda:

    columns  -> los nombres, una vez
    lookups  -> por cada columna de texto, la lista de valores únicos
    rows     -> por ZCTA, un arreglo de valores (los textos son índices)

Medido: baja de ~18 MB a ~3.5 MB en disco, ~1.1 MB comprimido, que es lo que
realmente descarga el juez. El frontend lo desempaqueta en un bucle de 8 líneas.
"""

import gzip
import json
import shutil
import sys
from pathlib import Path

import numpy as np
import pandas as pd

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001
    pass

ROOT = Path(__file__).resolve().parent.parent
SCORED = ROOT / "data" / "zcta_scored.parquet"
GEMELOS = ROOT / "data" / "gemelos_destacados.json"
PUBLIC = ROOT / "frontend" / "frontend" / "public" / "datos"
OUT_JSON = PUBLIC / "zcta_scored.json"

# Lo que necesita el panel. Las coordenadas van porque el asignador las usa
# para separar geográficamente las zonas elegidas (evitar 8 unidades en el
# mismo barrio); el mapa no las necesita, ya vienen en la geometría.
CAMPOS = [
    "latitude", "longitude",
    "county_name", "state_abbr", "state_name", "poblacion",
    "score", "score_social", "score_salud", "confiabilidad",
    "factor1", "factor1_pct", "factor1_detalle",
    "t_socioeco", "t_vivienda", "t_acceso", "t_enfermedad", "t_conductas",
    "salud_esperada", "residual",
    "arquetipo", "arquetipo_desc",
    "gemelo", "gemelo_brecha", "gemelo_km",
    "POV150_value", "ACCESS2_CrudePrev", "DIABETES_CrudePrev",
    "OBESITY_CrudePrev", "MHLTH_CrudePrev", "CSMOKING_CrudePrev",
]


def log(msg: str) -> None:
    print(f"  ▸ {msg}")


def main() -> int:
    if not SCORED.exists():
        print(f"ERROR: falta {SCORED}. Corre 02..07 primero.")
        return 1

    df = pd.read_parquet(SCORED)
    faltan = [c for c in CAMPOS if c not in df.columns]
    if faltan:
        log(f"⚠ faltan columnas (¿saltaste un paso?): {faltan}")

    cols = [c for c in CAMPOS if c in df.columns]
    web = df[["zcta"] + cols].copy()

    # "gemelo" es un código ZCTA, no una categoría: se queda como texto crudo
    str_cols = [
        c for c in cols
        if web[c].dtype == object and c != "gemelo"
    ]
    lookups: dict[str, list] = {}
    for c in str_cols:
        vals = sorted(v for v in web[c].dropna().unique())
        lookups[c] = vals
        idx = {v: i for i, v in enumerate(vals)}
        web[c] = web[c].map(lambda v: idx.get(v, -1) if pd.notna(v) else -1)

    rows = {
        z: [
            None if (isinstance(v, float) and pd.isna(v)) or v is None
            else (int(v) if isinstance(v, (bool, np.integer)) else v)
            for v in vals
        ]
        for z, *vals in web[["zcta"] + cols].itertuples(index=False)
    }

    payload = {"columns": cols, "lookups": lookups, "rows": rows}
    if GEMELOS.exists():
        payload["gemelos_destacados"] = json.loads(GEMELOS.read_text(encoding="utf-8"))

    PUBLIC.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    OUT_JSON.write_bytes(raw)

    log(f"{len(rows):,} zonas × {len(cols)} campos")
    log(f"{OUT_JSON.relative_to(ROOT)}  {len(raw) / 1e6:.1f} MB  "
        f"(gzip {len(gzip.compress(raw, 6)) / 1e6:.2f} MB ← lo que baja el juez)")

    # Copia de respaldo junto al resto de derivados
    shutil.copy(OUT_JSON, ROOT / "data" / "zcta_scored.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
