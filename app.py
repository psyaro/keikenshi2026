"""経県値マップ 2026 — 最小バックエンド.

役割:
  - ページ配信: ランディング(/) / 地図アプリ(/app) / ログイン(/login)
  - 認証: 登録・ログイン・ログアウト(Flaskセッション + パスワードハッシュ)
  - データ: ログイン中はその人の、未ログインはセッション固有の guest_<token> の {code: lv} を取得/保存

ジオメトリ(市区町村境界)は静的なのでここでは一切触らない。
動的なのは「code -> lv」という小さな整数表だけなので SQLite 1ファイルで足りる。
"""
import os
import pathlib
import re
import secrets
import sqlite3

from flask import (Flask, g, jsonify, request, send_from_directory, session)
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.security import check_password_hash, generate_password_hash

BASE = pathlib.Path(__file__).parent
STATIC = BASE / "static"
DB_PATH = BASE / "data" / "keikenshi.db"

LV_MAX = 4
_CODE_RE = re.compile(r"^\d{5}$")

app = Flask(__name__, static_folder=str(STATIC), static_url_path="")
# セッション署名鍵。本番は環境変数 SECRET_KEY で必ず上書きする。
app.secret_key = os.environ.get("SECRET_KEY", "dev-insecure-change-me")
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    # HTTPS 環境では環境変数 SESSION_COOKIE_SECURE=1 を設定する。
    SESSION_COOKIE_SECURE=os.environ.get("SESSION_COOKIE_SECURE", "0") == "1",
    MAX_CONTENT_LENGTH=64 * 1024,  # リクエストボディ上限 64KB
)

limiter = Limiter(get_remote_address, app=app, default_limits=[])


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
    """ログイン中はユーザー名、未ログインはセッション固有のゲストID。"""
    if "user" in session:
        return session["user"]
    if "guest_id" not in session:
        session["guest_id"] = "guest_" + secrets.token_hex(16)
    return session["guest_id"]


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
@limiter.limit("10 per minute")
def register():
    data = request.get_json(force=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if len(username) < 2 or len(username) > 30:
        return jsonify({"error": "ユーザー名は2〜30文字"}), 400
    if len(password) < 4:
        return jsonify({"error": "パスワードは4文字以上"}), 400
    if username.lower() == "guest" or username.lower().startswith("guest_"):
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
@limiter.limit("10 per minute")
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
    if not isinstance(paints, dict):
        return jsonify({"error": "invalid"}), 400
    user = current_user()
    con = db()
    saved = 0
    with con:
        for code, lv in paints.items():
            if not _CODE_RE.match(str(code)):
                continue
            try:
                lv = int(lv)
            except (TypeError, ValueError):
                continue
            if not (0 <= lv <= LV_MAX):
                continue
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
            saved += 1
    return jsonify({"ok": True, "saved": saved, "user": user})


if __name__ == "__main__":
    # 本番は gunicorn などで起動する。直接実行時もデバッグはオフがデフォルト。
    app.run(debug=os.environ.get("FLASK_DEBUG", "0") == "1", port=5000)
