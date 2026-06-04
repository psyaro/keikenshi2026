# 経県値マップ 2026

全国1,894市区町村を「経県値」で塗り分けるWebアプリ。

## アーキテクチャ

```
Flask (app.py)          ← バックエンド・認証・データ保存
  └─ static/            ← フロントエンド一式
       ├─ index.html    ← 地図アプリ本体
       ├─ app.js        ← MapLibre GL JS + 全ロジック
       ├─ style.css
       ├─ landing.html  ← トップページ(/)
       ├─ login.html    ← 登録/ログイン
       └─ cityarea.geojson / cityarea_detail.geojson  ← 市区町村境界
docs/                   ← GitHub Pages 静的デモ(サーバ不要・localStorage)
  ├─ index.html / app.js / style.css  ← static/ とほぼ同内容
  └─ cityarea.geojson / cityarea_detail.geojson
scripts/
  ├─ prep_geojson.py   ← 国土数値情報N03 → cityarea.geojson 変換
  ├─ build_pmtiles.sh  ← PMTiles 生成(任意・高速化用)
  └─ make_og.py        ← OGP画像生成
```

## 経県値の段階

| lv | 名称 | 色 |
|----|------|----|
| 4  | 宿泊 | 赤 `#ff0000` |
| 3  | 訪問 | 黄 `#ffff00` |
| 2  | 接地 | 緑 `#00cc00` |
| 1  | 通過 | 水色 `#00ffff` |
| 0  | 未踏 | 透明 |

クリックで 0→1→2→3→4→0 と循環。`LV_MAX = 4`。

## 起動

```powershell
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
python app.py   # http://localhost:5000
```

## バックエンド (app.py)

- Flask 3.x / SQLite (`data/keikenshi.db`)
- 未ログインは `guest` ユーザーとして扱う
- 本番は環境変数 `SECRET_KEY` を必ず設定する
- API: `GET /api/me` / `POST /api/register` / `POST /api/login` / `POST /api/logout` / `GET /api/data` / `POST /api/save`

## フロントエンド (static/app.js)

- MapLibre GL JS 4.7 でレンダリング
- 塗りは feature-state で管理（ジオメトリと分離）
- 背景地図: 地理院タイル / OSM / CARTO / Esri など切替可
- 重ね合わせ: 地理院ベクトルタイルで鉄道・高速道路・自治体名
- `USE_PMTILES = false` を `true` にすると PMTiles 高速モード
- 自動保存: クリック後1秒のデバウンスで `/api/save` に送信
- ゲストはセッション内のみ（リロードで消える）

## 静的デモ (docs/)

- GitHub Pages でホスト (`psyaro.github.io/keikenshi2026`)
- 塗りは `localStorage` に保存（サーバ不要）
- `static/` と分離管理。変更時は両方に反映する。

## ジオメトリ更新

```powershell
# N03 GeoJSON を取得してから
python scripts/prep_geojson.py <入力.json> static/cityarea.geojson
# docs/ にもコピー
copy static\cityarea.geojson docs\cityarea.geojson
```
