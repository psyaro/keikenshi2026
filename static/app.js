// 経県値マップ 2026 — フロント全部入り。
// キモ: ジオメトリ(静的)とユーザーの塗り(動的)を分離し、
//        塗りは「feature-state」でクライアント側だけで着色する。
//        背景地図・地理院ベクター(鉄道/高速)・自治体名は重ねるだけ。

// ---- ジオメトリ source: デモ(GeoJSON) か 本番(PMTiles) -----------------
const USE_PMTILES = false;
const PMTILES_URL = "cityarea.pmtiles";
const PMTILES_LAYER = "cities";
const GEOJSON_URL = "cityarea.geojson"; // 実際の市区町村境界(1894) / 生成: scripts/prep_geojson.py

if (USE_PMTILES) {
  const protocol = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
}

// ---- 経県値の段階(本家準拠) --------------------------------------------
const LV_MAX = 5;
const LV_NAME = { 1: "通過", 2: "接地", 3: "訪問", 4: "宿泊", 5: "居住" };
const LV_HEX = { 1: "#00ffff", 2: "#00cc00", 3: "#ffff00", 4: "#ff0000", 5: "#ff00ff" };
const PREFS = ("北海道,青森県,岩手県,宮城県,秋田県,山形県,福島県,茨城県,栃木県,群馬県,埼玉県,千葉県,東京都,神奈川県,新潟県,富山県,石川県,福井県,山梨県,長野県,岐阜県,静岡県,愛知県,三重県,滋賀県,京都府,大阪府,兵庫県,奈良県,和歌山県,鳥取県,島根県,岡山県,広島県,山口県,徳島県,香川県,愛媛県,高知県,福岡県,佐賀県,長崎県,熊本県,大分県,宮崎県,鹿児島県,沖縄県").split(",");

const fillColor = [
  "match", ["feature-state", "lv"],
  1, LV_HEX[1], 2, LV_HEX[2], 3, LV_HEX[3], 4, LV_HEX[4], 5, LV_HEX[5],
  /* 0/未踏 */ "#ffffff",
];
// 未踏(lv0/未設定)は透明、塗り済みは a の不透明度。
const fillOpacityExpr = (a) => ["case", [">", ["coalesce", ["feature-state", "lv"], 0], 0], a, 0];

