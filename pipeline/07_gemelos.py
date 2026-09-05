#!/usr/bin/env python3
"""
07_gemelos.py — Estación ⑦: el vecino de al lado con la realidad opuesta
========================================================================

Entrada / salida:  data/zcta_scored.parquet   (agrega columnas)
Salida extra:      data/gemelos_destacados.json  (los pares para el pitch)

Por qué
-------
Decir "Mississippi está peor que Massachusetts" no impresiona a nadie: son
estados distintos, otro clima, otra economía. La excusa fácil está ahí.

Decir "estos dos códigos postales están a 4 km y uno tiene 4 veces más
diabetes" no tiene excusa. Misma ciudad, mismo clima, mismo hospital a la
vuelta, mismo gobierno. Obliga a preguntar qué está pasando ahí — y esa
pregunta es el pitch entero.

Para cada zona se busca su vecino geográfico con MÁS contraste, así que
cualquier zona que el juez pique en el mapa ya trae su comparación lista.
"""

import json
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
MASTER = ROOT / "data" / "zcta_master_analytical.parquet"
DESTACADOS = ROOT / "data" / "gemelos_destacados.json"

RADIO_KM = 15        # "a un viaje corto en coche"
K_VECINOS = 8        # cuántos candidatos revisar por zona
RADIO_TIERRA_KM = 6371

# Para los pares DESTACADOS del pitch: zonas grandes y con dato confiable.
# Un par espectacular sobre pueblos de 500 habitantes es ruido, no hallazgo.
POB_MIN_DESTACADO = 5000


def log(msg: str) -> None:
    print(f"  ▸ {msg}")


def section(title: str) -> None:
    print(f"\n{'─' * 70}\n  {title}\n{'─' * 70}")


def main() -> int:
    if not SCORED.exists():
        print(f"ERROR: falta {SCORED}. Corre los pasos anteriores primero.")
        return 1

    from sklearn.neighbors import BallTree

    df = pd.read_parquet(SCORED).set_index("zcta")
    master = pd.read_parquet(MASTER).set_index("zcta")
    for c in ("latitude", "longitude"):
        if c not in df.columns:
            df[c] = master[c]

    section("⑦ Gemelos geográficos")

    base = df.dropna(subset=["latitude", "longitude", "score"])
    log(f"buscando vecinos de {len(base):,} zonas (radio {RADIO_KM} km)")

    coords = np.radians(base[["latitude", "longitude"]].to_numpy())
    tree = BallTree(coords, metric="haversine")
    dist, idx = tree.query(coords, k=min(K_VECINOS, len(base)))
    km = dist * RADIO_TIERRA_KM

    zctas = base.index.to_numpy()
    scores = base["score"].to_numpy()

    gemelo = np.full(len(base), None, dtype=object)
    brecha = np.zeros(len(base))
    distancia = np.full(len(base), np.nan)

    for i in range(len(base)):
        mejor_j, mejor_gap = None, 0.0
        for k in range(1, idx.shape[1]):          # 0 es la zona misma
            j = idx[i, k]
            if km[i, k] > RADIO_KM:
                break                              # BallTree ya viene ordenado
            gap = scores[i] - scores[j]            # positivo = yo estoy peor
            if abs(gap) > abs(mejor_gap):
                mejor_j, mejor_gap = k, gap
        if mejor_j is not None:
            gemelo[i] = zctas[idx[i, mejor_j]]
            brecha[i] = round(mejor_gap, 1)
            distancia[i] = round(km[i, mejor_j], 1)

    df["gemelo"] = pd.Series(gemelo, index=base.index)
    df["gemelo_brecha"] = pd.Series(brecha, index=base.index)
    df["gemelo_km"] = pd.Series(distancia, index=base.index)

    con = df["gemelo"].notna().sum()
    log(f"{con:,} zonas tienen gemelo a menos de {RADIO_KM} km "
        f"({con / len(df) * 100:.0f}%)")

    # ── Los pares para el pitch ───────────────────────────────────────
    grandes = df[
        (df["poblacion"] >= POB_MIN_DESTACADO)
        & (df["confiabilidad"] == "alta")
        & df["gemelo"].notna()
    ].copy()
    grandes = grandes[grandes["gemelo"].isin(grandes.index)]
    # el gemelo también debe ser grande y confiable
    grandes = grandes[
        grandes["gemelo"].map(df["poblacion"]) >= POB_MIN_DESTACADO
    ]

    top = grandes.nlargest(40, "gemelo_brecha")
    # un par sale una sola vez (A-B y B-A son el mismo par)
    vistos, destacados = set(), []
    for z, r in top.iterrows():
        par = frozenset((z, r["gemelo"]))
        if par in vistos:
            continue
        vistos.add(par)
        b = df.loc[r["gemelo"]]
        destacados.append({
            "a": z, "b": r["gemelo"],
            "km": r["gemelo_km"],
            "ciudad": f"{r['county_name']}, {r['state_abbr']}",
            "score_a": r["score"], "score_b": b["score"],
            "pobreza_a": r.get("POV150_value"), "pobreza_b": b.get("POV150_value"),
            "diabetes_a": r.get("DIABETES_CrudePrev"), "diabetes_b": b.get("DIABETES_CrudePrev"),
            "sin_seguro_a": r.get("ACCESS2_CrudePrev"), "sin_seguro_b": b.get("ACCESS2_CrudePrev"),
            "mayores65_a": master.loc[z, "AGE65_value"] if z in master.index else None,
            "mayores65_b": master.loc[r["gemelo"], "AGE65_value"] if r["gemelo"] in master.index else None,
        })

    log("")
    log("pares con más contraste (zonas grandes, dato confiable):")
    for d in destacados[:8]:
        log(f"   {d['a']} vs {d['b']}  ·  {d['km']} km  ·  {d['ciudad']}")
        log(f"      score {d['score_a']:.0f} vs {d['score_b']:.0f}  |  "
            f"diabetes {d['diabetes_a']:.1f}% vs {d['diabetes_b']:.1f}%  |  "
            f"65+ {d['mayores65_a']:.0f}% vs {d['mayores65_b']:.0f}%")

    log("")
    log("⚠ Antes de llevar un par al pitch, revisa la fila '65+'. Si una de las")
    log("  dos zonas tiene casi cero población mayor, probablemente sea una base")
    log("  militar o un campus: la zona se ve sana solo porque es gente joven,")
    log("  y un juez lo tumba en preguntas.")

    DESTACADOS.write_text(
        json.dumps(destacados[:20], ensure_ascii=False, indent=2, default=float),
        encoding="utf-8",
    )

    df.reset_index().to_parquet(SCORED, index=False)
    log("")
    log(f"guardado en {SCORED.name}: gemelo, gemelo_brecha, gemelo_km")
    log(f"guardado en {DESTACADOS.name}: {len(destacados[:20])} pares para el pitch")
    return 0


if __name__ == "__main__":
    sys.exit(main())
