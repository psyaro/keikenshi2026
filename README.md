# 経県値マップ 2026 (最小構成)

旧 `keikenshi` を「静的タイル + クライアント塗り」に作り直した最小プロトタイプ。
PostGIS / geopandas / matplotlib / pandas / SQLAlchemy を排し、依存は **flask 1個**だけ。

## 考え方

| | 中身 | 扱い |
|---|---|---|
| ジオメトリ(市区町村境界) | 約1,700ポリゴン・**静的** | PMTiles に1回焼いて静的配信 |
| ユーザーの塗り | `code -> lv` の整数表・動的 | SQLite + 小さな JSON API |
| 着色 | lv に応じた色 | **ブラウザ側** feature-state で実施 |

サーバはタイルに色を焼かない。だから実行時に空間DBもPython地理スタックも不要。

## 構成

```
app.py              Flask 1ファイル (静的配信 + /api/data, /api/save)
static/
  index.html        画面
  app.js            MapLibre + feature-state 着色 + クリック編集 + 保存
  style.css
  sample.geojson    デモ用の疑似12区画(これで即動く)
  cityarea.pmtiles  本番タイル(build_pmtiles.sh で生成・gitignore)
scripts/
  build_pmtiles.sh  実境界 -> PMTiles 生成手順
data/keikenshi.db   SQLite (自動生成・gitignore)
```

## 動かす

```bash
pip install -r requirements.txt
python app.py
# http://127.0.0.1:5000/         (guest)
# http://127.0.0.1:5000/?user=foo (ユーザー指定)
```

区画をクリックで lv が 0→1→2→3→4→0 と循環。「保存」で SQLite に永続化。

## 本番(実データ)へ

1. 市区町村境界 GeoJSON を用意 (国土数値情報 / e-Stat、`code`・`name` 属性付き)
2. `cd scripts && ./build_pmtiles.sh path/to/cityarea.geojson`
3. `static/app.js` の `USE_PMTILES = true`

## 旧構成からの主な削減

- ❌ PostGIS / 動的 `ST_AsMVT` タイル生成 → 静的 PMTiles
- ❌ psycopg2 / SQLAlchemy / geopandas / matplotlib / pandas / numpy → 不要
- ❌ docker-compose の DB・external network・`time.sleep(5)` 待ち → 不要
- ❌ Twitter OAuth1(現状ほぼ動かない) → `?user=` の簡易識別に置換(認証は差し替え可能)

## 認証について

現状は `?user=` の素朴な識別のみ。必要なら OAuth2 / メールリンク / セッション等を
`app.py` の `user` 取得部分に差し込むだけで拡張できる(地図・タイルには影響しない)。
