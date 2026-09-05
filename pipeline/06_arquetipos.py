#!/usr/bin/env python3
"""
06_arquetipos.py — Estación ⑥: reducir 31,742 zonas a 6 perfiles
=================================================================

Entrada / salida:  data/zcta_scored.parquet   (agrega columnas)

Por qué
-------
Un director de salud no puede tomar 31,742 decisiones. Sí puede tomar 6.

Agrupando las zonas por su PERFIL (no por qué tan mal están), aparecen tipos
de comunidad que necesitan intervenciones distintas. El caso que lo demuestra:
"Pobreza concentrada" y "Barrera de acceso" tienen scores igual de malos, pero
la primera ya está enferma (necesita manejo de crónicos) y la segunda todavía
no puede entrar al sistema (necesita inscripción a seguro). Mandarles el mismo
programa es tirar el dinero.

Sobre los nombres
-----------------
K-means numera los grupos al azar, así que el grupo 3 de una corrida puede ser
el grupo 5 de la siguiente. Para que los nombres NO dependan de eso, cada
arquetipo se define por su perfil (qué lo distingue del promedio nacional) y se
asigna al grupo que mejor lo cumple. Así el nombre es reproducible.
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

N_GRUPOS = 6

# Dimensiones sobre las que se agrupa: contexto social + salud, en crudo.
EJES = {
    "pobreza": "POV150_value",
    "desempleo": "UNEMP_value",
    "sin_prepa": "NOHSDP_value",
    "hacinamiento": "CROWD_value",
    "monoparental": "SNGPNT_value",
    "sin_internet": "BROAD_value",
    "costo_vivienda": "HCOST_value",
    "mayores65": "AGE65_value",
    "sin_seguro": "ACCESS2_CrudePrev",
    "diabetes": "DIABETES_CrudePrev",
    "obesidad": "OBESITY_CrudePrev",
    "salud_mental": "MHLTH_CrudePrev",
    "tabaquismo": "CSMOKING_CrudePrev",
    "sin_chequeo": "CHECKUP_CrudePrev",
}

# Cada arquetipo se define por lo que lo hace distinto del promedio nacional,
# en desviaciones estándar. El signo importa: +2 = "mucho más que el promedio".
# Se asigna de forma greedy, del perfil más específico al más genérico.
PERFILES: list[tuple[str, dict[str, float], str]] = [
    ("Barrera de acceso",
     {"hacinamiento": 2.0, "sin_seguro": 2.0, "sin_prepa": 1.8},
     "Hacinamiento y falta de cobertura altísimos. Todavía no son los más "
     "enfermos, pero no pueden entrar al sistema de salud."),

    ("Pobreza concentrada",
     {"pobreza": 1.8, "diabetes": 1.5, "salud_mental": 1.5},
     "Pobreza extrema con carga crónica ya instalada. Aquí la enfermedad ya "
     "ocurrió: toca manejarla, no solo prevenirla."),

    ("Presión de vivienda",
     {"costo_vivienda": 0.9, "hacinamiento": 0.4, "monoparental": 0.3},
     "El costo de la vivienda ahoga, pero la salud todavía aguanta. Es una "
     "zona en riesgo de deteriorarse, no deteriorada."),

    ("Rural con riesgo conductual",
     {"tabaquismo": 0.9, "salud_mental": 0.7, "sin_internet": 0.5},
     "Tabaquismo y mala salud mental por encima del promedio. El problema "
     "está en conductas y aislamiento más que en ingreso."),

    ("Envejecida estable",
     {"mayores65": 0.6, "sin_chequeo": -0.4},
     "Población mayor pero conectada al sistema: sí se atiende. La carga es "
     "demográfica, no de acceso."),

    ("Acomodada",
     {"pobreza": -0.9, "sin_seguro": -0.8, "diabetes": -0.8},
     "Baja vulnerabilidad en todas las dimensiones. No es prioridad."),
]


def log(msg: str) -> None:
    print(f"  ▸ {msg}")


def section(title: str) -> None:
    print(f"\n{'─' * 70}\n  {title}\n{'─' * 70}")


def main() -> int:
    for p in (SCORED, MASTER):
        if not p.exists():
            print(f"ERROR: falta {p}. Corre los pasos anteriores primero.")
            return 1

    from sklearn.cluster import KMeans
    from sklearn.preprocessing import StandardScaler

    df = pd.read_parquet(SCORED).set_index("zcta")
    master = pd.read_parquet(MASTER).set_index("zcta")

    section(f"⑥ Arquetipos — {N_GRUPOS} perfiles de comunidad")

    ejes = {k: v for k, v in EJES.items() if v in master.columns}
    X = master[list(ejes.values())].rename(columns={v: k for k, v in ejes.items()})
    usable = X.dropna()
    log(f"agrupando {len(usable):,} zonas sobre {len(ejes)} dimensiones")

    scaler = StandardScaler().fit(usable)
    Z = scaler.transform(usable)
    km = KMeans(n_clusters=N_GRUPOS, random_state=0, n_init=10).fit(Z)

    # Centroide de cada grupo, en desviaciones estándar respecto al país
    centro = pd.DataFrame(km.cluster_centers_, columns=usable.columns)

    # Asignación greedy: el perfil más específico se queda con el grupo que
    # mejor lo cumple, y ese grupo ya no compite por los demás nombres.
    libres = set(range(N_GRUPOS))
    nombre_de: dict[int, str] = {}
    desc_de: dict[int, str] = {}
    for nombre, firma, desc in PERFILES:
        firma = {k: v for k, v in firma.items() if k in centro.columns}
        mejor, mejor_puntaje = None, -np.inf
        for g in libres:
            # qué tan bien el centroide del grupo sigue la firma esperada
            puntaje = sum(centro.loc[g, k] * np.sign(v) * abs(v) for k, v in firma.items())
            if puntaje > mejor_puntaje:
                mejor, mejor_puntaje = g, puntaje
        nombre_de[mejor] = nombre
        desc_de[mejor] = desc
        libres.discard(mejor)

    etiquetas = pd.Series(km.labels_, index=usable.index).map(nombre_de)
    df["arquetipo"] = etiquetas
    df["arquetipo_desc"] = pd.Series(km.labels_, index=usable.index).map(desc_de)

    # Reporte
    perfil = usable.copy()
    perfil["arquetipo"] = etiquetas
    resumen = perfil.groupby("arquetipo").mean()
    conteo = etiquetas.value_counts()

    log("")
    for nombre, _, _ in PERFILES:
        if nombre not in resumen.index:
            continue
        r = resumen.loc[nombre]
        log(f"{nombre}  —  {conteo[nombre]:,} zonas")
        log(f"     pobreza {r['pobreza']:.0f}%  ·  sin seguro {r['sin_seguro']:.0f}%  ·  "
            f"diabetes {r['diabetes']:.0f}%  ·  65+ {r['mayores65']:.0f}%  ·  "
            f"hacinamiento {r['hacinamiento']:.0f}%")

    sin = df["arquetipo"].isna().sum()
    if sin:
        log("")
        log(f"{sin:,} zonas sin arquetipo (les falta algún indicador)")

    df.reset_index().to_parquet(SCORED, index=False)
    log("")
    log(f"guardado en {SCORED.name}: arquetipo, arquetipo_desc")
    return 0


if __name__ == "__main__":
    sys.exit(main())
