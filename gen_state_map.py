import pandas as pd
import json
from pathlib import Path

parquet = Path(__file__).parent / "data" / "zcta_master_analytical.parquet"
out     = Path(__file__).parent / "frontend" / "frontend" / "public" / "mapa" / "zcta_state_map.json"

df = pd.read_parquet(parquet, columns=["zcta", "state_abbr", "state_name"])

zcta_state = dict(zip(df["zcta"], df["state_abbr"].fillna("")))
state_names = (
    df.dropna(subset=["state_abbr"])
    .drop_duplicates("state_abbr")
    .set_index("state_abbr")["state_name"]
    .to_dict()
)

result = {"zcta_state": zcta_state, "state_names": state_names}

with open(out, "w") as f:
    json.dump(result, f, separators=(",", ":"))

size_kb = out.stat().st_size / 1024
print(f"Done. ZCTAs: {len(zcta_state):,} | States: {len(state_names)} | File: {size_kb:.0f} KB")
print("States found:", sorted(state_names.keys()))
