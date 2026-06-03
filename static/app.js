// 経県値マップ 2026 — フロント全部入り。
// キモ: ジオメトリ(静的)とユーザーの塗り(動的)を分離し、
//        塗りは「feature-state」でクライアント側だけで着色する。
//        → サーバはタイルに色を焼かない。PostGIS も pandas も要らない。

const USER = new URLSearchParams(location.search).get("user") || "guest";
document.getElementById("user").textContent = USER;

// ---- 設定: デモ(GeoJSON) か 本番(PMTiles) か --------------------------
// 本番では tippecanoe で static/cityarea.pmtiles を生成し、true にする。
// (生成手順は scripts/build_pmtiles.sh)
const USE_PMTILES = false;
const PMTILES_URL = "cityarea.pmtiles"; // static/ 配下
const PMTILES_LAYER = "cities";          // tippecanoe -l で付けたレイヤ名
const GEOJSON_URL = "sample.geojson";    // デモ用の数区画

if (USE_PMTILES) {
  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
}

// lv -> 色 (0/未塗りは薄いグレー)
const LV_COLORS = ["#08306b", "#2171b5", "#6baed6", "#c6dbef"]; // lv4..1
const fillColor = [
  "match", ["feature-state", "lv"],
  1, "#c6dbef",
  2, "#6baed6",
  3, "#2171b5",
  4, "#08306b",
  /* default */ "#e8e8e8",
];

const map = new maplibregl.Map({
  container: "map",
  center: [138.5, 37.0],
  zoom: 4.3,
  style: {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors",
      },
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }],
  },
});

const paints = {}; // code -> lv (現在の状態 / 保存対象)
const SOURCE = "cities";
const SRC_LAYER = USE_PMTILES ? PMTILES_LAYER : undefined; // geojsonには無い

map.on("load", async () => {
  if (USE_PMTILES) {
    map.addSource(SOURCE, {
      type: "vector",
      url: "pmtiles://" + PMTILES_URL,
      promoteId: "code", // featureのidを code に昇格 → feature-stateのキーに使える
    });
  } else {
    map.addSource(SOURCE, {
      type: "geojson",
      data: GEOJSON_URL,
      promoteId: "code",
    });
  }

  map.addLayer({
    id: "fill",
    type: "fill",
    source: SOURCE,
    ...(SRC_LAYER ? { "source-layer": SRC_LAYER } : {}),
    paint: { "fill-color": fillColor, "fill-opacity": 0.75 },
  });
  map.addLayer({
    id: "outline",
    type: "line",
    source: SOURCE,
    ...(SRC_LAYER ? { "source-layer": SRC_LAYER } : {}),
    paint: { "line-color": "#555", "line-width": 0.5 },
  });

  await loadUserData();

  map.on("click", "fill", (e) => {
    const code = e.features[0].id; // promoteId により code が入る
    if (code == null) return;
    const lv = ((paints[code] || 0) + 1) % 5;
    setLv(code, lv);
    updateScore();
  });
  map.on("mouseenter", "fill", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "fill", () => (map.getCanvas().style.cursor = ""));
});

function setLv(code, lv) {
  paints[code] = lv;
  map.setFeatureState(
    { source: SOURCE, ...(SRC_LAYER ? { sourceLayer: SRC_LAYER } : {}), id: code },
    { lv }
  );
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
