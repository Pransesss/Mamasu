/* events.js — admin: no classes, exams, campus events. The forecast reads these. */
document.addEventListener("DOMContentLoaded", () => {
  const { $, esc } = UI, label = { no_classes: "No classes / ADM", exam: "Exam", event: "Campus event", other: "Other" };
  async function load() {
    try {
      const rows = await api("/api/events");
      $("#table-events tbody").innerHTML = rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${label[r.event_type]}</td><td>${UI.mdy(r.event_date)}</td><td>${esc(r.notes || "")}</td><td><button class="link-button" data-del="${r.event_id}">Delete</button></td></tr>`).join("") || '<tr class="table__empty"><td colspan="5">No events yet</td></tr>';
    } catch (e) { UI.toast(e.message); }
  }
  $("#form-event").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/api/events", { method: "POST", body: { date: $("#event-date").value, type: $("#event-type").value, name: $("#event-name").value, notes: $("#event-notes").value } });
      $("#event-name").value = ""; $("#event-notes").value = ""; UI.toast("Event added"); load();
    } catch (err) { UI.toast(err.message); }
  });
  $("#table-events").addEventListener("click", async (e) => { if (e.target.dataset.del) { await api("/api/events/" + e.target.dataset.del, { method: "DELETE" }); load(); } });
  load();
});
