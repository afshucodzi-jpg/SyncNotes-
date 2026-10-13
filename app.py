from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, join_room, emit
import sqlite3
from pathlib import Path
from datetime import datetime, timezone

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "notes.db"
app = Flask(__name__)
app.config["SECRET_KEY"] = "change-this-development-secret"
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

def connect_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with connect_db() as conn:
        conn.execute("""CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL DEFAULT 'Untitled note',
            content TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL
        )""")
        if conn.execute("SELECT COUNT(*) FROM notes").fetchone()[0] == 0:
            now = datetime.now(timezone.utc).isoformat()
            conn.execute("INSERT INTO notes (title, content, updated_at) VALUES (?, ?, ?)",
                ("Welcome to SyncNotes", "This is your first shared note. Open the app in two browser tabs and try editing!", now))

def serialize_note(row):
    return {"id": row["id"], "title": row["title"], "content": row["content"], "updated_at": row["updated_at"]}

@app.route("/")
def index():
    return render_template("index.html")

@app.get("/api/notes")
def get_notes():
    with connect_db() as conn:
        rows = conn.execute("SELECT * FROM notes ORDER BY updated_at DESC, id DESC").fetchall()
    return jsonify([serialize_note(row) for row in rows])

@app.post("/api/notes")
def create_note():
    payload = request.get_json(silent=True) or {}
    title = (payload.get("title") or "Untitled note").strip()[:120] or "Untitled note"
    now = datetime.now(timezone.utc).isoformat()
    with connect_db() as conn:
        cur = conn.execute("INSERT INTO notes (title, content, updated_at) VALUES (?, '', ?)", (title, now))
        row = conn.execute("SELECT * FROM notes WHERE id = ?", (cur.lastrowid,)).fetchone()
    note = serialize_note(row)
    socketio.emit("note_created", note)
    return jsonify(note), 201

@app.get("/api/notes/<int:note_id>")
def get_note(note_id):
    with connect_db() as conn:
        row = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    if row is None:
        return jsonify({"error": "Note not found"}), 404
    return jsonify(serialize_note(row))

@app.put("/api/notes/<int:note_id>")
def update_note(note_id):
    payload = request.get_json(silent=True) or {}
    title = (payload.get("title") or "Untitled note").strip()[:120] or "Untitled note"
    content = str(payload.get("content") or "")[:200_000]
    now = datetime.now(timezone.utc).isoformat()
    with connect_db() as conn:
        if conn.execute("SELECT id FROM notes WHERE id = ?", (note_id,)).fetchone() is None:
            return jsonify({"error": "Note not found"}), 404
        conn.execute("UPDATE notes SET title=?, content=?, updated_at=? WHERE id=?", (title, content, now, note_id))
        row = conn.execute("SELECT * FROM notes WHERE id=?", (note_id,)).fetchone()
    note = serialize_note(row)
    socketio.emit("note_updated", note, to=f"note_{note_id}")
    return jsonify(note)

@app.delete("/api/notes/<int:note_id>")
def delete_note(note_id):
    with connect_db() as conn:
        conn.execute("DELETE FROM notes WHERE id=?", (note_id,))
    socketio.emit("note_deleted", {"id": note_id})
    return jsonify({"ok": True})

@socketio.on("join_note")
def on_join_note(data):
    note_id = int(data.get("note_id", 0))
    join_room(f"note_{note_id}")
    emit("presence", {"message": "A collaborator connected"}, to=f"note_{note_id}", include_self=False)

@socketio.on("live_edit")
def on_live_edit(data):
    note_id = int(data.get("note_id", 0))
    emit("remote_edit", {
        "note_id": note_id,
        "title": str(data.get("title") or "Untitled note")[:120],
        "content": str(data.get("content") or "")[:200_000],
        "updated_at": datetime.now(timezone.utc).isoformat()
    }, to=f"note_{note_id}", include_self=False)

if __name__ == "__main__":
    init_db()
    socketio.run(app, debug=True, host="127.0.0.1", port=5000)
