"""経県値マップ 2026 — 最小バックエンド.

役割はこれだけ:
  - 静的ファイル(地図フロント・タイル)の配信
  - ユーザーごとの {市区町村code: lv} の取得 / 保存

ジオメトリ(市区町村境界)は静的なのでここでは一切触らない。
動的なのは「code -> lv」という小さな整数表だけなので SQLite 1ファイルで足りる。
"""
import pathlib
import sqlite3

from flask import Flask, g, jsonify, request, send_from_directory

BASE = pathlib.Path(__file__).parent
STATIC = BASE / "static"
DB_PATH = BASE / "data" / "keikenshi.db"

app = Flask(__name__, static_folder=str(STATIC), static_url_path="")


def db() -> sqlite3.Connection:
    if "db" not in g:
        DB_PATH.parent.mkdir(exist_ok=True)
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute(
            "create table if not exists paint("
            "  user text not null,"
            "  code text not null,"
            "  lv   integer not null,"
            "  primary key (user, code)"
            ")"
        )
    return g.db


@app.teardown_appcontext
def _close(_):
    con = g.pop("db", None)
    if con is not None:
        con.close()


@app.get("/")
def index():
    return send_from_directory(STATIC, "index.html")


@app.get("/api/data")
def get_data():
    """そのユーザーの塗り {code: lv} を返す (lv>0 のみ)。"""
    user = request.args.get("user", "guest")
    rows = db().execute(
        "select code, lv from paint where user = ? and lv > 0", (user,)
    ).fetchall()
    return jsonify({r["code"]: r["lv"] for r in rows})


@app.post("/api/save")
def save():
    """{user, paints:{code:lv}} を upsert。lv=0 は削除。"""
    payload = request.get_json(force=True) or {}
    user = payload.get("user", "guest")
    paints = payload.get("paints", {})
    con = db()
    with con:
        for code, lv in paints.items():
            lv = int(lv)
            if lv > 0:
                con.execute(
                    "insert into paint(user, code, lv) values(?, ?, ?) "
                    "on conflict(user, code) do update set lv = excluded.lv",
                    (user, code, lv),
                )
            else:
                con.execute(
                    "delete from paint where user = ? and code = ?", (user, code)
                )
    return jsonify({"ok": True, "saved": len(paints)})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
