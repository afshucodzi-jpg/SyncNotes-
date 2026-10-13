# SyncNotes — Python + JavaScript real-time collaborative notes

Beginner-friendly project using Flask, Flask-SocketIO, SQLite, HTML, CSS, and vanilla JavaScript.

## Features
- Create and switch between notes
- Live edits sent to collaborators through WebSockets
- Autosave notes to SQLite
- Share a note link
- Responsive layout

## Run on macOS
1. Open Terminal and move into this folder:
   `cd path/to/SyncNotes`
2. Create and activate a virtual environment:
   `python3 -m venv .venv`
   `source .venv/bin/activate`
3. Install packages:
   `pip install -r requirements.txt`
4. Start the server:
   `python app.py`
5. Open `http://127.0.0.1:5000` in your browser.
6. Open a second browser tab to test live updates.

## Important limitations
This starter broadcasts the entire note contents. If two people type at exactly the same time, one update may overwrite the other. Production collaborative editors typically use Operational Transformation (OT) or a Conflict-free Replicated Data Type (CRDT), plus authentication, access controls, validation, rate limits, and HTTPS. The share link is not secure authentication in this demo.

The app is configured for local development only. Do not expose this development server publicly.
