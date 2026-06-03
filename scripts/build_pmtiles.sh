#!/usr/bin/env bash
# 本番タイル生成: 市区町村境界(GeoJSON) -> 静的 PMTiles を「1回だけ」作る。
# 以降このファイルを static/ に置くだけで配信完了。実行時に DB は不要。
#
# 必要: tippecanoe (https://github.com/felt/tippecanoe)
#
# 入力 GeoJSON の取得元(例):
#   - 国土数値情報「行政区域」 https://nlftp.mlit.go.jp/ksj/
#   - e-Stat 境界データ      https://www.e-stat.go.jp/gis
#   各 feature に市区町村コード(例: 5桁の `code`)と `name` プロパティを持たせる。
#
# 注意: feature の属性名は app.js の promoteId と一致させること(ここでは `code`)。
set -euo pipefail

SRC="${1:-cityarea.geojson}"            # 入力 GeoJSON
OUT="../static/cityarea.pmtiles"        # 出力(配信先)

tippecanoe \
  -o "$OUT" \
  --force \
  -l cities \
  -zg \
  --coalesce-densest-as-needed \
  --drop-densest-as-needed \
  --simplification=4 \
  -y code -y name \
  "$SRC"

echo "done -> $OUT"
echo "次に static/app.js の USE_PMTILES を true にする。"
