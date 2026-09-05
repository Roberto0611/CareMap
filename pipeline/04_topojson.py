#!/usr/bin/env python3
"""
04_topojson.py — Convierte el geojson a TopoJSON para que pese la mitad
=======================================================================

Entrada:  data/zcta_data.geojson                              (salida de 03)
Salida:   frontend/frontend/public/mapa/zcta_data.topojson    (lo que sirve la web)

Por qué TopoJSON
----------------
Los 33,790 ZCTAs son un mosaico: cada frontera entre dos zonas vecinas está
guardada DOS veces en un geojson, una por cada polígono. TopoJSON guarda cada
frontera una sola vez ("arco") y además cuantiza las coordenadas a enteros en
vez de decimales.

Medido sobre estos datos, tal como lo descarga un juez (comprimido):

    geojson    19.9 MB en disco  ->  4.72 MB comprimido
    topojson   10.0 MB en disco  ->  2.63 MB comprimido    <- 44% menos

Nota: simplificar más la geometría NO ayuda (se probó con varios epsilon y el
archivo se movía 0.01 MB). La geometría de origen ya viene simplificada, con
una mediana de 22 vértices por polígono. Todo el ahorro viene de la topología.

⏱ Este paso tarda ~3 minutos. Corre una sola vez, no en cada build.
"""

import gzip
import sys
import time
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001
    pass

ROOT = Path(__file__).resolve().parent.parent
GEO_IN = ROOT / "data" / "zcta_data.geojson"
TOPO_OUT = ROOT / "frontend" / "frontend" / "public" / "mapa" / "zcta_data.topojson"

# Cuantización: 1e5 divide el bounding box en 100,000 pasos.
# A escala de EE.UU. eso es ~0.6 m — imperceptible, y convierte cada
# coordenada en un entero corto en vez de un decimal largo.
QUANTIZE = 1e5


def log(msg: str) -> None:
    print(f"  ▸ {msg}")


def main() -> int:
    if not GEO_IN.exists():
        print(f"ERROR: falta {GEO_IN}. Corre 03_enrich_geojson.py primero.")
        return 1

    try:
        import topojson as tp
    except ImportError:
        print("ERROR: falta la dependencia.  pip install topojson")
        return 1

    import json

    raw = GEO_IN.read_bytes()
    log(f"entrada: {GEO_IN.name}  {len(raw) / 1e6:.1f} MB  "
        f"(gzip {len(gzip.compress(raw, 6)) / 1e6:.2f} MB)")

    geo = json.loads(raw)

    t0 = time.time()
    log("construyendo topología… (tarda ~3 min, es normal)")
    topo = tp.Topology(geo, prequantize=QUANTIZE, shared_coords=False)
    log(f"topología lista en {time.time() - t0:.0f} s")

    out = topo.to_json().encode("utf-8")
    TOPO_OUT.parent.mkdir(parents=True, exist_ok=True)
    TOPO_OUT.write_bytes(out)

    gz = len(gzip.compress(out, 6)) / 1e6
    log(f"salida:  {TOPO_OUT.name}  {len(out) / 1e6:.1f} MB  (gzip {gz:.2f} MB)")

    # Nombre del objeto dentro de la topología: el frontend lo necesita
    obj = json.loads(out).get("objects", {})
    log(f"objects: {list(obj.keys())}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
