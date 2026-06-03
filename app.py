"""経県値マップ 2026 — 最小バックエンド.

役割:
  - ページ配信: ランディング(/) / 地図アプリ(/app) / ログイン(/login)
  - 認証: 登録・ログイン・ログアウト(Flaskセッション + パスワードハッシュ)
  - データ: ログイン中はその人の、未ログインは guest の {code: lv} を取得/保存

ジオメトリ(市区町村境界)は静的なのでここでは一切触らない。
動的なのは「code -> lv」という小さな整数表だけなので SQLite 1ファイルで足りる。
"""
import os
import pathlib
import sqlite3

from flask import (Flask, g, jsonify, redirect, request, send_from_directory,
                   session)
from werkzeug.security import check_password_hash, generate_password_hash

BASE = pathlib.Path(__file__).parent
STATIC = BASE / "static"
DB_PATH = BASE / "data" / "keikenshi.db"

app = Flask(__name__, static_folder=str(STATIC), static_url_path="")
# セッション署名鍵。本番は環境変数 SECRET_KEY で必ず上書きする。
app.secret_key = os.environ.get("SECRET_KEY", "dev-insecure-change-me")


def db() -> sqlite3.Connection:
    if "db" not in g:
        DB_PATH.parent.mkdir(exist_ok=True)
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.executescript(
            "create table if not exists users("
            "  username text primary key,"
            "  pw_hash  text not null"
            ");"
            "create table if not exists paint("
            "  user text not null,"
            "  code text not null,"
            "  lv   integer not null,"
            "  primary key (user, code)"
            ");"
        )
    return g.db


@app.teardown_appcontext
def _close(_):
    con = g.pop("db", None)
    if con is not None:
        con.close()


def current_user() -> str:
    """ログイン中はユーザー名、未ログインは 'guest'。"""
    return session.get("user", "guest")


# ---- ページ -------------------------------------------------------------
@app.get("/")
def landing():
    return send_from_directory(STATIC, "landing.html")


@app.get("/app")
def app_page():
    return send_from_directory(STATIC, "index.html")


@app.get("/login")
def login_page():
    return send_from_directory(STATIC, "login.html")


# ---- 認証 API -----------------------------------------------------------
@app.get("/api/me")
def me():
    return jsonify({"user": current_user(), "authed": "user" in session})


@app.post("/api/register")
def register():
    data = request.get_json(force=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if len(username) < 2 or len(password) < 4:
        return jsonify({"error": "ユーザー名は2文字以上、パスワードは4文字以上"}), 400
    if username.lower() == "guest":
        return jsonify({"error": "そのユーザー名は使えません"}), 400
    con = db()
    if con.execute("select 1 from users where username=?", (username,)).fetchone():
        return jsonify({"error": "そのユーザー名は既に使われています"}), 409
    with con:
        con.execute(
            "insert into users(username, pw_hash) values(?, ?)",
            (username, generate_password_hash(password, method="pbkdf2:sha256")),
        )
    session["user"] = username
    return jsonify({"ok": True, "user": username})


@app.post("/api/login")
def login():
    data = request.get_json(force=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    row = db().execute("select pw_hash from users where username=?", (username,)).fetchone()
    if not row or not check_password_hash(row["pw_hash"], password):
        return jsonify({"error": "ユーザー名かパスワードが違います"}), 401
    session["user"] = username
    return jsonify({"ok": True, "user": username})


@app.post("/api/logout")
def logout():
    session.pop("user", None)
    return jsonify({"ok": True})


# ---- 経県値データ API ---------------------------------------------------
@app.get("/api/data")
def get_data():
    """現在のユーザーの塗り {code: lv} を返す (lv>0 のみ)。"""
    rows = db().execute(
        "select code, lv from paint where user = ? and lv > 0", (current_user(),)
    ).fetchall()
    return jsonify({r["code"]: r["lv"] for r in rows})


@app.post("/api/save")
def save():
    """{paints:{code:lv}} を現在のユーザーに upsert。lv=0 は削除。"""
    payload = request.get_json(force=True) or {}
    paints = payload.get("paints", {})
    user = current_user()
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
    return jsonify({"ok": True, "saved": len(paints), "user": user})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