// ---- 背景タイル ---------------------------------------------------------
const GSI = "https://cyberjapandata.gsi.go.jp/xyz";
const GSI_ATTR = "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>地理院タイル</a>";
const OSM_ATTR = "© <a href='https://www.openstreetmap.org/copyright' target='_blank'>OpenStreetMap</a> contributors";
const r = (tiles, attribution, extra = {}) => ({ type: "raster", tiles, tileSize: 256, attribution, ...extra });
const BG_SOURCES = {
  pale: r([`${GSI}/pale/{z}/{x}/{y}.png`], GSI_ATTR),
  std: r([`${GSI}/std/{z}/{x}/{y}.png`], GSI_ATTR),
  photo: r([`${GSI}/seamlessphoto/{z}/{x}/{y}.jpg`], GSI_ATTR),
  blank: r([`${GSI}/blank/{z}/{x}/{y}.png`], GSI_ATTR, { minzoom: 5, maxzoom: 8 }),
  osm: r(["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], OSM_ATTR),
  carto_light: r(["https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"], OSM_ATTR + " © CARTO"),
  carto_dark: r(["https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"], OSM_ATTR + " © CARTO"),
  esri_photo: r(["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], "Tiles © Esri"),
  otopo: r(["https://a.tile.opentopomap.org/{z}/{x}/{y}.png"], "© OpenTopoMap (CC-BY-SA)"),
};

const map = new maplibregl.Map({
  container: "map",
  center: [137.5, 38.0],
  zoom: 4.2,
  doubleClickZoom: false,
  attributionControl: false,
  preserveDrawingBuffer: true, // JPG 書き出しに必要
  localIdeographFontFamily: "'Hiragino Sans','Noto Sans CJK JP',sans-serif",
  style: {
    version: 8,
    glyphs: "https://maps.gsi.go.jp/xyz/noto-jp/{fontstack}/{range}.pbf",
    sources: {
      gsivec: { type: "vector", tiles: [`${GSI}/experimental_bvmap/{z}/{x}/{y}.pbf`], minzoom: 4, maxzoom: 16, attribution: GSI_ATTR },
    },
    layers: [{ id: "bg", type: "background", paint: { "background-color": "#ffffff" } }],
  },
});
map.addControl(new maplibregl.NavigationControl(), "top-right");
// クレジット(地理院/OSM/CARTO/Esri等)はすべて左下にまとめる
map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");

const paints = {};       // code -> lv
const names = {};        // code -> 市区町村名
const SOURCE = "cities";
const SRC_LAYER = USE_PMTILES ? PMTILES_LAYER : undefined;
const srcLayer = SRC_LAYER ? { "source-layer": SRC_LAYER } : {};
let bgOpacity = 1;
let fillOpacity = 0.65;

map.on("load", async () => {
  for (const [k, src] of Object.entries(BG_SOURCES)) {
    map.addSource("bg-" + k, src);
    map.addLayer({ id: "bg-" + k, type: "raster", source: "bg-" + k, layout: { visibility: "none" } });
  }

  map.addSource(SOURCE, USE_PMTILES
    ? { type: "vector", url: "pmtiles://" + PMTILES_URL, promoteId: "code" }
    : { type: "geojson", data: GEOJSON_URL, promoteId: "code" });

  map.addLayer({
    id: "fill", type: "fill", source: SOURCE, ...srcLayer,
    paint: { "fill-color": fillColor, "fill-opacity": fillOpacityExpr(fillOpacity) },
  });
  map.addLayer({
    id: "outline", type: "line", source: SOURCE, ...srcLayer,
    paint: { "line-color": "#555", "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 8, 1.4, 12, 2.5] },
  });

  // 地理院ベクター重畳(初期OFF) — 線 + 名称ラベル
  // 鉄道は「白casing + 濃色破線」でどの塗り色の上でも視認できるようにする
  map.addLayer({
    id: "ovl-railway-case", type: "line", source: "gsivec", "source-layer": "railway",
    layout: { visibility: "none", "line-cap": "round" },
    paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 6, 2.2, 12, 4.6] },
  });
  map.addLayer({
    id: "ovl-railway", type: "line", source: "gsivec", "source-layer": "railway",
    layout: { visibility: "none", "line-cap": "round" },
    paint: {
      "line-color": "#b5402a", // 赤茶(細い白縁取りで視認性確保)
      "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1.0, 12, 3.0],
    },
  });
  map.addLayer({
    id: "ovl-railway-label", type: "symbol", source: "gsivec", "source-layer": "railway", minzoom: 9,
    layout: { visibility: "none", "symbol-placement": "line", "text-field": ["get", "name"], "text-font": ["NotoSansCJKjp-Regular"], "text-size": 11 },
    paint: { "text-color": "#333", "text-halo-color": "#fff", "text-halo-width": 1.4 },
  });
  map.addLayer({
    id: "ovl-highway", type: "line", source: "gsivec", "source-layer": "road", filter: ["==", "motorway", 1],
    layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#1b9e1b", "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1, 12, 3] },
  });
  map.addLayer({
    id: "ovl-highway-label", type: "symbol", source: "gsivec", "source-layer": "road", filter: ["==", "motorway", 1], minzoom: 9,
    layout: { visibility: "none", "symbol-placement": "line", "text-field": ["get", "name"], "text-font": ["NotoSansCJKjp-Regular"], "text-size": 11 },
    paint: { "text-color": "#1b6e1b", "text-halo-color": "#fff", "text-halo-width": 1.4 },
  });

  // 自治体名ラベル(初期OFF)
  map.addLayer({
    id: "labels", type: "symbol", source: SOURCE, ...srcLayer,
    layout: {
      visibility: "none", "text-field": ["get", "name"], "text-font": ["NotoSansCJKjp-Regular"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 6, 10, 11, 14], "symbol-placement": "point",
    },
    paint: { "text-color": "#222", "text-halo-color": "#fff", "text-halo-width": 1.4 },
  });

  loadNames();
  await loadUserData();
  setBackground(document.getElementById("bg").value);

  map.on("click", "fill", (e) => {
    const code = e.features[0].id;
    if (code == null) return;
    setLv(code, ((paints[code] || 0) + 1) % (LV_MAX + 1));
    updateScore();
    scheduleSave();
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
  const data = await (await fetch("/api/data")).json();
  for (const code in data) setLv(code, data[code]);
  updateScore();
}
async function loadNames(url = GEOJSON_URL) {
  try {
    const gj = await (await fetch(url)).json();
    for (const f of gj.features) names[f.properties.code] = f.properties.name;
  } catch (_) {}
}

// 境界の精細さ切替(geojson source のみ)。データ差し替え後に塗りを貼り直す。
const BOUNDARY_URL = { std: GEOJSON_URL, detail: "cityarea_detail.geojson" };
function setBoundary(key) {
  const url = BOUNDARY_URL[key] || GEOJSON_URL;
  const src = map.getSource(SOURCE);
  if (!src || !src.setData) return; // PMTilesでは無効
  src.setData(url);
  const reapply = (e) => {
    if (e.sourceId === SOURCE && map.isSourceLoaded(SOURCE)) {
      map.off("sourcedata", reapply);
      for (const c in paints) if (paints[c] > 0) setLv(c, paints[c]);
    }
  };
  map.on("sourcedata", reapply);
  loadNames(url);
}
function setBackground(key) {
  for (const k of Object.keys(BG_SOURCES)) map.setLayoutProperty("bg-" + k, "visibility", k === key ? "visible" : "none");
  applyBgOpacity();
}
function applyBgOpacity() {
  for (const k of Object.keys(BG_SOURCES)) if (map.getLayer("bg-" + k)) map.setPaintProperty("bg-" + k, "raster-opacity", bgOpacity);
}

// ---- アカウント表示 -----------------------------------------------------
(async function renderAccount() {
  let me = { user: "guest", authed: false };
  try { me = await (await fetch("/api/me")).json(); } catch (_) {}
  const who = document.getElementById("whoami");
  const acc = document.getElementById("account");
  const panelAcc = document.getElementById("panel-account");
  if (me.authed) {
    who.innerHTML = `<b>${escapeHtml(me.user)}</b> さん`;
    acc.innerHTML = `<button id="logout" class="btn ghost sm">ログアウト</button>`;
    document.getElementById("logout").onclick = async () => {
      await fetch("/api/logout", { method: "POST" });
      location.reload();
    };
    panelAcc.innerHTML = `<b>${escapeHtml(me.user)}</b> でログイン中（アカウントに保存）`;
  } else {
    who.textContent = "ゲスト";
    acc.innerHTML = `<a class="btn sm" href="/login">ログイン</a>`;
    panelAcc.innerHTML = `今はゲストです。自分の記録として残すには <a href="/login">ログイン / 新規登録 →</a>`;
  }
})();

// ---- UI 配線 -----------------------------------------------------------
document.getElementById("bg").addEventListener("change", (e) => setBackground(e.target.value));
document.getElementById("bgopacity").addEventListener("input", (e) => {
  bgOpacity = e.target.value / 100;
  document.getElementById("bgopval").textContent = e.target.value + "%";
  applyBgOpacity();
});
document.getElementById("fillopacity").addEventListener("input", (e) => {
  fillOpacity = e.target.value / 100;
  document.getElementById("fillopval").textContent = e.target.value + "%";
  if (map.getLayer("fill")) map.setPaintProperty("fill", "fill-opacity", fillOpacityExpr(fillOpacity));
});

const toggle = (id, layers) =>
  document.getElementById(id).addEventListener("change", (e) =>
    layers.forEach((l) => map.setLayoutProperty(l, "visibility", e.target.checked ? "visible" : "none")));
toggle("ov-rail", ["ovl-railway-case", "ovl-railway", "ovl-railway-label"]);
toggle("ov-hw", ["ovl-highway", "ovl-highway-label"]);
toggle("ov-label", ["labels"]);

document.getElementById("boundary").addEventListener("change", (e) => setBoundary(e.target.value));

document.getElementById("panel-toggle").addEventListener("click", () =>
  document.getElementById("panel").classList.toggle("open"));

// ---- CSV インポート -----------------------------------------------------
function parseCsv(text) {
  const rows = []; let field = "", row = [], q = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x !== ""));
}
function importCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return 0;
  let codeIdx = 0, lvIdx = 1, start = 0;
  const head = rows[0].map((s) => s.trim().toLowerCase());
  if (head.includes("code") || head.includes("lv")) {
    start = 1;
    if (head.includes("code")) codeIdx = head.indexOf("code");
    if (head.includes("lv")) lvIdx = head.indexOf("lv");
  } else {
    lvIdx = rows[0].length >= 3 ? 2 : 1; // 出力CSV(code,name,lv,..)も受ける
  }
  let n = 0;
  for (let i = start; i < rows.length; i++) {
    const code = (rows[i][codeIdx] || "").trim();
    let lv = parseInt((rows[i][lvIdx] || "").trim(), 10);
    if (!code || isNaN(lv)) continue;
    setLv(code, Math.max(0, Math.min(LV_MAX, lv)));
    n++;
  }
  updateScore();
  return n;
}
document.getElementById("imp-csv").addEventListener("click", () => document.getElementById("imp-file").click());
document.getElementById("imp-file").addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    const n = importCsv(String(reader.result));
    document.getElementById("status").textContent = `${n}件読込`;
    scheduleSave();
  };
  reader.readAsText(f);
  e.target.value = "";
});

