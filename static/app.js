// 経県値マップ 2026 — フロント全部入り。
// キモ: ジオメトリ(静的)とユーザーの塗り(動的)を分離し、
//        塗りは「feature-state」でクライアント側だけで着色する。
//        背景地図・地理院ベクター(鉄道/高速)・自治体名は重ねるだけ。

const USER = new URLSearchParams(location.search).get("user") || "guest";
document.getElementById("user").textContent = USER;

// ---- ジオメトリ source: デモ(GeoJSON) か 本番(PMTiles) -----------------
const USE_PMTILES = false;
const PMTILES_URL = "cityarea.pmtiles";
const PMTILES_LAYER = "cities";
const GEOJSON_URL = "cityarea.geojson"; // 実際の市区町村境界(1894) / 生成: scripts/prep_geojson.py

if (USE_PMTILES) {
  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
}

// ---- 経県値の塗り分け(本家準拠) ----------------------------------------
//   5 居住=マゼンタ / 4 宿泊=赤 / 3 訪問=黄 / 2 接地=緑 / 1 通過=水色 / 0 未踏=透明(背景を透かす)
const LV_MAX = 5;
const fillColor = [
  "match", ["feature-state", "lv"],
  1, "#00ffff", 2, "#00cc00", 3, "#ffff00", 4, "#ff0000", 5, "#ff00ff",
  /* 0/未踏 */ "#ffffff",
];
// 未踏(lv0/未設定)は透明にして背景地図を見せる。塗り済みは a の不透明度。
const fillOpacityExpr = (a) => [
  "case", [">", ["coalesce", ["feature-state", "lv"], 0], 0], a, 0,
];

// ---- 地理院タイル(背景) -------------------------------------------------
const GSI = "https://cyberjapandata.gsi.go.jp/xyz";
const GSI_ATTR =
  "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>";
const BG_SOURCES = {
  pale: { type: "raster", tiles: [`${GSI}/pale/{z}/{x}/{y}.png`], tileSize: 256, attribution: GSI_ATTR },
  std: { type: "raster", tiles: [`${GSI}/std/{z}/{x}/{y}.png`], tileSize: 256, attribution: GSI_ATTR },
  photo: { type: "raster", tiles: [`${GSI}/seamlessphoto/{z}/{x}/{y}.jpg`], tileSize: 256, attribution: GSI_ATTR },
  blank: { type: "raster", tiles: [`${GSI}/blank/{z}/{x}/{y}.png`], tileSize: 256, minzoom: 5, maxzoom: 8, attribution: GSI_ATTR },
};

const map = new maplibregl.Map({
  container: "map",
  center: [137.5, 38.0],
  zoom: 4.2,
  doubleClickZoom: false, // 同じ区画を続けてクリックして lv を上げるため無効化
  attributionControl: false, // 下で compact 版を1つだけ付ける
  localIdeographFontFamily: "'Hiragino Sans','Noto Sans CJK JP',sans-serif",
  style: {
    version: 8,
    glyphs: "https://maps.gsi.go.jp/xyz/noto-jp/{fontstack}/{range}.pbf",
    sources: {
      // 地理院ベクトルタイル(鉄道/高速道路の重畳に使用)
      gsivec: { type: "vector", tiles: [`${GSI}/experimental_bvmap/{z}/{x}/{y}.pbf`], minzoom: 4, maxzoom: 16, attribution: GSI_ATTR },
    },
    layers: [{ id: "bg", type: "background", paint: { "background-color": "#ffffff" } }],
  },
});
map.addControl(new maplibregl.NavigationControl(), "top-right");
map.addControl(new maplibregl.AttributionControl({ compact: true }));

const paints = {}; // code -> lv (現在の状態 / 保存対象)
const SOURCE = "cities";
const SRC_LAYER = USE_PMTILES ? PMTILES_LAYER : undefined; // geojsonには無い
const srcLayer = SRC_LAYER ? { "source-layer": SRC_LAYER } : {};
let opacity = 1; // 塗りの不透明度(スライダー)

