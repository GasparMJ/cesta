"use strict";
// ============================================================
// Cesta · lista de la compra con precios de Mercadona, menú
// semanal y recetario. Todo se guarda en el propio móvil.
// ============================================================

// ---------- Utilidades ----------
const $ = id => document.getElementById(id);
const eur = v => v.toLocaleString("es-ES", {style: "currency", currency: "EUR"});
const norm = s => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const DAYS = [["lun", "Lunes"], ["mar", "Martes"], ["mie", "Miércoles"], ["jue", "Jueves"], ["vie", "Viernes"], ["sab", "Sábado"], ["dom", "Domingo"]];
const SLOTS = [["comida", "Comida"], ["cena", "Cena"]];
const SEARCH_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// ---------- Datos ----------
let GEN = [], GENBY = {}, UPDATED = null, REC = [], RECBY = {}, MERC = null, mercLoading = null;
function loadMerc() {
  if (MERC) return Promise.resolve(MERC);
  return mercLoading ??= fetch("data/catalogo.json").then(r => r.json()).then(d => {
    MERC = d.rows.map(r => ({pid: r[0], name: r[1], pack: r[2], price: r[3], ref: r[4], fmt: r[5], cat: r[6], sec: r[7] || r[6], _n: norm(r[1])}));
    return MERC;
  }).catch(() => { mercLoading = null; return []; });
}

// ---------- Estado (en el móvil) ----------
const KEY = "cesta-app-v1";
const defaultState = () => ({v: 1, tab: "lista", period: 1, list: [], hist: {}, trips: [],
  menu: {people: 2, prefs: "", days: {}}, ings: [], pantry: [], tipClosed: false});
let state = defaultState();
try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) state = {...defaultState(), ...s}; } catch (e) {}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast("No se pudo guardar en el móvil"); } }
function commit() { save(); renderAll(); }

// ---------- Precios ----------
function unitPrice(i) { // precio de una unidad del artículo
  if (i.pid) return i.price ?? null;
  return GENBY[i.name]?.m?.price ?? null;
}
function sectionOf(i) { return i.sec || GENBY[i.name]?.m?.sec || "Otros"; }
function unitLabel(i) { return i.pid ? (i.unit || "unidad") : (GENBY[i.name]?.unit || "unidad"); }

// ---------- Hoja inferior y avisos ----------
let sheetOnClose = null;
function openSheet(title, html, mount, onClose) {
  $("sheet-title").textContent = title;
  $("sheet-body").innerHTML = html;
  $("sheet").hidden = false;
  document.body.style.overflow = "hidden";
  sheetOnClose = onClose || null;
  mount && mount($("sheet-body"));
}
function closeSheet() {
  $("sheet").hidden = true; document.body.style.overflow = "";
  const f = sheetOnClose; sheetOnClose = null; f && f();
}
$("sheet-close").onclick = closeSheet;
$("sheet-bg").onclick = closeSheet;
let toastTimer;
function toast(t) { const el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.hidden = true, 2200); }

