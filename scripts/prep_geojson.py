"""国土数値情報(N03)の市区町村GeoJSONを、本アプリ用の軽量GeoJSONへ変換する.

入力: smartnews-smri/japan-topography の N03 GeoJSON
出力: static/cityarea.geojson  (プロパティは code / name のみ・圧縮)

取得元(例):
  https://raw.githubusercontent.com/smartnews-smri/japan-topography/main/\
data/municipality/geojson/s0001/N03-21_210101.json

  N03_007 = 行政区域コード(5桁)   -> code
  N03_003 = 郡/政令市名(任意)      \ 連結して name
  N03_004 = 市区町村名             /
"""
import json
import pathlib
import sys

BASE = pathlib.Path(__file__).resolve().parent.parent
SRC = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else BASE / "static" / "municipalities_raw.json"
OUT = BASE / "static" / "cityarea.geojson"


def main():
    src = json.load(open(SRC, encoding="utf-8"))
    out_features = []
    for f in src["features"]:
        p = f["properties"]
        code = p.get("N03_007")
        if not code:  # 所属未定地などコード無しは除外
            continue
        name = (p.get("N03_003") or "") + (p.get("N03_004") or "")
        if not name:
            name = p.get("N03_001") or code
        out_features.append({
            "type": "Feature",
            "properties": {"code": code, "name": name},
            "geometry": f["geometry"],
        })
    fc = {"type": "FeatureCollection", "features": out_features}
    # 区切りを詰めてサイズ削減
    json.dump(fc, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    codes = {f["properties"]["code"] for f in out_features}
    print(f"features={len(out_features)} unique_codes={len(codes)} -> {OUT}")


if __name__ == "__main__":
    main()
