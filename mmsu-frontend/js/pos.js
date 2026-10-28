/* pos.js — the cashier screen. Used by pos.html, pos-meal.html and pos-meat.html (they share ONE cart, kept in this device).
   Prices are only a PREVIEW here. The server recomputes every meal from the meal_prices table when the sale is saved. */
document.addEventListener("DOMContentLoaded", async () => {
  const $ = UI.$, load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  let boot = null, mp = {}, cart = load("pos_cart", []), held = load("pos_held", []);
  const MEATS = ["beef", "chicken", "fish", "pork"], cap = (s) => s[0].toUpperCase() + s.slice(1);

  /* ---------- price preview (same rules as backend/pricing.py) ---------- */
  function priced(spec) {
    const t = spec.type;
    if (t === "product") { const p = boot.products.find((x) => x.product_id === spec.product_id) || { name: "(item no longer sold)", price: 0, product_id: spec.product_id }; return { name: p.name, unit: p.price, section: "Snacks", parts: {}, product: p.product_id }; }
    if (t === "meat") return { name: cap(spec.meat), unit: mp[spec.meat], section: "Meals", parts: { [spec.meat]: 1 } };
    if (t === "veg") return { name: "Veggy", unit: mp.veg, section: "Meals", parts: { veg: 1 } };
    if (t === "rice") return { name: "Plain Rice", unit: mp.rice, section: "Meals", parts: { rice: 1 } };
    if (t === "fried_rice") return { name: "Fried Rice", unit: mp.fried_rice, section: "Meals", parts: { rice: 1 } };
    const { meat, meat_qty: mq, veg_qty: veg, rice_type: rt, rice_qty: rq } = spec;
    const budget = !!meat && mq === 1 && veg === 1 && rt === "plain" && rq === 1;
    const unit = budget ? mp["budget_" + meat] : (meat ? mp[meat] * mq : 0) + mp.veg * veg + (rt === "fried" ? mp.fried_rice : mp.rice) * rq;
    const riceTxt = (rq === 0.5 ? "½ " : rq === 2 ? "Double " : "") + (rt === "fried" ? "Fried rice" : "Rice");
    const name = budget ? `Budget Meal (Rice, ${cap(meat)} & Vegetable)` : [riceTxt, meat && (mq === 2 ? "Double " : "") + cap(meat), veg && (veg === 2 ? "Double " : "") + "Vegetable"].filter(Boolean).join(" + ");
    const parts = { rice: rq }; if (meat) parts[meat] = mq; if (veg) parts.veg = veg;
    return { name, unit, section: "Meals", parts, budget };
  }
  const keyOf = (s) => JSON.stringify({ ...s, qty: 0 });
  const total = () => cart.reduce((n, l) => n + priced(l).unit * l.qty, 0);
  const boxes = () => (localStorage.getItem("pos_dine") === "out" ? cart.filter((l) => priced(l).section === "Meals").reduce((n, l) => n + l.qty, 0) : 0);
  const grand = () => total() + boxes() * (mp.take_out_box || 5);
  const needOf = (lines) => { const n = {}; lines.forEach((l) => { const p = priced(l); Object.entries(p.parts).forEach(([k, v]) => (n["meal:" + k] = (n["meal:" + k] || 0) + v * l.qty)); if (p.product) n[p.product] = (n[p.product] || 0) + l.qty; }); return n; };
  function shortItem(lines) {          // returns the name of something we do not have enough of, or ""
    for (const [k, v] of Object.entries(needOf(lines))) {
      const have = k.startsWith("meal:") ? boot.meal_stock[k.slice(5)] : (boot.products.find((p) => String(p.product_id) === k) || {}).qty;
      if (v > (have ?? 0)) return k.startsWith("meal:") ? cap(k.slice(5)) + " servings" : boot.products.find((p) => String(p.product_id) === k).name;
    }
    return "";
  }

  /* ---------- cart ---------- */
  function addSpec(spec) {
    const next = cart.map((l) => ({ ...l })), found = next.find((l) => keyOf(l) === keyOf(spec));
    found ? (found.qty += spec.qty) : next.push({ ...spec });
    const lack = shortItem(next);
    if (lack) { UI.toast("Not enough stock: " + lack); return false; }
    cart = next; save("pos_cart", cart); render(); return true;
  }
  function render() {
    const ul = $("#order-lines");
    ul.innerHTML = cart.length ? cart.map((l, i) => { const p = priced(l);
      return `<li class="order__line"><span>${UI.esc(p.name)}</span><span class="stepper"><button class="stepper__btn" type="button" data-dec="${i}">−</button><span>${l.qty}</span><button class="stepper__btn" type="button" data-inc="${i}">+</button></span><span class="order__line-amount">${UI.money(p.unit * l.qty)}</span></li>`; }).join("")
      : '<li class="order__empty">No items yet</li>';
    $("#order-dine").hidden = !cart.some((l) => priced(l).section === "Meals");
    $("#order-box-fee").textContent = `Take-out box × ${boxes()} = ${UI.money(boxes() * (mp.take_out_box || 5))}`;
    $("#order-total").textContent = UI.money(grand());
    const given = parseFloat($("#cash-tendered").value || 0);
    $("#order-change").textContent = UI.money(Math.max(0, given - grand()));
    $("#btn-resume").hidden = !held.length;
    $("#btn-hold").textContent = held.length ? `HOLD SALE (${held.length} held)` : "HOLD SALE";
  }
  $("#order-lines").addEventListener("click", (e) => {
    const inc = e.target.dataset.inc, dec = e.target.dataset.dec;
    if (inc !== undefined) addSpec({ ...cart[inc], qty: 1 });
    if (dec !== undefined) { cart[dec].qty--; if (cart[dec].qty <= 0) cart.splice(dec, 1); save("pos_cart", cart); render(); }
  });
  $$all("input[name=dine]").forEach((r) => r.addEventListener("change", () => { localStorage.setItem("pos_dine", $("#dine-out").checked ? "out" : "in"); render(); }));
  $$all("input[name=pay]").forEach((r) => r.addEventListener("change", () => localStorage.setItem("pos_pay", $("#pay-1").checked ? "ewallet" : "cash")));
  $("#cash-tendered").addEventListener("input", render);
  $("#ewallet-ref4").addEventListener("input", (e) => (e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4)));
  function $$all(s) { return UI.$$(s); }

  $("#btn-hold").addEventListener("click", () => { if (!cart.length) return; held.push(cart); cart = []; save("pos_held", held); save("pos_cart", cart); render(); UI.toast("Sale put on hold"); });
  $("#btn-resume").addEventListener("click", () => { if (!held.length || cart.length) return UI.toast(cart.length ? "Finish or hold the current sale first" : ""); cart = held.pop(); save("pos_held", held); save("pos_cart", cart); render(); });
  $("#btn-cancel").addEventListener("click", () => { if (cart.length && !confirm("Cancel this sale?")) return; cart = []; save("pos_cart", cart); $("#cash-tendered").value = ""; $("#ewallet-ref4").value = ""; render(); });

  /* ---------- complete sale: save on the device first, then sync ---------- */
  $("#btn-complete").addEventListener("click", async () => {
    if (salesDayClosed) return UI.toast("Today's sales are already closed");
    if (!cart.length) return UI.toast("Add an item first");
    const ewallet = $("#pay-1").checked, tendered = parseFloat($("#cash-tendered").value || 0), ref4 = $("#ewallet-ref4").value, t = grand();
    if (ewallet && !/^\d{4}$/.test(ref4)) return UI.toast("Enter the last 4 digits of the e-wallet reference number");
    if (!ewallet && tendered < t) return UI.toast("Amount tendered is less than the total");
    const lack = shortItem(cart); if (lack) return UI.toast("Not enough stock: " + lack);
    const now = UI.isoNow(), code = UI.session().user.aux_code;
    const txn = { id: UI.uuid(), receipt_no: `${code}-${now.slice(0, 10).replace(/-/g, "")}-${UI.uuid().slice(0, 4).toUpperCase()}`, created_at: now,
      payment_method: ewallet ? "E-Wallet" : "Cash", amount_tendered: ewallet ? null : tendered, ewallet_ref4: ewallet ? ref4 : null,
      dine: localStorage.getItem("pos_dine") === "out" ? "out" : "in", lines: cart.map((l) => ({ ...l })) };
    await Store.put("outbox", { id: txn.id, payload: txn, status: "pending" });       // 1. safe on the device
    await Sync.useStock(needOf(cart));                                                // lower the saved stock
    Object.entries(needOf(cart)).forEach(([k, v]) => { if (k.startsWith("meal:")) boot.meal_stock[k.slice(5)] -= v; else boot.products.find((p) => String(p.product_id) === k).qty -= v; });
    cart = []; save("pos_cart", cart); $("#cash-tendered").value = ""; $("#ewallet-ref4").value = ""; render(); drawSnacks();
    Sync.badge(); Sync.flush();                                                       // 2. send when online
  });

  /* ---------- data: online = fresh from the server, offline = the copy saved on this device ---------- */
  await Sync.flush();
  boot = await Sync.bootstrap();
  if (!boot) { UI.toast("Connect to the internet once to download the products and prices."); return; }
  mp = boot.meal_prices;
  UI.$$("[data-price]").forEach((el) => (el.textContent = UI.money(mp[el.dataset.price.replace("_only", "")])));
  let salesDayClosed = !!boot.sales_day_closed;
  const completeBtn = $("#btn-complete"), doneBtn = $("#btn-done-day");
  function updateSalesDayUI() {
    completeBtn.disabled = salesDayClosed;
    completeBtn.textContent = salesDayClosed ? "SALES DAY CLOSED" : "COMPLETE SALE";
    doneBtn.disabled = salesDayClosed;
    doneBtn.textContent = salesDayClosed ? "SALES DAY CLOSED" : "DONE FOR TODAY";
  }
  updateSalesDayUI();
  doneBtn.addEventListener("click", async () => {
    if (salesDayClosed) return;
    if (cart.length) return UI.toast("Finish or cancel the current sale first");
    const ov = UI.modal(`<h2 class="card__title">Done for Today?</h2><p class="muted text-small">This will close today’s sales for this auxiliary. Sales cannot be added to today after it is closed.</p><label for="close-day-password">Confirm with your password</label><input type="password" id="close-day-password" autocomplete="current-password" placeholder="Password"><div class="modal__actions"><button class="btn" id="close-day-confirm" type="button">Confirm</button><button class="btn btn--ghost" data-close type="button">Cancel</button></div>`);
    ov.querySelector("#close-day-confirm").addEventListener("click", async () => {
      const password = ov.querySelector("#close-day-password").value;
      if (!password) return UI.toast("Enter your password");
      try {
        await api("/api/sales-day/close", { method: "POST", body: { password } });
        ov.remove(); salesDayClosed = true; updateSalesDayUI(); UI.toast("Today's sales are now closed");
      } catch (e) { UI.toast(e.message); }
    });
  });
  const dine = localStorage.getItem("pos_dine") === "out" ? "#dine-out" : "#dine-in"; $(dine).checked = true;
  if (localStorage.getItem("pos_pay") === "ewallet") $("#pay-1").checked = true;

  /* quick tiles (snacks with no barcode, best sellers first) */
  function drawSnacks() {
    const slot = $("#tiles-snacks"); if (!slot) return;
    const list = boot.products.filter((p) => !p.barcode && p.category === "Snacks").sort((a, b) => b.sold7 - a.sold7 || a.name.localeCompare(b.name));
    slot.innerHTML = list.map((p) => `<button class="tile" type="button" data-product="${p.product_id}"><b>${UI.esc(p.name)}</b><span class="tile__price">${UI.money(p.price)}</span></button>`).join("");
  }
  drawSnacks();
  document.addEventListener("click", (e) => {
    const tile = e.target.closest("[data-product]"), add = e.target.closest("[data-add]");
    if (tile) addSpec({ type: "product", product_id: +tile.dataset.product, qty: 1 });
    if (add) { const k = add.dataset.add; addSpec(MEATS.includes(k) ? { type: "meat", meat: k, qty: 1 } : { type: { veggy: "veg", rice: "rice", "fried-rice": "fried_rice" }[k], qty: 1 }); }
  });

  /* search / scan: chips, drinks and anything else with a barcode */
  const search = $("#pos-search"), results = $("#pos-results"), others = ["#pos-home", "#meal-builder", "#meat-picker"].map((s) => $(s)).filter(Boolean);
  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    results.hidden = !q; others.forEach((o) => (o.hidden = !!q));
    if (!q) return;
    const hits = boot.products.filter((p) => p.name.toLowerCase().includes(q) || (p.barcode || "").includes(q)).slice(0, 24);
    results.innerHTML = hits.map((p) => `<button class="tile" type="button" data-product="${p.product_id}"><b>${UI.esc(p.name)}</b><span class="tile__price">${UI.money(p.price)}</span></button>`).join("") || '<p class="muted">No match</p>';
  });
  search.addEventListener("keydown", (e) => {            // a barcode scanner "types" the number and presses Enter
    if (e.key !== "Enter") return;
    const p = boot.products.find((x) => x.barcode && x.barcode === search.value.trim());
    if (!p) return UI.toast("Barcode not found");
    addSpec({ type: "product", product_id: p.product_id, qty: 1 }); search.value = ""; search.dispatchEvent(new Event("input"));
  });

  /* meal builder (pos-meal.html) */
  if ($("#meal-builder")) {
    let q = 1;
    UI.$$("input[name=meat], input[name=veg]").forEach((inp) => {       // tap a selected tile again to remove it
      inp.closest("label").addEventListener("pointerdown", () => (inp.dataset.was = inp.checked ? "1" : ""));
      inp.addEventListener("click", () => { if (inp.dataset.was === "1") inp.checked = false; inp.dataset.was = ""; update(); });
    });
    UI.$$("input[name=meat-qty], input[name=rice-qty], input[name=rice-type]").forEach((i) => i.addEventListener("change", update));
    const val = (n) => (UI.$(`input[name=${n}]:checked`) || {}).value;
    const spec = () => ({ type: "meal", meat: val("meat") || null, meat_qty: +(val("meat-qty") || 1), veg_qty: +(val("veg") || 0), rice_type: val("rice-type") || "plain", rice_qty: +(val("rice-qty") || 1), qty: q });
    function update() {
      const s = spec(), none = !s.meat && !s.veg_qty, p = none ? null : priced(s);
      $("#meal-qty").textContent = q;
      $("#meal-price").textContent = p ? UI.money(p.unit * q) : "₱00.00";
      $("#meal-summary").children[0].hidden = !(p && p.budget);
      $("#meal-summary").children[1].textContent = p ? p.name + (p.budget ? " — Budget meal" : "") : "Choose a meat or veggy";
    }
    $("#qty-minus").addEventListener("click", () => { q = Math.max(1, q - 1); update(); });
    $("#qty-plus").addEventListener("click", () => { q++; update(); });
    $("#btn-add-meal").addEventListener("click", () => { const s = spec(); if (!s.meat && !s.veg_qty) return UI.toast("Choose a meat or veggy first"); if (addSpec(s)) location.href = "pos.html"; });
    update();
  }
  render();
  window.addEventListener("outbox-changed", () => Sync.badge());
});
