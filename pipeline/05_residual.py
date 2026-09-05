#!/usr/bin/env python3
"""
05_residual.py — Estación ⑤: ¿peor o mejor de lo que su contexto predice?
=========================================================================

Entrada / salida:  data/zcta_scored.parquet   (agrega columnas)

La idea
-------
Se entrena un modelo que predice la SALUD de una zona usando SOLO su contexto
social (pobreza, desempleo, escolaridad, hacinamiento...). Nada de datos médicos.

Lo que el modelo acierta ya se sabía: donde hay pobreza hay mala salud.
Lo interesante es donde FALLA:

  residual = salud real − salud que el modelo esperaba

  · residual ALTO  -> la zona está PEOR de lo que su contexto explica.
    Algo puntual está fallando ahí, y lo puntual se arregla. Es donde una
    intervención rinde más, porque no estás peleando contra la pobreza
    estructural sino contra una falla local.

  · residual BAJO  -> la zona está MEJOR de lo esperado. Aguanta a pesar de
    todo. Ahí hay que ir a ver qué están haciendo bien y copiarlo.
    (En salud pública a esto se le llama "positive deviance".)

⚠️ VALIDACIÓN CRUZADA OBLIGATORIA
Sin ella, el modelo predice zonas que ya vio al entrenar, hace trampa sin
querer, y los residuales salen artificialmente chicos. Con cross_val_predict,
cada zona la predice un modelo que NO la conoce.
"""

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

# Los 9 indicadores sociales, en crudo. El modelo NO ve ningún dato de salud.
SOCIAL = [
    "POV150", "UNEMP", "NOHSDP", "CROWD", "SNGPNT",
    "BROAD", "HCOST", "REMNRTY", "AGE65",
]

# Zonas chicas tienen estimaciones tan ruidosas que el "residual" sería ruido,
# no hallazgo. Se entrena y se reporta solo sobre zonas con población real.
MIN_POB = 1000


def log(msg: str) -> None:
    print(f"  ▸ {msg}")


def section(title: str) -> None:
    print(f"\n{'─' * 70}\n  {title}\n{'─' * 70}")


def main() -> int:
    for p in (SCORED, MASTER):
        if not p.exists():
            print(f"ERROR: falta {p}. Corre los pasos anteriores primero.")
            return 1

    from sklearn.ensemble import GradientBoostingRegressor
    from sklearn.model_selection import cross_val_predict
    from sklearn.metrics import r2_score

    df = pd.read_parquet(SCORED)
    master = pd.read_parquet(MASTER)

    feats = [f"{m}_value" for m in SOCIAL]
    df = df.set_index("zcta")
    # Solo se borran al final las que este script trajo prestadas: algunas
    # (POV150_value) ya venían de 02 y el panel las usa.
    prestadas = [c for c in feats if c not in df.columns]
    df[feats] = master.set_index("zcta")[feats]

    section("⑤ Residual — lo social explica la salud, ¿y lo que no?")

    usable = df.dropna(subset=feats + ["score_salud"])
    usable = usable[usable["poblacion"] >= MIN_POB]
    log(f"entrenando con {len(usable):,} zonas de {MIN_POB:,}+ habitantes")

    X = usable[feats].to_numpy()
    y = usable["score_salud"].to_numpy()

    modelo = GradientBoostingRegressor(random_state=0, n_estimators=200, max_depth=3)
    pred = cross_val_predict(modelo, X, y, cv=5)   # <- cada zona la predice un modelo que no la vio

    r2 = r2_score(y, pred)
    log(f"R² (validación cruzada 5-fold) = {r2:.3f}")
    log(f"→ el contexto social explica el {r2 * 100:.0f}% de la variación en salud")

    df["salud_esperada"] = np.nan
    df["residual"] = np.nan
    df.loc[usable.index, "salud_esperada"] = pred.round(1)
    df.loc[usable.index, "residual"] = (y - pred).round(1)

    # Chequeo de confusor: si las zonas "mejor de lo esperado" fueran simplemente
    # más jóvenes, el hallazgo sería un artefacto de edad y no un hallazgo.
    peor = df.nlargest(300, "residual")
    mejor = df.nsmallest(300, "residual")
    log("")
    log("chequeo de confusor — % de población 65+:")
    log(f"   peor de lo esperado : {peor['AGE65_value'].mean():.1f}")
    log(f"   nacional            : {df['AGE65_value'].mean():.1f}")
    log(f"   mejor de lo esperado: {mejor['AGE65_value'].mean():.1f}")
    if abs(peor["AGE65_value"].mean() - mejor["AGE65_value"].mean()) > 3:
        log("   ⚠ diferencia >3 puntos: el residual podría estar capturando edad")
    else:
        log("   ✔ sin sesgo de edad apreciable")

    conf = df[df["confiabilidad"] == "alta"]
    log("")
    log("PEOR de lo esperado (confiabilidad alta) — donde el dinero rinde más:")
    for z, r in conf.nlargest(5, "residual").iterrows():
        log(f"   {z}  {r['county_name']}, {r['state_abbr']}  "
            f"esperado {r['salud_esperada']:.0f} → real {r['score_salud']:.0f}  "
            f"(+{r['residual']:.0f})")

    log("")
    log("MEJOR de lo esperado (confiabilidad alta) — qué están haciendo bien:")
    for z, r in conf.nsmallest(5, "residual").iterrows():
        log(f"   {z}  {r['county_name']}, {r['state_abbr']}  "
            f"esperado {r['salud_esperada']:.0f} → real {r['score_salud']:.0f}  "
            f"({r['residual']:.0f})")

    df.drop(columns=prestadas).reset_index().to_parquet(SCORED, index=False)
    log("")
    log(f"guardado en {SCORED.name}: salud_esperada, residual")
    return 0


if __name__ == "__main__":
    sys.exit(main())