// ---------- Navegación ----------
const TABS = {
  lista: {title: "Lista", action: "＋", label: "Añadir productos", run: () => openSearch()},
  menu: {title: "Menú", action: "✦", label: "Rellenar el menú", run: () => autoMenu(false)},
  recetas: {title: "Recetas", action: null},
  ajustes: {title: "Ajustes", action: null},
};
function showTab(t) {
  state.tab = t; save();
  document.querySelectorAll(".tabbar button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === t));
  Object.keys(TABS).forEach(k => $("s-" + k).hidden = k !== t);
  const cfg = TABS[t];
  $("title").textContent = cfg.title;
  $("top-action").hidden = !cfg.action;
  if (cfg.action) { $("top-action").textContent = cfg.action; $("top-action").setAttribute("aria-label", cfg.label); }
  renderAll(); window.scrollTo(0, 0);
}
document.querySelectorAll(".tabbar button").forEach(b => b.onclick = () => showTab(b.dataset.tab));
$("top-action").onclick = () => TABS[state.tab].run?.();
window.addEventListener("scroll", () => $("top").classList.toggle("scrolled", window.scrollY > 8), {passive: true});

// ---------- Lista ----------
function addItem(entry, n = 1) {
  if (typeof entry === "string") {
    const q = entry.trim(); if (!q) return null;
    const g = GEN.find(x => norm(x.name) === norm(q));
    entry = {name: g ? g.name : q};
  }
  const ex = state.list.find(i => i.name === entry.name);
  if (ex) { ex.n += n; ex.done = false; return ex; }
  const it = {...entry, n, done: false};
  state.list.push(it); return it;
}
function totals() {
  const k = state.period;
  let all = 0, cart = 0, priced = 0;
  state.list.forEach(i => { const p = unitPrice(i); if (p != null) { all += p * i.n * k; priced++; if (i.done) cart += p * i.n * k; } });
  return {all, cart, priced, k};
}
function itemRow(i, ix, k) {
  const p = unitPrice(i), g = GENBY[i.name];
  const sub = `${i.n > 1 ? i.n + " × " : ""}${unitLabel(i)}${k > 1 ? " · ×4 semanas" : ""}`;
  const prod = !i.pid && g?.m ? g.m.product : "";
  return `<div class="rowi ${i.done ? "done" : ""}">
    <input type="checkbox" class="check" id="c${ix}" data-ck="${ix}" ${i.done ? "checked" : ""} aria-label="Marcar ${esc(i.name)}">
    <label class="grow" for="c${ix}"><span class="t">${esc(i.name)}${i.src === "menu" ? `<span class="badge">menú</span>` : ""}</span><span class="s one">${esc(sub)}</span>${prod ? `<span class="s one">${esc(prod)}</span>` : ""}</label>
    <div class="right"><span class="p">${p != null ? eur(p * i.n * k) : "—"}</span>
    <div class="stepper"><button data-dec="${ix}" aria-label="Quitar uno de ${esc(i.name)}">−</button><span>${i.n}</span><button data-inc="${ix}" aria-label="Añadir uno de ${esc(i.name)}">+</button></div></div>
  </div>`;
}
function habituals() {
  const trips = state.trips.length, now = Date.now();
  return Object.entries(state.hist).map(([name, h]) => {
    const every = h.c > 1 ? (new Date(h.last) - new Date(h.first)) / 864e5 / (h.c - 1) : null;
    const since = (now - new Date(h.last)) / 864e5;
    return {name, ...h, share: trips ? h.c / trips : 0, due: every != null && since > every * 1.2};
  }).sort((a, b) => b.c - a.c);
}
const histEntry = (name, h) => h.pid ? {name, pid: h.pid, price: h.price, unit: h.unit, sec: h.sec} : name;
function addHabituals() {
  let added = 0;
  habituals().filter(h => h.c >= 2 && (h.share >= 0.5 || h.due)).forEach(h => {
    if (!state.list.some(i => i.name === h.name)) { addItem(histEntry(h.name, h), h.n || 1); added++; }
  });
  toast(added ? `Añadidos ${added} productos habituales` : "No hay habituales nuevos que añadir");
  commit();
}
function finishShopping() {
  const bought = state.list.filter(i => i.done);
  if (!bought.length) return;
  const now = new Date().toISOString();
  bought.forEach(i => {
    const h = state.hist[i.name] || {c: 0, first: now};
    state.hist[i.name] = {...h, c: h.c + 1, last: now, n: i.n, ...(i.pid ? {pid: i.pid, price: i.price, unit: i.unit, sec: i.sec} : {})};
  });
  state.trips = [...state.trips, now].slice(-52);
  state.list = state.list.filter(i => !i.done);
  toast(`Compra guardada · ${bought.length} productos en tu historial`);
  commit();
}
function renderLista() {
  const T = totals(), pending = state.list.filter(i => !i.done), done = state.list.filter(i => i.done);
  $("subtitle").textContent = state.list.length ? `${pending.length} por comprar${done.length ? ` · ${done.length} en la cesta` : ""}` : "";
  let h = "";
  if (isIOS() && !isStandalone() && !state.tipClosed)
    h += `<div class="tip"><div><b>Instálala en tu iPhone</b>Pulsa Compartir y luego «Añadir a pantalla de inicio». Se abrirá como una app y funcionará sin conexión.</div><button id="tip-x" aria-label="Cerrar aviso">×</button></div>`;
  if (state.list.length) {
    h += `<div class="hero"><span class="lbl">Total estimado en Mercadona</span><span class="big">${eur(T.all)}</span>
      ${done.length ? `<span class="lbl">En la cesta: ${eur(T.cart)}</span>` : ""}
      <div class="seg" role="group" aria-label="Periodo"><button data-per="1" aria-pressed="${state.period === 1}">Semana</button><button data-per="4" aria-pressed="${state.period === 4}">Mes</button></div></div>`;
  }
  const hs = habituals();
  if (hs.length) {
    const due = hs.filter(x => x.due && !state.list.some(i => i.name === x.name));
    h += `<div><div class="group-h"><span>Lo que sueles comprar</span><button id="add-hab">Añadir habituales</button></div>
      <div class="chips">${hs.slice(0, 20).map(x => `<button class="chip ${state.list.some(i => i.name === x.name) ? "on" : ""}" data-hab="${esc(x.name)}">${esc(x.name)}</button>`).join("")}</div>
      ${due.length ? `<p class="foot">Hace tiempo que no compras: ${due.slice(0, 6).map(x => esc(x.name)).join(", ")}</p>` : ""}</div>`;
  }
  if (!state.list.length) {
    h += `<div class="empty"><div class="ill">🧺</div><h2>Tu lista está vacía</h2>
      <p>Busca entre miles de productos de Mercadona o crea la lista a partir de tu menú semanal.</p>
      <button class="btn primary block" id="e-search">Buscar productos</button>
      <button class="btn block" id="e-menu">Planificar el menú</button></div>`;
  } else {
    const groups = {};
    pending.forEach(i => (groups[sectionOf(i)] ??= []).push(i));
    Object.keys(groups).sort((a, b) => a.localeCompare(b, "es")).forEach(sec => {
      h += `<div><div class="group-h"><span>${esc(sec)}</span></div><div class="group">${groups[sec].map(i => itemRow(i, state.list.indexOf(i), T.k)).join("")}</div></div>`;
    });
    if (!pending.length) h += `<div class="empty"><div class="ill">✅</div><h2>Todo en la cesta</h2><p>Pulsa «Terminar compra» para guardarla en tu historial.</p></div>`;
    if (done.length) {
      h += `<div><div class="group-h"><span>En la cesta</span><button id="undo-all">Desmarcar</button></div><div class="group">${done.map(i => itemRow(i, state.list.indexOf(i), T.k)).join("")}</div>
        <p class="foot">Al terminar, Cesta guarda lo marcado para aprender tus compras habituales.</p></div>
        <button class="btn primary block" id="finish">Terminar compra</button>`;
    }
    h += `<button class="btn block" id="clear-list">Vaciar la lista</button>`;
  }
  const el = $("s-lista"); el.innerHTML = h;
  el.querySelector("#tip-x")?.addEventListener("click", () => { state.tipClosed = true; commit(); });
  el.querySelector("#e-search")?.addEventListener("click", () => openSearch());
  el.querySelector("#e-menu")?.addEventListener("click", () => showTab("menu"));
  el.querySelector("#add-hab")?.addEventListener("click", addHabituals);
  el.querySelector("#finish")?.addEventListener("click", finishShopping);
  el.querySelector("#undo-all")?.addEventListener("click", () => { state.list.forEach(i => i.done = false); commit(); });
  const clr = el.querySelector("#clear-list");
  clr?.addEventListener("click", () => {
    if (clr.dataset.sure) { state.list = []; commit(); toast("Lista vaciada"); }
    else { clr.dataset.sure = 1; clr.textContent = "Pulsa otra vez para vaciar"; clr.style.color = "var(--danger)"; }
  });
  el.querySelectorAll("[data-per]").forEach(b => b.onclick = () => { state.period = +b.dataset.per; commit(); });
  el.querySelectorAll("[data-hab]").forEach(b => b.onclick = () => { const h = state.hist[b.dataset.hab]; addItem(histEntry(b.dataset.hab, h), h.n || 1); commit(); });
  el.querySelectorAll("[data-ck]").forEach(c => c.onchange = () => { state.list[c.dataset.ck].done = c.checked; commit(); });
  el.querySelectorAll("[data-inc]").forEach(b => b.onclick = () => { state.list[b.dataset.inc].n++; commit(); });
  el.querySelectorAll("[data-dec]").forEach(b => b.onclick = () => { const i = state.list[b.dataset.dec]; i.n--; if (i.n < 1) { state.list.splice(b.dataset.dec, 1); toast(`Quitado: ${i.name}`); } commit(); });
  const pend = pending.length; $("badge-lista").hidden = !pend; $("badge-lista").textContent = pend;
}

// ---------- Buscador ----------
function openSearch() {
  openSheet("Añadir productos", `
    <div class="field">${SEARCH_SVG}<input id="q" type="search" placeholder="Leche, merluza, yogur griego…" autocomplete="off" enterkeyhint="search" aria-label="Buscar productos"></div>
    <div id="results"></div>`, body => {
    const q = body.querySelector("#q");
    const run = () => renderResults(q.value);
    q.addEventListener("input", run);
    q.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); const v = q.value.trim(); if (v) { addItem(v); save(); toast(`Añadido: ${v}`); q.value = ""; run(); } } });
    loadMerc().then(run);
    run(); setTimeout(() => q.focus(), 250);
  }, renderAll);
}
function resultRow(r) {
  const inList = state.list.find(i => i.name === r.name);
  return `<button class="rowi tap" data-add='${esc(JSON.stringify(r.entry))}'>
    <span class="grow"><span class="t">${esc(r.name)}</span><span class="s">${esc(r.sub)}${inList ? ` · en tu lista: ${inList.n}` : ""}</span></span>
    <span class="p">${r.price != null ? eur(r.price) : ""}</span><span class="icon-btn" aria-hidden="true">＋</span></button>`;
}
function renderResults(qraw) {
  const box = document.getElementById("results"); if (!box) return;
  const q = norm(qraw), words = q.split(/\s+/).filter(Boolean);
  let h = "";
  if (!words.length) {
    const hs = habituals().slice(0, 12);
    if (hs.length) h += `<div><div class="group-h"><span>Tus habituales</span></div><div class="group">${hs.map(x => resultRow({name: x.name, sub: x.pid ? x.unit : (GENBY[x.name]?.unit || ""), price: x.pid ? x.price : GENBY[x.name]?.m?.price, entry: histEntry(x.name, x)})).join("")}</div></div>`;
    const basics = ["Leche entera", "Huevos", "Pan de molde", "Barra de pan", "Plátanos", "Tomate", "Patatas", "Cebolla", "Pechuga de pollo", "Yogur natural", "Arroz", "Pasta (macarrones)"].map(n => GENBY[n]).filter(Boolean);
    h += `<div><div class="group-h"><span>Básicos</span></div><div class="group">${basics.map(g => resultRow({name: g.name, sub: `${g.unit} · ${g.m?.product || ""}`, price: g.m?.price, entry: g.name})).join("")}</div></div>`;
  } else {
    const hit = s => words.every(w => s.includes(w));
    const gens = GEN.filter(g => hit(norm(g.name))).slice(0, 6);
    const mercs = (MERC || []).filter(r => hit(r._n)).sort((a, b) => a.name.length - b.name.length).slice(0, 40);
    if (gens.length) h += `<div><div class="group-h"><span>Alimentos</span></div><div class="group">${gens.map(g => resultRow({name: g.name, sub: `${g.unit} · ${g.m?.product || "sin precio"}`, price: g.m?.price, entry: g.name})).join("")}</div>
      <p class="foot">El alimento genérico usa siempre la opción más barata por kilo o litro.</p></div>`;
    if (mercs.length) h += `<div><div class="group-h"><span>Productos de Mercadona</span></div><div class="group">${mercs.map(r => resultRow({name: r.name, sub: `${r.pack || r.cat} · ${r.ref.toLocaleString("es-ES")} €/${r.fmt}`, price: r.price, entry: {name: r.name, pid: r.pid, price: r.price, unit: r.pack || "unidad", sec: r.sec}})).join("")}</div></div>`;
    if (!MERC) h += `<p class="foot">Cargando el catálogo completo…</p>`;
    h += `<div class="group"><button class="rowi tap" data-add='${esc(JSON.stringify(qraw.trim()))}'><span class="grow"><span class="t">Añadir «${esc(qraw.trim())}»</span><span class="s">Como texto, sin precio</span></span><span class="icon-btn" aria-hidden="true">＋</span></button></div>`;
  }
  box.innerHTML = h;
  box.querySelectorAll("[data-add]").forEach(b => b.onclick = () => {
    const entry = JSON.parse(b.dataset.add); const it = addItem(entry); save();
    toast(`Añadido: ${it.name}${it.n > 1 ? ` (${it.n})` : ""}`); renderResults(qraw);
  });
}

