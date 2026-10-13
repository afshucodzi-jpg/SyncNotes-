const socket = io();
const notesList = document.getElementById("notes-list");
const titleInput = document.getElementById("note-title");
const contentInput = document.getElementById("note-content");
const saveState = document.getElementById("save-state");
const lastSaved = document.getElementById("last-saved");
const toast = document.getElementById("toast");
let notes = [], activeId = null, saveTimer = null, toastTimer = null, applyingRemoteChange = false;

function showToast(message) {
  toast.textContent = message; toast.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}
function setSaveLabel(label, color) {
  saveState.innerHTML = `<span class="save-dot"></span> ${label}`; saveState.style.color = color || "";
}
function updateWordCount() {
  const text = contentInput.value.trim();
  document.getElementById("word-count").textContent = `${text ? text.split(/\s+/).length : 0} words`;
}
function renderNotes() {
  notesList.innerHTML = "";
  document.getElementById("note-count").textContent = notes.length;
  notes.forEach(note => {
    const item = document.createElement("div"); item.className = `note-item ${note.id === activeId ? "active" : ""}`; item.tabIndex = 0;
    const icon = document.createElement("span"); icon.className = "file-icon"; icon.textContent = "▤";
    const text = document.createElement("div"); text.className = "note-text";
    const name = document.createElement("strong"); name.textContent = note.title || "Untitled note";
    const date = document.createElement("small"); date.textContent = note.id === activeId ? "Currently open" : "Shared note";
    text.append(name, date); item.append(icon, text);
    item.addEventListener("click", () => openNote(note.id));
    item.addEventListener("keydown", e => { if (e.key === "Enter") openNote(note.id); });
    notesList.appendChild(item);
  });
}
async function loadNotes() {
  const response = await fetch("/api/notes"); notes = await response.json(); renderNotes();
  if (notes.length) await openNote(notes[0].id); else await createNote();
}
async function openNote(id) {
  const response = await fetch(`/api/notes/${id}`); if (!response.ok) return;
  const note = await response.json(); activeId = note.id;
  titleInput.value = note.title; contentInput.value = note.content;
  document.getElementById("breadcrumb-title").textContent = note.title;
  document.getElementById("note-id-label").textContent = `NOTE #${note.id}`;
  lastSaved.textContent = "Synced with workspace"; setSaveLabel("Saved", "#5eaa8e");
  updateWordCount(); socket.emit("join_note", {note_id: id}); renderNotes();
}
async function createNote() {
  const response = await fetch("/api/notes", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({title:"Untitled note"})});
  const note = await response.json(); notes.unshift(note); renderNotes(); await openNote(note.id); titleInput.focus();
}
async function saveToServer() {
  if (!activeId) return;
  const id = activeId, payload = {title:titleInput.value || "Untitled note", content:contentInput.value};
  setSaveLabel("Saving…", "#9b91d9");
  try {
    const response = await fetch(`/api/notes/${id}`, {method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload)});
    if (!response.ok) throw new Error("Save failed");
    const saved = await response.json();
    if (activeId === id) { setSaveLabel("Saved", "#5eaa8e"); lastSaved.textContent = "All changes saved"; document.getElementById("breadcrumb-title").textContent = saved.title; }
    const index = notes.findIndex(n => n.id === id); if (index >= 0) notes[index] = saved; else notes.unshift(saved);
    renderNotes();
  } catch { setSaveLabel("Offline?", "#c66c6c"); lastSaved.textContent = "Could not save — check connection"; }
}
function queueSave() {
  if (applyingRemoteChange || !activeId) return;
  setSaveLabel("Unsaved", "#b78a4a"); lastSaved.textContent = "Saving changes…";
  socket.emit("live_edit", {note_id:activeId, title:titleInput.value, content:contentInput.value});
  clearTimeout(saveTimer); saveTimer = setTimeout(saveToServer, 500);
  updateWordCount();
}
titleInput.addEventListener("input", queueSave);
contentInput.addEventListener("input", queueSave);
document.getElementById("new-note").addEventListener("click", createNote);
document.getElementById("share-button").addEventListener("click", async () => {
  if (!activeId) return;
  const shareUrl = `${location.origin}/?note=${activeId}`;
  try { await navigator.clipboard.writeText(shareUrl); showToast("Note link copied. Share it with a collaborator!"); }
  catch { prompt("Copy this note link:", shareUrl); }
});
socket.on("connect", () => document.getElementById("connection-label").textContent = "Live connection");
socket.on("disconnect", () => document.getElementById("connection-label").textContent = "Reconnecting…");
socket.on("remote_edit", data => {
  if (data.note_id !== activeId) return;
  applyingRemoteChange = true; titleInput.value = data.title; contentInput.value = data.content;
  document.getElementById("breadcrumb-title").textContent = data.title; updateWordCount(); applyingRemoteChange = false;
  setSaveLabel("Live update", "#5eaa8e"); lastSaved.textContent = "Updated by collaborator";
  const index = notes.findIndex(n => n.id === activeId);
  if (index >= 0) notes[index] = {...notes[index], title:data.title, content:data.content};
  renderNotes();
});
socket.on("note_created", note => { if (!notes.some(n => n.id === note.id)) notes.unshift(note); renderNotes(); });
socket.on("note_deleted", data => { notes = notes.filter(n => n.id !== data.id); renderNotes(); });
socket.on("presence", () => showToast("A collaborator just opened this note."));
async function start() {
  await loadNotes();
  const requestedId = new URLSearchParams(location.search).get("note");
  if (requestedId && notes.some(n => n.id === Number(requestedId))) await openNote(Number(requestedId));
}
start().catch(error => { console.error(error); showToast("Could not load notes. Is the Python server running?"); });