map.on("load", async () => {
  // 背景(地理院ラスター)を全部追加して可視を切り替える方式
  for (const [k, src] of Object.entries(BG_SOURCES)) {
    map.addSource("bg-" + k, src);
    map.addLayer({ id: "bg-" + k, type: "raster", source: "bg-" + k, layout: { visibility: "none" } });
  }

  // 経県値ポリゴン
  map.addSource(SOURCE, USE_PMTILES
    ? { type: "vector", url: "pmtiles://" + PMTILES_URL, promoteId: "code" }
    : { type: "geojson", data: GEOJSON_URL, promoteId: "code" });

  map.addLayer({
    id: "fill", type: "fill", source: SOURCE, ...srcLayer,
    paint: { "fill-color": fillColor, "fill-opacity": fillOpacityExpr(opacity) },
  });
  map.addLayer({
    id: "outline", type: "line", source: SOURCE, ...srcLayer,
    paint: { "line-color": "#888", "line-width": 0.4 },
  });

  // 地理院ベクター重畳(初期OFF)
  map.addLayer({
    id: "ovl-railway", type: "line", source: "gsivec", "source-layer": "railway",
    layout: { visibility: "none", "line-cap": "round" },
    paint: { "line-color": "#444", "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.6, 12, 1.6] },
  });
  map.addLayer({
    id: "ovl-highway", type: "line", source: "gsivec", "source-layer": "road",
    filter: ["==", "motorway", 1], // 高速道路
    layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#1b9e1b", "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1, 12, 3] },
  });

  // 自治体名ラベル(初期OFF) — 自前のpolygon重心に表示
  map.addLayer({
    id: "labels", type: "symbol", source: SOURCE, ...srcLayer,
    layout: {
      visibility: "none",
      "text-field": ["get", "name"],
      "text-font": ["NotoSansCJKjp-Regular"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 6, 10, 11, 14],
      "symbol-placement": "point",
    },
    paint: { "text-color": "#222", "text-halo-color": "#fff", "text-halo-width": 1.4 },
  });

  await loadUserData();
  setBackground(document.getElementById("bg").value);

  map.on("click", "fill", (e) => {
    const code = e.features[0].id; // promoteId により code が入る
    if (code == null) return;
    const lv = ((paints[code] || 0) + 1) % (LV_MAX + 1); // 0→1→…→5→0
    setLv(code, lv);
    updateScore();
  });
  map.on("mouseenter", "fill", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "fill", () => (map.getCanvas().style.cursor = ""));
});

function setLv(code, lv) {
  paints[code] = lv;
  map.setFeatureState({ source: SOURCE, ...(SRC_LAYER ? { sourceLayer: SRC_LAYER } : {}), id: code }, { lv });
}

function updateScore() {
  let s = 0;
  for (const c in paints) s += paints[c];
  document.getElementById("score").textContent = s;
}

async function loadUserData() {
  const res = await fetch(`/api/data?user=${encodeURIComponent(USER)}`);
  const data = await res.json();
  for (const code in data) setLv(code, data[code]);
  updateScore();
}

function setBackground(key) {
  for (const k of Object.keys(BG_SOURCES)) {
    map.setLayoutProperty("bg-" + k, "visibility", k === key ? "visible" : "none");
  }
}

// ---- UI 配線 -----------------------------------------------------------
document.getElementById("bg").addEventListener("change", (e) => setBackground(e.target.value));

document.getElementById("opacity").addEventListener("input", (e) => {
  opacity = e.target.value / 100;
  document.getElementById("opval").textContent = e.target.value + "%";
  if (map.getLayer("fill")) map.setPaintProperty("fill", "fill-opacity", fillOpacityExpr(opacity));
});

const toggle = (id, layer) =>
  document.getElementById(id).addEventListener("change", (e) =>
    map.setLayoutProperty(layer, "visibility", e.target.checked ? "visible" : "none"));
toggle("ov-rail", "ovl-railway");
toggle("ov-hw", "ovl-highway");
toggle("ov-label", "labels");

document.getElementById("save").addEventListener("click", async () => {
  const status = document.getElementById("status");
  status.textContent = "保存中…";
  const res = await fetch("/api/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: USER, paints }),
  });
  status.textContent = res.ok ? "保存しました" : "失敗";
  setTimeout(() => (status.textContent = ""), 2000);
});