// ---------- Recetas ----------
const recIngNames = r => (r.ingredientes || []).map(i => i.n);
const recHay = r => norm(r.nombre + " " + recIngNames(r).join(" "));
const recScore = (r, words) => words.filter(w => recHay(r).includes(w)).length;
function have(name) { const n = norm(name); return state.ings.some(g => { const x = norm(g); return n.includes(x) || x.includes(n); }) || state.list.some(i => norm(i.name) === n); }
let recCat = "Todas", recQuick = false, recShown = 30, recQuery = "";
function renderRecetas() {
  $("subtitle").textContent = `${REC.length} recetas caseras`;
  const cats = ["Todas", ...new Set(REC.map(r => r.categoria))];
  const words = state.ings.map(norm), qw = norm(recQuery).split(/\s+/).filter(Boolean);
  let rs = REC.filter(r => recCat === "Todas" || r.categoria === recCat);
  if (recQuick) rs = rs.filter(r => r.tiempo <= 30);
  if (qw.length) rs = rs.filter(r => qw.every(w => recHay(r).includes(w)));
  rs = rs.map(r => ({r, s: recScore(r, words)})).sort((a, b) => b.s - a.s || a.r.tiempo - b.r.tiempo).map(x => x.r);
  const el = $("s-recetas");
  el.innerHTML = `
    <div class="field">${SEARCH_SVG}<input id="rq" type="search" placeholder="Buscar receta o ingrediente" value="${esc(recQuery)}" autocomplete="off" aria-label="Buscar recetas"></div>
    <div><div class="group-h"><span>Lo que te apetece</span></div>
      <div class="chips wrap">${state.ings.map((g, ix) => `<button class="chip soft" data-ing="${ix}" aria-label="Quitar ${esc(g)}">${esc(g)} ✕</button>`).join("")}
      <form id="ing-form" style="display:flex;gap:6px"><input class="plain" id="ing-in" placeholder="Añadir: pollo, calabacín…" style="width:190px;padding:8px 12px;border-radius:999px" enterkeyhint="done" aria-label="Añadir ingrediente"></form></div>
      ${state.ings.length ? `<p class="foot">Las recetas que usan estos alimentos salen primero.</p>` : ""}</div>
    <div class="chips">${cats.map(c => `<button class="chip ${c === recCat ? "on" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("")}<button class="chip ${recQuick ? "on" : ""}" id="quick">⏱ 30 min o menos</button></div>
    <div class="rcards">${rs.slice(0, recShown).map(r => {
      const sc = recScore(r, words);
      return `<button class="rcard" data-rec="${r.id}"><span class="t">${esc(r.nombre)}</span>
        <span class="s">${r.tiempo} min · ${esc(r.dificultad)} · ${esc(r.categoria)}</span>
        ${sc ? `<span class="m">Con ${state.ings.filter(g => recHay(r).includes(norm(g))).map(esc).join(", ")}</span>` : ""}</button>`;
    }).join("") || `<div class="empty"><h2>Sin resultados</h2><p>Prueba con otro ingrediente o categoría.</p></div>`}</div>
    ${rs.length > recShown ? `<button class="btn block" id="more">Ver más (${rs.length - recShown})</button>` : ""}`;
  const rq = el.querySelector("#rq");
  rq.addEventListener("input", () => { recQuery = rq.value; recShown = 30; renderRecetas(); const n = $("rq"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); });
  el.querySelector("#ing-form").onsubmit = e => { e.preventDefault(); const v = el.querySelector("#ing-in").value; v.split(",").map(s => s.trim()).filter(Boolean).forEach(s => { if (!state.ings.some(g => norm(g) === norm(s))) state.ings.push(s); }); commit(); };
  el.querySelectorAll("[data-ing]").forEach(b => b.onclick = () => { state.ings.splice(b.dataset.ing, 1); commit(); });
  el.querySelectorAll("[data-cat]").forEach(b => b.onclick = () => { recCat = b.dataset.cat; recShown = 30; renderRecetas(); });
  el.querySelector("#quick").onclick = () => { recQuick = !recQuick; renderRecetas(); };
  el.querySelector("#more")?.addEventListener("click", () => { recShown += 30; renderRecetas(); });
  el.querySelectorAll("[data-rec]").forEach(b => b.onclick = () => openRecipe(b.dataset.rec));
}
function openRecipe(id, target) {
  const r = RECBY[id]; if (!r) return;
  const k = (state.menu.people || 2) / (r.raciones || 2);
  const missing = r.ingredientes.filter(i => !have(i.n) && !GENBY[i.n]?.pantry);
  let sel = target || null;
  const planGrid = () => `<div class="plan">${DAYS.map(([d, dn]) => `<span>${dn.slice(0, 3)}</span>${SLOTS.map(([s, sn]) => {
    const cur = state.menu.days?.[d]?.[s], taken = cur && cur !== id, mine = cur === id;
    return `<button data-plan="${d}|${s}" class="${mine ? "sel" : taken ? "taken" : ""}" aria-label="${dn} ${sn}">${mine ? "✓ " : ""}${sn}</button>`;
  }).join("")}`).join("")}</div>`;
  openSheet(r.nombre, `
    <div class="s" style="color:var(--muted);margin-top:-6px">${r.tiempo} min · ${esc(r.dificultad)} · ${esc(r.categoria)} · ${(r.momento || []).join(" y ")}</div>
    <div><div class="group-h"><span>Ingredientes para ${state.menu.people || 2}</span></div><div class="group ingl">${r.ingredientes.map(i => {
      const ok = have(i.n), pantry = GENBY[i.n]?.pantry;
      return `<div class="rowi"><span class="grow"><span class="t">${esc(i.n)}</span><span class="s">${esc(scaleAmount(i.a, k))}${pantry ? " · despensa" : ""}</span></span><span class="${ok ? "ok" : pantry ? "" : "miss"}" style="font-size:14px">${ok ? "✓ en lista" : pantry ? "" : "falta"}</span></div>`;
    }).join("")}</div></div>
    ${missing.length ? `<button class="btn primary block" id="r-miss">Añadir lo que falta a la lista (${missing.length})</button>` : ""}
    <div><div class="group-h"><span>Añadir al menú</span></div><div class="group" style="padding:12px 16px" id="plan-box">${planGrid()}</div>
      <p class="foot">Toca un hueco para poner esta receta. En amarillo, los que ya tienen otro plato.</p></div>
    <div><div class="group-h"><span>Preparación</span></div><div class="group" style="padding:14px 16px"><ol class="steps">${r.pasos.map(p => `<li>${esc(p)}</li>`).join("")}</ol></div></div>`,
  body => {
    body.querySelector("#r-miss")?.addEventListener("click", e => {
      missing.forEach(i => addItem(i.n, Math.max(1, Math.ceil(i.q * k - 0.15))));
      save(); e.target.disabled = true; e.target.textContent = "Añadido a la lista ✓"; toast(`${missing.length} ingredientes añadidos`);
    });
    const bindPlan = () => body.querySelectorAll("[data-plan]").forEach(b => b.onclick = () => {
      const [d, s] = b.dataset.plan.split("|");
      state.menu.days[d] ??= {};
      if (state.menu.days[d][s] === id) delete state.menu.days[d][s]; else state.menu.days[d][s] = id;
      save(); body.querySelector("#plan-box").innerHTML = planGrid(); bindPlan();
      if (sel) { closeSheet(); toast("Plato cambiado"); }
    });
    bindPlan();
  }, renderAll);
}
function scaleAmount(a, k) {
  if (k === 1 || !a) return a || "";
  const m = String(a).match(/^([\d.]+)\s*(.*)$/); if (!m) return a;
  const v = parseFloat(m[1]) * k; const r = v >= 10 ? Math.round(v / 5) * 5 : Math.round(v * 4) / 4;
  return `${String(r).replace(".", ",")} ${m[2]}`.trim();
}

// ---------- Menú semanal ----------
const menuRecipes = () => DAYS.flatMap(([d]) => SLOTS.map(([s]) => RECBY[state.menu.days?.[d]?.[s]]).filter(Boolean));
function menuNeeds() {
  const acc = {};
  menuRecipes().forEach(r => { const k = (state.menu.people || 2) / (r.raciones || 2); r.ingredientes.forEach(i => acc[i.n] = (acc[i.n] || 0) + i.q * k); });
  return acc;
}
function filteredPool() {
  const prefs = norm(state.menu.prefs);
  const avoid = [...prefs.matchAll(/sin ([a-z ]+?)(?:,|$| y )/g)].map(m => m[1].trim()).filter(Boolean);
  const map = {cerdo: ["lomo", "costilla", "chorizo", "bacon", "salchicha", "jamon"], carne: ["pollo", "pavo", "ternera", "cerdo", "lomo", "costilla", "chorizo", "bacon", "salchicha", "jamon", "carne", "conejo", "alitas", "muslos"], pescado: ["merluza", "salmon", "bacalao", "atun", "sardina", "gamba", "langostino", "calamar", "sepia", "mejillon"], marisco: ["gamba", "langostino", "calamar", "sepia", "mejillon"], gluten: ["pasta", "espagueti", "macarron", "fideo", "pan", "harina", "hojaldre", "tortillas de trigo", "cuscus", "galleta"], lactosa: ["leche", "nata", "queso", "yogur", "mantequilla", "mozzarella"], huevo: ["huevo"]};
  const words = avoid.flatMap(a => map[a] || [a]);
  const quick = /rapid|poco tiempo/.test(prefs);
  return REC.filter(r => !["Postres", "Desayunos"].includes(r.categoria) && (!quick || r.tiempo <= 40) && !words.some(w => recHay(r).includes(w)));
}
function autoMenu(redo) {
  if (!REC.length) return;
  if (redo) state.menu.days = {};
  const pool = filteredPool(), prefs = norm(state.menu.prefs), likes = state.ings.map(norm);
  const morefish = /mas pescado/.test(prefs), veg = /vegetarian|sin carne/.test(prefs);
  const used = new Set(menuRecipes().map(r => r.id));
  const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
  const lunch = shuffle(["Legumbres", "Pescado", "Arroces", "Legumbres", "Carne", "Pasta", morefish ? "Pescado" : veg ? "Verduras" : "Carne"]);
  const dinner = shuffle(["Huevos", "Verduras", "Pescado", "Sopas", "Ensaladas", veg ? "Huevos" : "Carne", "Verduras"]);
  DAYS.forEach(([d], ix) => [["comida", lunch[ix]], ["cena", dinner[ix]]].forEach(([s, cat]) => {
    if (state.menu.days?.[d]?.[s]) return;
    let c = pool.filter(r => r.momento.includes(s) && !used.has(r.id) && r.categoria === cat);
    if (!c.length) c = pool.filter(r => r.momento.includes(s) && !used.has(r.id));
    if (!c.length) return;
    const pick = c.map(r => ({r, w: recScore(r, likes) * 2 + Math.random() * 3})).sort((a, b) => b.w - a.w)[0].r;
    used.add(pick.id); state.menu.days[d] ??= {}; state.menu.days[d][s] = pick.id;
  }));
  const n = menuRecipes().length;
  toast(n < 14 ? `Menú con ${n} platos: no hay más recetas que cumplan tus preferencias` : "Menú de la semana listo");
  commit();
}
function menuToList() {
  const needs = menuNeeds();
  state.list = state.list.filter(i => !(i.src === "menu" && !i.done));
  let added = 0; const pantry = [];
  Object.entries(needs).forEach(([name, q]) => {
    if (GENBY[name]?.pantry) { pantry.push(name); return; }
    if (state.list.some(i => i.name === name && !i.done)) return;
    state.list.push({name, n: Math.max(1, Math.ceil(q - 0.15)), done: false, src: "menu"}); added++;
  });
  state.pantry = pantry;
  toast(`${added} productos añadidos a la lista`);
  commit();
}
function renderMenu() {
  const n = menuRecipes().length, needs = menuNeeds(), ppl = state.menu.people || 2;
  let cost = 0; Object.entries(needs).forEach(([name, q]) => { const p = GENBY[name]?.m?.price; if (p) cost += p * q; });
  $("subtitle").textContent = n ? `${n} de 14 platos planificados` : "Comida y cena de lunes a domingo";
  const todayKey = DAYS[(new Date().getDay() + 6) % 7][0];
  let h = `<div class="hero"><span class="lbl">Coste estimado de los ingredientes</span><span class="big">${eur(cost)}</span>
      <div class="kpis"><div><b>${eur(n ? cost / ppl / 7 : 0)}</b>por persona y día</div><div><b>${ppl}</b>${ppl === 1 ? "persona" : "personas"}</div></div></div>
    <div class="group">
      <div class="rowi"><span class="grow">Personas</span><div class="stepper"><button id="pp-dec" aria-label="Menos personas">−</button><span>${ppl}</span><button id="pp-inc" aria-label="Más personas">+</button></div></div>
      <div class="rowi"><input class="plain" id="prefs" value="${esc(state.menu.prefs)}" placeholder="Preferencias: sin cerdo, más pescado, poco tiempo…" aria-label="Preferencias del menú"></div>
    </div>
    <div class="btns"><button class="btn" id="m-auto">Rellenar huecos</button><button class="btn" id="m-redo">Rehacer todo</button></div>`;
  h += DAYS.map(([d, dn]) => `<div class="day"><div class="day-h"><span>${dn}</span>${d === todayKey ? `<span class="today">Hoy</span>` : ""}</div>${SLOTS.map(([s, sn]) => {
    const r = RECBY[state.menu.days?.[d]?.[s]];
    return `<div class="slot"><span class="when">${sn}</span>
      <button class="dish ${r ? "" : "empty"}" data-slot="${d}|${s}">${r ? `<span class="t">${esc(r.nombre)}</span><span class="s">${r.tiempo} min · ${esc(r.categoria)}</span>` : `<span class="t">+ Elegir plato</span>`}</button>
      ${r ? `<button class="mini" data-swap="${d}|${s}" aria-label="Cambiar por otro parecido">↻</button>` : ""}</div>`;
  }).join("")}</div>`).join("");
  h += `<button class="btn primary block" id="m-list" ${n ? "" : "disabled"}>Crear la lista de la compra</button>`;
  if (state.pantry?.length) h += `<div><div class="group-h"><span>Revisa tu despensa</span></div><div class="chips wrap">${state.pantry.map(p => `<button class="chip ${state.list.some(i => i.name === p) ? "on" : ""}" data-pan="${esc(p)}">${esc(p)} ${state.list.some(i => i.name === p) ? "✓" : "+"}</button>`).join("")}</div><p class="foot">Estos productos duran varias semanas, por eso no se añaden solos. Toca los que te falten.</p></div>`;
  if (n) h += `<button class="btn block" id="m-clear">Vaciar el menú</button>`;
  const el = $("s-menu"); el.innerHTML = h;
  el.querySelector("#pp-dec").onclick = () => { state.menu.people = Math.max(1, ppl - 1); commit(); };
  el.querySelector("#pp-inc").onclick = () => { state.menu.people = Math.min(12, ppl + 1); commit(); };
  el.querySelector("#prefs").onchange = e => { state.menu.prefs = e.target.value.trim(); save(); };
  el.querySelector("#m-auto").onclick = () => autoMenu(false);
  el.querySelector("#m-redo").onclick = () => autoMenu(true);
  el.querySelector("#m-list").onclick = menuToList;
  const mc = el.querySelector("#m-clear");
  mc?.addEventListener("click", () => { if (mc.dataset.sure) { state.menu.days = {}; commit(); } else { mc.dataset.sure = 1; mc.textContent = "Pulsa otra vez para vaciar"; mc.style.color = "var(--danger)"; } });
  el.querySelectorAll("[data-pan]").forEach(b => b.onclick = () => { if (!state.list.some(i => i.name === b.dataset.pan)) addItem(b.dataset.pan); commit(); });
  el.querySelectorAll("[data-slot]").forEach(b => b.onclick = () => openPicker(...b.dataset.slot.split("|")));
  el.querySelectorAll("[data-swap]").forEach(b => b.onclick = () => {
    const [d, s] = b.dataset.swap.split("|"), cur = RECBY[state.menu.days[d][s]], used = new Set(menuRecipes().map(r => r.id));
    const c = filteredPool().filter(r => r.momento.includes(s) && r.categoria === cur.categoria && !used.has(r.id));
    if (!c.length) { toast("No hay otra receta parecida"); return; }
    state.menu.days[d][s] = c[Math.floor(Math.random() * c.length)].id; commit();
  });
}
function openPicker(d, s) {
  const dn = DAYS.find(x => x[0] === d)[1], cur = state.menu.days?.[d]?.[s];
  openSheet(`${s === "comida" ? "Comida" : "Cena"} del ${dn.toLowerCase()}`, `
    <div class="field">${SEARCH_SVG}<input id="pq" type="search" placeholder="Buscar receta o ingrediente" autocomplete="off" aria-label="Buscar receta"></div>
    ${cur ? `<div class="btns"><button class="btn" id="p-view">Ver receta</button><button class="btn" id="p-del" style="color:var(--danger)">Quitar plato</button></div>` : ""}
    <div id="plist"></div>`, body => {
    const draw = () => {
      const qw = norm(body.querySelector("#pq").value).split(/\s+/).filter(Boolean), likes = state.ings.map(norm);
      let rs = REC.filter(r => r.momento.includes(s));
      if (qw.length) rs = rs.filter(r => qw.every(w => recHay(r).includes(w)));
      rs = rs.sort((a, b) => recScore(b, likes) - recScore(a, likes) || a.nombre.localeCompare(b.nombre, "es")).slice(0, 60);
      body.querySelector("#plist").innerHTML = `<div class="group">${rs.map(r => `<button class="rowi tap" data-pick="${r.id}"><span class="grow"><span class="t">${esc(r.nombre)}${r.id === cur ? " ✓" : ""}</span><span class="s">${r.tiempo} min · ${esc(r.categoria)}</span></span><span class="chev">›</span></button>`).join("") || `<div class="rowi">Sin resultados</div>`}</div>`;
      body.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => { state.menu.days[d] ??= {}; state.menu.days[d][s] = b.dataset.pick; save(); closeSheet(); });
    };
    body.querySelector("#pq").addEventListener("input", draw);
    body.querySelector("#p-del")?.addEventListener("click", () => { delete state.menu.days[d][s]; save(); closeSheet(); });
    body.querySelector("#p-view")?.addEventListener("click", () => { closeSheet(); openRecipe(cur); });
    draw();
  }, renderAll);
}

// ---------- Ajustes ----------
function renderAjustes() {
  $("subtitle").textContent = "";
  const trips = state.trips.length, upd = UPDATED ? new Date(UPDATED).toLocaleString("es-ES", {dateStyle: "long", timeStyle: "short"}) : "—";
  $("s-ajustes").innerHTML = `
    <div><div class="group-h"><span>Precios</span></div><div class="group">
      <div class="rowi"><span class="grow">Actualizados</span><span class="s" style="color:var(--muted)">${upd}</span></div>
      <div class="rowi"><span class="grow"><span class="t">Fuente</span><span class="s">Tienda online de Mercadona. Se actualizan solos cada semana. Pueden variar algo según tu tienda.</span></span></div>
    </div></div>
    <div><div class="group-h"><span>Tus datos</span></div><div class="group">
      <div class="rowi"><span class="grow">Compras registradas</span><span class="p">${trips}</span></div>
      <div class="rowi"><span class="grow">Productos en tu historial</span><span class="p">${Object.keys(state.hist).length}</span></div>
      <button class="rowi tap" id="exp"><span class="grow"><span class="t">Hacer copia de seguridad</span><span class="s">Guarda un archivo con tu lista, menú e historial</span></span><span class="chev">›</span></button>
      <label class="rowi tap" for="imp"><span class="grow"><span class="t">Restaurar copia</span><span class="s">Desde un archivo guardado antes</span></span><span class="chev">›</span></label>
      <input type="file" id="imp" accept="application/json,.json" hidden>
    </div><p class="foot">Tus datos se guardan solo en este móvil. Haz una copia de vez en cuando o si cambias de teléfono.</p></div>
    <div><div class="group-h"><span>Instalar en el iPhone</span></div><div class="group" style="padding:14px 16px">
      ${isStandalone() ? `<p style="margin:0">Cesta ya está instalada en tu pantalla de inicio.</p>` :
      `<ol class="steps"><li>Abre esta página en <b>Safari</b>.</li><li>Pulsa el botón <b>Compartir</b> (el cuadrado con la flecha).</li><li>Elige <b>Añadir a pantalla de inicio</b> y pulsa <b>Añadir</b>.</li></ol>`}
    </div></div>
    <div class="group">
      <button class="rowi tap" id="clr-hist"><span class="grow" style="color:var(--danger)">Borrar historial de compras</span></button>
      <button class="rowi tap" id="clr-all"><span class="grow" style="color:var(--danger)">Borrar todos los datos</span></button>
    </div>
    <p class="foot">Cesta · ${REC.length} recetas · ${GEN.length} alimentos con precio${MERC ? ` · ${MERC.length} productos en el catálogo` : ""}</p>`;
  const el = $("s-ajustes");
  el.querySelector("#exp").onclick = exportData;
  el.querySelector("#imp").onchange = e => importData(e.target.files[0]);
  const twice = (btn, txt, fn) => btn.onclick = () => { if (btn.dataset.sure) fn(); else { btn.dataset.sure = 1; btn.querySelector(".grow").textContent = txt; } };
  twice(el.querySelector("#clr-hist"), "Pulsa otra vez para borrar el historial", () => { state.hist = {}; state.trips = []; commit(); toast("Historial borrado"); });
  twice(el.querySelector("#clr-all"), "Pulsa otra vez para borrarlo todo", () => { state = defaultState(); state.tab = "ajustes"; commit(); toast("Datos borrados"); });
}
async function exportData() {
  const name = `cesta-copia-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([JSON.stringify(state, null, 1)], name, {type: "application/json"});
  try {
    if (navigator.canShare?.({files: [file]})) { await navigator.share({files: [file], title: "Copia de Cesta"}); return; }
  } catch (e) { if (e.name === "AbortError") return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function importData(f) {
  if (!f) return;
  f.text().then(t => {
    const d = JSON.parse(t);
    if (!d || d.v !== 1 || !Array.isArray(d.list)) throw new Error();
    state = {...defaultState(), ...d, tab: "ajustes"}; commit(); toast("Copia restaurada");
  }).catch(() => toast("Ese archivo no es una copia de Cesta"));
}

// ---------- Arranque ----------
function renderAll() {
  ({lista: renderLista, menu: renderMenu, recetas: renderRecetas, ajustes: renderAjustes})[state.tab]();
  const pend = state.list.filter(i => !i.done).length; $("badge-lista").hidden = !pend; $("badge-lista").textContent = pend;
}
Promise.all([
  fetch("data/precios.json").then(r => r.json()).then(d => { GEN = d.items; GENBY = Object.fromEntries(GEN.map(g => [g.name, g])); UPDATED = d.updated; }),
  fetch("data/recetas.json").then(r => r.json()).then(d => { REC = d; RECBY = Object.fromEntries(REC.map(r => [r.id, r])); }),
]).catch(() => toast("Sin conexión: usando los últimos datos guardados")).finally(() => showTab(state.tab || "lista"));
showTab(state.tab || "lista");

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").then(reg => {
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w?.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) toast("Nueva versión lista: se aplicará al volver a abrir Cesta"); });
    });
  }).catch(() => {});
}