// ---- 自動保存 -----------------------------------------------------------
let saveTimer = null;
async function saveData() {
  const status = document.getElementById("status");
  status.textContent = "保存中…";
  try {
    const res = await fetch("/api/save", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paints }),
    });
    status.textContent = res.ok ? "保存しました ✓" : "保存失敗";
  } catch (_) {
    status.textContent = "保存失敗(通信エラー)";
  }
}
function scheduleSave() {
  document.getElementById("status").textContent = "編集中…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveData, 700);
}

// ---- ダウンロード -------------------------------------------------------
function painted() {
  // [{code, name, lv}] を lv 降順→code 昇順
  return Object.keys(paints).filter((c) => paints[c] > 0)
    .map((c) => ({ code: c, name: names[c] || "", lv: paints[c] }))
    .sort((a, b) => b.lv - a.lv || a.code.localeCompare(b.code));
}
function score() { let s = 0; for (const c in paints) s += paints[c]; return s; }
function download(filename, content, type) {
  const url = content.startsWith("data:") ? content : URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  if (!content.startsWith("data:")) setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
function snapshotJpeg() { return map.getCanvas().toDataURL("image/jpeg", 0.92); }

document.getElementById("dl-csv").addEventListener("click", () => {
  const rows = [["code", "name", "lv", "経県"], ...painted().map((p) => [p.code, p.name, p.lv, LV_NAME[p.lv]])];
  const csv = "﻿" + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  download("keikenshi.csv", csv, "text/csv");
});

document.getElementById("dl-jpg").addEventListener("click", () => download("keikenshi.jpg", snapshotJpeg()));

document.getElementById("dl-html").addEventListener("click", () => {
  const list = painted();
  // 都道府県別の合計点
  const byPref = {};
  for (const p of list) { const i = parseInt(p.code.slice(0, 2), 10); byPref[i] = (byPref[i] || 0) + p.lv; }
  const prefRows = Object.keys(byPref).map((i) => `<tr><td>${PREFS[i - 1] || i}</td><td style="text-align:right">${byPref[i]}</td></tr>`).join("");
  const cityRows = list.map((p) =>
    `<tr><td><span class="sw" style="background:${LV_HEX[p.lv]}"></span>${escapeHtml(p.name)}</td><td>${LV_NAME[p.lv]}(${p.lv})</td></tr>`).join("");
  const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">
<title>経県値マップ — 結果</title>
<style>
body{font-family:system-ui,"Hiragino Sans",sans-serif;color:#1f2330;max-width:900px;margin:24px auto;padding:0 16px}
h1{font-size:22px}.score{font-size:28px;font-weight:800;color:#4f46e5}
img{width:100%;border:1px solid #e5e7eb;border-radius:12px;margin:12px 0}
table{border-collapse:collapse;width:100%;margin:8px 0 24px;font-size:14px}
td,th{border-bottom:1px solid #eee;padding:6px 8px;text-align:left}
.sw{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;border:1px solid #ccc;vertical-align:middle}
.cols{display:flex;gap:24px;flex-wrap:wrap}.cols>div{flex:1;min-width:260px}
</style></head><body>
<h1>経県値マップ — 結果</h1>
<div class="score">${score()} 点</div>
<img src="${snapshotJpeg()}" alt="map">
<div class="cols">
  <div><h2>都道府県別</h2><table><tr><th>都道府県</th><th style="text-align:right">点</th></tr>${prefRows}</table></div>
  <div><h2>市区町村 (${list.length})</h2><table><tr><th>市区町村</th><th>経県</th></tr>${cityRows}</table></div>
</div>
<p style="color:#6b7280;font-size:12px">背景: 地理院タイル / 境界: 国土数値情報 N03(2021)</p>
</body></html>`;
  download("keikenshi.html", html, "text/html");
});
