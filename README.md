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

区画をクリックで lv が 0→1→2→3→4→5→0 と循環。「保存」で SQLite に永続化。

## ページ

| URL | 内容 |
|---|---|
| `/` | ランディング(紹介) |
| `/app` | 地図アプリ。未ログインは**ゲスト**、ログイン時は本人データ |
| `/login` | ログイン / 新規登録 |

## 機能

- **経県値の塗り分け**(本家準拠): 5居住=マゼンタ / 4宿泊=赤 / 3訪問=黄 / 2接地=緑 / 1通過=水色 / 0未踏=透明
- **背景地図の切替**: 地理院(淡色/標準/写真/白地図) / OpenStreetMap / CARTO Light・Dark / Esri 衛星写真 / OpenTopoMap / なし(白)
- **不透明度スライダー2本**: 背景地図 / 塗り(初期65%)を個別調整
- **境界の精細さ切替**: 標準(s0001・約1.5MB) / 高精細(s0010・約8.6MB)。切替時に塗りは保持
- **重畳トグル**: 鉄道(白casing＋濃紫破線で視認性確保)・高速道路(地理院ベクトル experimental_bvmap、**路線名/道路名ラベル付き**)、自治体名ラベル
- **ダウンロード**: CSV(code,name,lv,経県) / HTML(地図画像＋都道府県別＋市区町村一覧のレポート) / JPG(地図スナップショット)
- **CSVインポート**: 出力CSV、または `code,lv`(ヘッダ任意)を読み込んで塗りを復元
- **ログイン**: ユーザー登録・ログイン(Flaskセッション + パスワードハッシュ)。塗りはアカウント単位で保存
- **スマホ対応**: 設定パネルはボトムシート化(⚙ボタンで開閉)、レスポンシブUI
- 自前アセット(app.js / style.css)は `?v=` でキャッシュバスティング(変更時に番号を上げる)

> セッション署名鍵は本番で必ず環境変数 `SECRET_KEY` を設定すること(未設定時は開発用の固定値)。

## 依存とバージョン

再現性のため**全て固定**。更新時はテストして数字(と SRI)を上げる。

| 種別 | もの | バージョン | 固定方法 |
|---|---|---|---|
| Python | Flask | 3.1.1 (Python 3.11) | `requirements.txt` で `==` |
| フロント | maplibre-gl | 4.7.1 | CDN URL 固定 + SRI(`integrity`) |
| フロント | pmtiles | 3.2.1 | CDN URL 固定 + SRI |
| 地図タイル | 地理院タイル / ベクトル(experimental_bvmap) | ライブ提供 | URL 固定(地理院の運用に従う) |
| 境界データ | 国土数値情報 N03 (smartnews-smri/japan-topography 経由) | N03-21_210101 (**2021年版**) | `cityarea.geojson` をコミットして固定 |

- フロントの SRI ハッシュは `index.html` の `integrity=` に記載。CDN 差し替え/改ざんを検知する。
- 自前ビルドで CDN 依存を無くしたい場合は maplibre-gl / pmtiles を `static/vendor/` に同梱する手もある。

## GitHub Pages デモ（`docs/`）

サーバ無しで動く静的デモを `docs/` に同梱。Flask 版との違い:

- 保存は **localStorage（この端末のブラウザのみ・揮発しうる）**。ログイン機能なし。
- 揮発注意バナーを常時表示。記録の保管は **CSV / HTML / JPG ダウンロード**で。
- 共有カード（OGP / Twitter）用に `docs/og.png`（1200×630、`scripts/make_og.py` で生成）。

公開手順:
1. GitHub にリポジトリを作って push
2. Settings → Pages → Source = `main` / `/docs`
3. `docs/index.html` の OGP メタ内 `USERNAME` / `REPO` を公開URLに置換（`og:image`・`og:url` は絶対URL）

> Flask 版（`static/`）とデモ版（`docs/`）は別ビルド。デモ版の `app.js` は localStorage 保存・ログイン無しに差し替え済み。

## クレジット表示

各種データのクレジットは地図**右下**の attribution に集約。表示中のソースの分だけ自動で出る:
地理院タイル / OpenStreetMap / CARTO / Esri / OpenTopoMap（背景切替に追従）、
地理院ベクトル（鉄道・高速ON時）、**国土数値情報 N03（境界・常時）**。

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
