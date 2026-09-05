#!/usr/bin/env python3
"""
03_enrich_geojson.py — Pega el score a la geometría
====================================================

Entrada:  data/zcta_simple.geojson                           (geometría cruda)
          data/zcta_scored.parquet                           (salida de 02_score.py)
Salida:   data/zcta_data.geojson  -> lo consume 04_topojson.py

Por qué así
-----------
El geojson original solo trae campos del shapefile del Census (ZCTA5CE20,
AFFGEOID20, ALAND20, AWATER20...). El mapa no puede colorear por vulnerabilidad
porque el dato simplemente no está ahí.

Para PINTAR el mapa solo hacen falta dos números por zona: el score y la
confiabilidad. Todo lo demás (condado, factores, indicadores) es para el panel
lateral, que muestra UNA zona a la vez — eso vive en zcta_scored.json y el
frontend lo busca por ZCTA al hacer click.

Meter los 20 campos en cada polígono infla el archivo de 25 a 37 MB para
mostrar texto que el 99.99% del tiempo no se ve. Por eso aquí solo van:
    ZCTA5CE20  el código (llave para buscar el resto)
    s          score 0-100, un decimal
    c          confiabilidad: 2=alta, 1=media, 0=baja, -1=sin datos
    r          residual: cuánto se desvía la salud real de la que predice
               el contexto social (+ = peor de lo esperado). null si la zona
               es muy chica para modelarla.

De paso se tiran los campos del shapefile que ya nadie usa y se recorta la
precisión de las coordenadas a 3 decimales (~110 m, de sobra a escala nacional).
"""

import json
import sys
from pathlib import Path

import pandas as pd

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001
    pass

ROOT = Path(__file__).resolve().parent.parent
GEO_IN = ROOT / "data" / "zcta_simple.geojson"
SCORED = ROOT / "data" / "zcta_scored.parquet"
GEO_OUT = ROOT / "data" / "zcta_data.geojson"

# Lo único que sobrevive de properties (además de lo que agregamos)


CONF_CODE = {"alta": 2, "media": 1, "baja": 0}

# Decimales de las coordenadas. 3 ≈ 110 m.
PRECISION = 3


def log(msg: str) -> None:
    print(f"  ▸ {msg}")


def main() -> int:
    for p in (GEO_IN, SCORED):
        if not p.exists():
            print(f"ERROR: falta {p}")
            return 1

    log(f"leyendo {GEO_IN.name} ({GEO_IN.stat().st_size / 1e6:.1f} MB)...")
    geo = json.loads(GEO_IN.read_text(encoding="utf-8"))

    df = pd.read_parquet(SCORED)
    data = {
        r.zcta: (
            round(float(r.score), 1),
            CONF_CODE.get(r.confiabilidad, -1),
            None if pd.isna(r.residual) else round(float(r.residual), 1),
        )
        for r in df.itertuples(index=False)
        if pd.notna(r.score)
    }
    log(f"{len(data):,} ZCTAs con score")

    def trim(coords):
        """Recorta la precisión, recorriendo la anidación de Polygon/MultiPolygon."""
        if isinstance(coords[0], (int, float)):
            return [round(c, PRECISION) for c in coords]
        return [trim(c) for c in coords]

    matched = 0
    sin_geom = 0
    # Algunos features del shapefile vienen sin geometría; no sirven en el mapa.
    features = []
    for f in geo["features"]:
        if not f.get("geometry") or not f["geometry"].get("coordinates"):
            sin_geom += 1
            continue
        features.append(f)

    for f in features:
        zcta = f["properties"].get("ZCTA5CE20")
        rec = data.get(zcta)
        props = {"ZCTA5CE20": zcta}
        if rec:
            props["s"], props["c"], props["r"] = rec
            matched += 1
        else:
            props["s"], props["c"], props["r"] = None, -1, None
        f["properties"] = props
        f["geometry"]["coordinates"] = trim(f["geometry"]["coordinates"])

    geo["features"] = features
    log(f"geometrías: {len(features):,}  (descartadas sin geometría: {sin_geom:,})")
    log(f"con datos:  {matched:,} ({matched / len(features) * 100:.1f}%)")
    log(f"sin datos:  {len(features) - matched:,}  (se pintan en gris)")

    GEO_OUT.write_text(
        json.dumps(geo, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    log(f"{GEO_OUT.name}  ({GEO_OUT.stat().st_size / 1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
