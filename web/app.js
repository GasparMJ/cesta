"use strict";
// ============================================================
// Cesta · lista de la compra con precios de Mercadona, menú
// semanal, recetario, compras anteriores y nutrición.
// Todo se guarda en el propio móvil.
// ============================================================

// ---------- Utilidades ----------
const $ = id => document.getElementById(id);
const eur = v => v.toLocaleString("es-ES", {style: "currency", currency: "EUR"});
const num = (v, d = 0) => Number(v).toLocaleString("es-ES", {maximumFractionDigits: d});
const norm = s => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const DAYS = [["lun", "Lunes"], ["mar", "Martes"], ["mie", "Miércoles"], ["jue", "Jueves"], ["vie", "Viernes"], ["sab", "Sábado"], ["dom", "Domingo"]];
const SLOTS = [["comida", "Comida"], ["cena", "Cena"]];
const SEARCH_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;
const img = (id, size = 96) => id ? `<img class="thumb" loading="lazy" alt="" src="https://prod-mercadona.imgix.net/images/${id}.jpg?fit=crop&h=${size}&w=${size}">` : `<span class="thumb ph" aria-hidden="true"></span>`;
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const fmtDate = iso => new Date(iso).toLocaleDateString("es-ES", {weekday: "short", day: "numeric", month: "long"});

// Colores por sección del súper y por tipo de receta
const COLORS = [
  [/fruta|verdura|ensalada/, "#4ade80"], [/carne|aves/, "#f87171"], [/pescado|marisco/, "#60a5fa"],
  [/huevo|leche|lacteo|yogur|postre/, "#facc15"], [/charcuter|queso/, "#fb923c"], [/panader|pan |cereal|galleta|desayuno/, "#e0a96d"],
  [/congelad/, "#67e8f9"], [/arroz|legumbre|pasta/, "#f59e0b"], [/conserva|caldo|sopa/, "#f472b6"],
  [/aceite|especia|salsa/, "#a3e635"], [/agua|refresco|zumo|bodega|cafe|cacao/, "#38bdf8"],
  [/limpieza|hogar|cuidado|higiene|bebe|maquillaje|fitoterapia/, "#a78bfa"], [/aperitivo|azucar|chocolate|dulce/, "#fb7185"],
];
const colorFor = name => { const n = norm(name); for (const [rx, c] of COLORS) if (rx.test(n)) return c; return "#94a3b8"; };
const dot = name => `<i class="dot" style="--c:${colorFor(name)}"></i>`;
const catPill = name => `<span class="cat" style="--c:${colorFor(name)}">${esc(name)}</span>`;

// ---------- Tema ----------
function applyTheme() {
  const t = state.theme || "dark";
  document.documentElement.dataset.theme = t;
  const dark = t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  $("theme-color").content = dark ? "#0f1318" : "#f3f6f5";
}

// ---------- Datos ----------
let GEN = [], GENBY = {}, UPDATED = null, REC = [], RECBY = {}, MERC = null, MERCBY = {}, mercLoading = null;
function loadMerc() {
  if (MERC) return Promise.resolve(MERC);
  return mercLoading ??= fetch("data/catalogo.json").then(r => r.json()).then(d => {
    MERC = d.rows.map(r => ({pid: r[0], name: r[1], pack: r[2], price: r[3], ref: r[4], fmt: r[5], aisle: r[6], sec: r[7] || r[6], shelf: r[8] || "", img: r[9] || "", _n: norm(r[1])}));
    MERCBY = Object.fromEntries(MERC.map(m => [m.pid, m]));
    return MERC;
  }).catch(() => { mercLoading = null; return []; });
}

// ---------- Estado (en el móvil) ----------
const KEY = "cesta-app-v1";
const defaultState = () => ({v: 1, tab: "lista", period: 1, list: [], hist: {}, trips: [], purchases: [],
  menu: {people: 2, prefs: "", days: {}}, ings: [], pantry: [], nut: {}, timers: [], tipClosed: false, theme: "dark"});
let state = defaultState();
try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) state = {...defaultState(), ...s}; } catch (e) {}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast("No se pudo guardar en el móvil"); } }
function commit() { save(); renderAll(); }

// ---------- Precios y nutrición ----------
const unitPrice = i => i.pid ? (i.price ?? null) : (GENBY[i.name]?.m?.price ?? null);
const sectionOf = i => i.sec || GENBY[i.name]?.m?.sec || "Otros";
const unitLabel = i => i.pid ? (i.unit || "unidad") : (GENBY[i.name]?.unit || "unidad");
const imgOf = i => i.img || GENBY[i.name]?.m?.img || "";
// Valores por 100 g: los que apunta el usuario o, si no, los de referencia del alimento genérico
function nutOf(name) {
  const own = state.nut[name];
  if (own) return {v: own, own: true};
  const g = GENBY[name]?.nut;
  return g ? {v: g, own: false} : null;
}
function gramsOf(ing) { // gramos de un ingrediente de receta
  const g = GENBY[ing.n]; if (!g) return 0;
  return (g.ref === "kg" || g.ref === "L") ? ing.q * g.qty * 1000 : ing.q * g.qty * (g.gud || 0);
}
const OILS = new Set(["Aceite de oliva virgen extra", "Aceite de girasol"]);
function recipeNut(r) { // por ración
  if (r._nut) return r._nut;
  const t = [0, 0, 0, 0], rac = r.raciones || 2;
  r.ingredientes.forEach(i => {
    const n = nutOf(i.n); if (!n) return;
    let g = gramsOf(i);
    // Aceite de freír o pochar: solo se come una parte. Hasta 15 ml por ración cuenta entero; del resto, un 15 %.
    if (OILS.has(i.n) && g > 15 * rac) g = 15 * rac + (g - 15 * rac) * 0.15;
    for (let k = 0; k < 4; k++) t[k] += n.v[k] * g / 100;
  });
  return r._nut = t.map(x => x / rac);
}

// ---------- Hoja inferior y avisos ----------
let sheetOnClose = null;
function openSheet(title, html, mount, onClose) {
  $("sheet-title").textContent = title;
  $("sheet-body").innerHTML = html;
  $("sheet-body").scrollTop = 0;
  $("sheet").hidden = false;
  document.body.style.overflow = "hidden";
  sheetOnClose = onClose || null;
  mount && mount($("sheet-body"));
}
function closeSheet() {
  if ($("sheet").hidden) return;
  $("sheet").hidden = true; document.body.style.overflow = "";
  const f = sheetOnClose; sheetOnClose = null; f && f();
}
$("sheet-close").onclick = closeSheet;
$("sheet-bg").onclick = closeSheet;
let toastTimer;
function toast(t) { const el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.hidden = true, 2400); }
function twice(btn, label, fn) { btn.addEventListener("click", () => { if (btn.dataset.sure) fn(); else { btn.dataset.sure = 1; (btn.querySelector(".lbl2") || btn).textContent = label; btn.classList.add("danger"); } }); }

// ---------- Navegación ----------
const TABS = {
  lista: {title: "Lista", action: "＋", label: "Añadir productos", run: () => openSearch()},
  menu: {title: "Menú", action: "✦", label: "Rellenar el menú", run: () => autoMenu(false)},
  recetas: {title: "Recetas"},
  compras: {title: "Compras"},
  ajustes: {title: "Ajustes"},
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
const productEntry = m => ({name: m.name, pid: m.pid, price: m.price, unit: m.pack || "unidad", sec: m.sec, img: m.img});
function totals(items = state.list) {
  const k = state.period; let all = 0, cart = 0;
  items.forEach(i => { const p = unitPrice(i); if (p != null) { all += p * i.n * k; if (i.done) cart += p * i.n * k; } });
  return {all, cart, k};
}
function itemRow(i, ix, k) {
  const p = unitPrice(i), g = GENBY[i.name];
  const sub = `${i.n > 1 ? i.n + " × " : ""}${unitLabel(i)}${k > 1 ? " · ×4 semanas" : ""}`;
  const prod = !i.pid && g?.m ? g.m.product : "";
  return `<div class="rowi ${i.done ? "done" : ""}">
    <input type="checkbox" class="check" id="c${ix}" data-ck="${ix}" ${i.done ? "checked" : ""} aria-label="Marcar ${esc(i.name)}">
    <button class="grow linkish" data-info="${ix}">${img(imgOf(i))}<span class="txt"><span class="t">${esc(i.name)}${i.src === "menu" ? `<span class="badge">menú</span>` : ""}</span><span class="s one">${esc(sub)}</span>${prod ? `<span class="s one">${esc(prod)}</span>` : ""}</span></button>
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
const histEntry = (name, h) => h.pid ? {name, pid: h.pid, price: h.price, unit: h.unit, sec: h.sec, img: h.img} : name;
function addHabituals() {
  let added = 0;
  habituals().filter(h => h.c >= 2 && (h.share >= 0.5 || h.due)).forEach(h => {
    if (!state.list.some(i => i.name === h.name)) { addItem(histEntry(h.name, h), h.n || 1); added++; }
  });
  toast(added ? `Añadidos ${added} productos habituales` : "Aún no hay habituales que añadir");
  commit();
}
// Guarda la compra: lo marcado o, si no hay nada marcado, toda la lista
function savePurchase() {
  const marked = state.list.filter(i => i.done);
  const bought = marked.length ? marked : state.list;
  if (!bought.length) return;
  const now = new Date().toISOString();
  const items = bought.map(i => ({name: i.name, n: i.n, price: unitPrice(i), unit: unitLabel(i), ...(i.pid ? {pid: i.pid, sec: i.sec} : {}), img: imgOf(i)}));
  const total = items.reduce((a, i) => a + (i.price || 0) * i.n, 0);
  state.purchases = [{id: Date.now().toString(36), date: now, items, total}, ...state.purchases].slice(0, 200);
  bought.forEach(i => {
    const h = state.hist[i.name] || {c: 0, first: now};
    state.hist[i.name] = {...h, c: h.c + 1, last: now, n: i.n, ...(i.pid ? {pid: i.pid, price: i.price, unit: i.unit, sec: i.sec, img: i.img} : {})};
  });
  state.trips = [...state.trips, now].slice(-52);
  state.list = state.list.filter(i => !bought.includes(i));
  toast(`Compra guardada (${eur(total)}). La tienes en «Compras».`);
  commit();
}
function renderLista() {
  const T = totals(), pending = state.list.filter(i => !i.done), done = state.list.filter(i => i.done);
  $("subtitle").textContent = state.list.length ? `${pending.length} por comprar${done.length ? ` · ${done.length} en la cesta` : ""}` : "";
  let h = `<button class="field fake" id="open-search">${SEARCH_SVG}<span>Añadir productos o ingredientes…</span></button>`;
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
      <p>Añade cualquier producto de Mercadona o ingrediente suelto con el buscador, o crea la lista a partir de tu menú semanal.</p>
      <button class="btn primary block" id="e-search">Añadir productos</button>
      <button class="btn block" id="e-browse">Explorar secciones de Mercadona</button>
      <button class="btn block" id="e-menu">Planificar el menú</button></div>`;
  } else {
    const groups = {};
    pending.forEach(i => (groups[sectionOf(i)] ??= []).push(i));
    Object.keys(groups).sort((a, b) => a.localeCompare(b, "es")).forEach(sec => {
      h += `<div><div class="group-h"><span>${dot(sec)}${esc(sec)}</span></div><div class="group">${groups[sec].map(i => itemRow(i, state.list.indexOf(i), T.k)).join("")}</div></div>`;
    });
    if (!pending.length) h += `<div class="empty"><div class="ill">✅</div><h2>Todo en la cesta</h2><p>Pulsa «Ya lo he comprado» para guardar la compra.</p></div>`;
    if (done.length) h += `<div><div class="group-h"><span>En la cesta</span><button id="undo-all">Desmarcar</button></div><div class="group">${done.map(i => itemRow(i, state.list.indexOf(i), T.k)).join("")}</div></div>`;
    h += `<div class="stack"><button class="btn primary block" id="bought">✓ Ya lo he comprado${done.length ? ` (${done.length})` : ""}</button>
      <p class="foot">${done.length ? "Se guardará lo marcado en «Compras» y se quitará de la lista." : "Se guardará toda la lista en «Compras». Si solo has comprado una parte, márcala antes."}</p></div>
      <button class="btn block ghost-danger" id="clear-list"><span class="lbl2">Vaciar la lista</span></button>`;
  }
  const el = $("s-lista"); el.innerHTML = h;
  el.querySelector("#open-search").onclick = () => openSearch();
  el.querySelector("#tip-x")?.addEventListener("click", () => { state.tipClosed = true; commit(); });
  el.querySelector("#e-search")?.addEventListener("click", () => openSearch());
  el.querySelector("#e-browse")?.addEventListener("click", () => openSearch("", true));
  el.querySelector("#e-menu")?.addEventListener("click", () => showTab("menu"));
  el.querySelector("#add-hab")?.addEventListener("click", addHabituals);
  el.querySelector("#bought")?.addEventListener("click", savePurchase);
  el.querySelector("#undo-all")?.addEventListener("click", () => { state.list.forEach(i => i.done = false); commit(); });
  const clr = el.querySelector("#clear-list"); if (clr) twice(clr, "Pulsa otra vez para vaciar", () => { state.list = []; commit(); toast("Lista vaciada"); });
  el.querySelectorAll("[data-per]").forEach(b => b.onclick = () => { state.period = +b.dataset.per; commit(); });
  el.querySelectorAll("[data-hab]").forEach(b => b.onclick = () => { const h = state.hist[b.dataset.hab]; addItem(histEntry(b.dataset.hab, h), h.n || 1); commit(); });
  el.querySelectorAll("[data-ck]").forEach(c => c.onchange = () => { state.list[c.dataset.ck].done = c.checked; commit(); });
  el.querySelectorAll("[data-inc]").forEach(b => b.onclick = () => { state.list[b.dataset.inc].n++; commit(); });
  el.querySelectorAll("[data-dec]").forEach(b => b.onclick = () => { const i = state.list[b.dataset.dec]; i.n--; if (i.n < 1) { state.list.splice(b.dataset.dec, 1); toast(`Quitado: ${i.name}`); } commit(); });
  el.querySelectorAll("[data-info]").forEach(b => b.onclick = () => openProduct(state.list[b.dataset.info]));
}

// ---------- Ficha de producto (precio y nutrición) ----------
function openProduct(i) {
  const g = GENBY[i.name], m = i.pid ? MERCBY[i.pid] : null;
  const p = unitPrice(i), n = nutOf(i.name);
  const refTxt = i.pid ? (m ? `${num(m.ref, 2)} €/${m.fmt}` : "") : (g?.m ? `${num(g.m.ref_price, 2)} €/${g.ref}` : "");
  const v = n?.v || ["", "", "", ""];
  openSheet(i.name, `
    <div class="pcard">${img(imgOf(i), 240)}<div><div class="big2">${p != null ? eur(p) : "Sin precio"}</div>
      <div class="s">${esc(unitLabel(i))}${refTxt ? " · " + esc(refTxt) : ""}</div>
      ${!i.pid && g?.m ? `<div class="s">Producto más barato equivalente: ${esc(g.m.product)}</div>` : ""}
      ${(g?.m?.url || i.pid) ? `<a class="s link" href="${esc(g?.m?.url || `https://tienda.mercadona.es/product/${i.pid}`)}" target="_blank" rel="noopener">Ver en Mercadona ↗</a>` : ""}</div></div>
    <div><div class="group-h"><span>Información nutricional (por 100 g o 100 ml)</span></div>
      <form class="group nutform" id="nf">
        ${[["kcal", "Calorías", "kcal"], ["p", "Proteínas", "g"], ["g", "Grasas", "g"], ["h", "Hidratos", "g"]].map(([k, l, u], ix) => `
          <label class="rowi"><span class="grow">${l}</span><input type="number" inputmode="decimal" step="0.1" min="0" name="${k}" value="${v[ix] === "" ? "" : v[ix]}" placeholder="—"><span class="u">${u}</span></label>`).join("")}
      </form>
      <p class="foot">${n ? (n.own ? "Valores apuntados por ti." : "Valores medios de referencia. Si tu producto trae otros en la etiqueta, cámbialos aquí.") : "Mercadona no publica estos datos. Apúntalos desde la etiqueta del envase."}</p></div>
    <div class="btns"><button class="btn primary" id="nf-save">Guardar valores</button>${n?.own ? `<button class="btn" id="nf-reset">Quitar los míos</button>` : `<span></span>`}</div>`,
  body => {
    body.querySelector("#nf-save").onclick = () => {
      const f = body.querySelector("#nf"), vals = ["kcal", "p", "g", "h"].map(k => parseFloat(String(f[k].value).replace(",", ".")));
      if (vals.some(x => isNaN(x) || x < 0)) { toast("Rellena los cuatro valores con números"); return; }
      state.nut[i.name] = vals; REC.forEach(r => delete r._nut); save(); toast("Valores guardados"); closeSheet();
    };
    body.querySelector("#nf-reset")?.addEventListener("click", () => { delete state.nut[i.name]; REC.forEach(r => delete r._nut); save(); toast("Se usan los valores de referencia"); closeSheet(); });
  }, renderAll);
}

// ---------- Buscador y secciones ----------
function openSearch(initial = "", browse = false) {
  openSheet("Añadir a la lista", `
    <div class="field">${SEARCH_SVG}<input id="q" type="search" placeholder="Producto o ingrediente: leche, sal, merluza…" autocomplete="off" enterkeyhint="done" aria-label="Buscar productos"></div>
    <div id="results"></div>`, body => {
    const q = body.querySelector("#q"); q.value = initial;
    let path = browse ? [] : null; // null = búsqueda; [] = secciones; [sec] = pasillos; [sec, pasillo] = productos
    const run = () => renderResults(q.value, path, p => { path = p; run(); $("sheet-body").scrollTop = 0; });
    q.addEventListener("input", () => { if (q.value) path = null; run(); });
    q.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); const v = q.value.trim(); if (v) { addItem(v); save(); toast(`Añadido: ${v}`); q.value = ""; run(); } } });
    loadMerc().then(run); run();
    if (!browse) setTimeout(() => q.focus(), 250);
  }, renderAll);
}
function resultRow(r) {
  const inList = state.list.find(i => i.name === r.name);
  return `<button class="rowi tap" data-add="${esc(JSON.stringify(r.entry))}">
    ${img(r.img)}<span class="grow"><span class="t">${esc(r.name)}</span><span class="s">${esc(r.sub)}</span>${inList ? `<span class="s inl">✓ En tu lista: ${inList.n}</span>` : ""}</span>
    <span class="p">${r.price != null ? eur(r.price) : ""}</span><span class="plus" aria-hidden="true">＋</span></button>`;
}
const genRow = g => resultRow({name: g.name, sub: `${g.unit} · ${g.m?.product || ""}`, price: g.m?.price, img: g.m?.img, entry: g.name});
const mercRow = m => resultRow({name: m.name, sub: `${m.pack || m.shelf}${m.fmt ? ` · ${num(m.ref, 2)} €/${m.fmt}` : ""}`, price: m.price, img: m.img, entry: productEntry(m)});
function renderResults(qraw, path, go) {
  const box = document.getElementById("results"); if (!box) return;
  const words = norm(qraw).split(/\s+/).filter(Boolean);
  let h = "";
  if (words.length) {
    const hit = s => words.every(w => s.includes(w));
    const gens = GEN.filter(g => hit(norm(g.name))).slice(0, 6);
    const mercs = (MERC || []).filter(r => hit(r._n)).sort((a, b) => a.name.length - b.name.length).slice(0, 60);
    h += `<div class="group"><button class="rowi tap" data-add="${esc(JSON.stringify(qraw.trim()))}"><span class="thumb ph txt" aria-hidden="true">Aa</span><span class="grow"><span class="t">Añadir «${esc(qraw.trim())}»</span><span class="s">Como ingrediente o producto suelto, sin precio</span></span><span class="plus" aria-hidden="true">＋</span></button></div>`;
    if (gens.length) h += `<div><div class="group-h"><span>Alimentos genéricos</span></div><div class="group">${gens.map(genRow).join("")}</div>
      <p class="foot">Usan siempre la opción más barata por kilo o litro y sirven para el menú y la nutrición.</p></div>`;
    if (mercs.length) h += `<div><div class="group-h"><span>Productos de Mercadona</span></div><div class="group">${mercs.map(mercRow).join("")}</div></div>`;
    if (!MERC) h += `<p class="foot">Cargando el catálogo completo…</p>`;
  } else if (path) {
    const all = MERC || [];
    if (!path.length) {
      const secs = {}; all.forEach(m => secs[m.sec] = (secs[m.sec] || 0) + 1);
      h += `<div><div class="group-h"><span>Secciones de Mercadona · ${num(all.length)} productos</span></div><div class="group">${Object.keys(secs).sort((a, b) => a.localeCompare(b, "es")).map(s => `<button class="rowi tap" data-go="${esc(s)}"><span class="grow"><span class="t">${dot(s)}${esc(s)}</span><span class="s">${secs[s]} productos</span></span><span class="chev">›</span></button>`).join("")}</div></div>`;
    } else if (path.length === 1) {
      const aisles = {}; all.filter(m => m.sec === path[0]).forEach(m => aisles[m.aisle] = (aisles[m.aisle] || 0) + 1);
      h += `<button class="back" data-up="1">‹ Secciones</button><div><div class="group-h"><span>${esc(path[0])}</span></div><div class="group">${Object.keys(aisles).map(a => `<button class="rowi tap" data-go="${esc(a)}"><span class="grow"><span class="t">${esc(a)}</span><span class="s">${aisles[a]} productos</span></span><span class="chev">›</span></button>`).join("")}</div></div>`;
    } else {
      const items = all.filter(m => m.sec === path[0] && m.aisle === path[1]);
      const shelves = {}; items.forEach(m => (shelves[m.shelf || "Otros"] ??= []).push(m));
      h += `<button class="back" data-up="1">‹ ${esc(path[0])}</button>` + Object.entries(shelves).map(([s, ms]) => `<div><div class="group-h"><span>${esc(s)}</span></div><div class="group">${ms.map(mercRow).join("")}</div></div>`).join("");
    }
    if (!MERC) h += `<p class="foot">Cargando el catálogo…</p>`;
  } else {
    h += `<div class="group"><button class="rowi tap" id="browse"><span class="thumb ph txt" aria-hidden="true">≡</span><span class="grow"><span class="t">Explorar secciones de Mercadona</span><span class="s">Todos los productos ordenados por pasillos</span></span><span class="chev">›</span></button></div>`;
    const hs = habituals().slice(0, 12);
    if (hs.length) h += `<div><div class="group-h"><span>Tus habituales</span></div><div class="group">${hs.map(x => x.pid ? mercRow(MERCBY[x.pid] || {name: x.name, pid: x.pid, pack: x.unit, price: x.price, ref: 0, fmt: "", img: x.img, sec: x.sec}) : (GENBY[x.name] ? genRow(GENBY[x.name]) : resultRow({name: x.name, sub: "", price: null, entry: x.name}))).join("")}</div></div>`;
    const basics = ["Leche entera", "Huevos", "Pan de molde", "Barra de pan", "Plátanos", "Tomate", "Patatas", "Cebolla", "Pechuga de pollo", "Yogur natural", "Arroz", "Pasta (macarrones)"].map(n => GENBY[n]).filter(Boolean);
    h += `<div><div class="group-h"><span>Básicos</span></div><div class="group">${basics.map(genRow).join("")}</div></div>`;
  }
  box.innerHTML = h;
  box.querySelector("#browse")?.addEventListener("click", () => go([]));
  box.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go([...path, b.dataset.go]));
  box.querySelectorAll("[data-up]").forEach(b => b.onclick = () => go(path.slice(0, -1)));
  box.querySelectorAll("[data-add]").forEach(b => b.onclick = () => {
    const it = addItem(JSON.parse(b.dataset.add)); save();
    toast(`Añadido: ${it.name}${it.n > 1 ? ` (${it.n})` : ""}`); renderResults(qraw, path, go);
  });
}

// ---------- Compras anteriores ----------
function renderCompras() {
  const ps = state.purchases, now = new Date();
  const month = ps.filter(p => { const d = new Date(p.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const spentMonth = month.reduce((a, p) => a + p.total, 0), avg = ps.length ? ps.reduce((a, p) => a + p.total, 0) / ps.length : 0;
  $("subtitle").textContent = ps.length ? `${ps.length} ${ps.length === 1 ? "compra guardada" : "compras guardadas"}` : "";
  let h = "";
  if (!ps.length) {
    h = `<div class="empty"><div class="ill">🧾</div><h2>Aún no hay compras</h2><p>Cuando termines de comprar, pulsa «Ya lo he comprado» en la lista. La compra quedará guardada aquí con su fecha y su importe, y podrás repetirla.</p><button class="btn primary block" id="go-list">Ir a la lista</button></div>`;
  } else {
    h += `<div class="hero"><span class="lbl">Gastado este mes</span><span class="big">${eur(spentMonth)}</span>
      <div class="kpis"><div><b>${month.length}</b>${month.length === 1 ? "compra" : "compras"} este mes</div><div><b>${eur(avg)}</b>de media por compra</div></div></div>`;
    const byMonth = {};
    ps.forEach(p => (byMonth[new Date(p.date).toLocaleDateString("es-ES", {month: "long", year: "numeric"})] ??= []).push(p));
    h += Object.entries(byMonth).map(([m, list]) => `<div><div class="group-h"><span>${esc(m)}</span><span>${eur(list.reduce((a, p) => a + p.total, 0))}</span></div><div class="group">${
      list.map(p => `<button class="rowi tap" data-pur="${p.id}"><span class="grow"><span class="t">${esc(fmtDate(p.date))}</span><span class="s one">${p.items.length} productos · ${esc(p.items.slice(0, 4).map(i => i.name).join(", "))}${p.items.length > 4 ? "…" : ""}</span></span><span class="p">${eur(p.total)}</span><span class="chev">›</span></button>`).join("")
    }</div></div>`).join("");
    h += `<p class="foot">Los importes son estimados con los precios de Mercadona del día en que guardaste cada compra.</p>`;
  }
  const el = $("s-compras"); el.innerHTML = h;
  el.querySelector("#go-list")?.addEventListener("click", () => showTab("lista"));
  el.querySelectorAll("[data-pur]").forEach(b => b.onclick = () => openPurchase(b.dataset.pur));
}
function openPurchase(id) {
  const p = state.purchases.find(x => x.id === id); if (!p) return;
  openSheet(fmtDate(p.date), `
    <div class="hero"><span class="lbl">${p.items.length} productos</span><span class="big">${eur(p.total)}</span></div>
    <div class="group">${p.items.map(i => `<div class="rowi">${img(i.img)}<span class="grow"><span class="t">${esc(i.name)}</span><span class="s">${i.n} × ${esc(i.unit || "")}</span></span><span class="p">${i.price != null ? eur(i.price * i.n) : "—"}</span></div>`).join("")}</div>
    <button class="btn primary block" id="rebuy">Volver a añadir todo a la lista</button>
    <button class="btn block ghost-danger" id="del-pur"><span class="lbl2">Borrar esta compra</span></button>`, body => {
    body.querySelector("#rebuy").onclick = () => {
      p.items.forEach(i => addItem(i.pid ? {name: i.name, pid: i.pid, price: MERCBY[i.pid]?.price ?? i.price, unit: i.unit, sec: i.sec, img: i.img} : i.name, i.n));
      save(); closeSheet(); toast(`${p.items.length} productos añadidos a la lista`); showTab("lista");
    };
    twice(body.querySelector("#del-pur"), "Pulsa otra vez para borrarla", () => { state.purchases = state.purchases.filter(x => x.id !== id); save(); closeSheet(); toast("Compra borrada"); });
  }, renderAll);
}

// ---------- Recetas ----------
const recIngNames = r => r.ingredientes.map(i => i.n).concat(r.otros || []);
const recHay = r => r._hay ??= norm(r.nombre + " " + recIngNames(r).join(" "));
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
  rs = rs.map(r => ({r, s: recScore(r, words)})).sort((a, b) => b.s - a.s || a.r.nombre.localeCompare(b.r.nombre, "es")).map(x => x.r);
  const el = $("s-recetas");
  el.innerHTML = `
    <div class="field">${SEARCH_SVG}<input id="rq" type="search" placeholder="Buscar receta o ingrediente" value="${esc(recQuery)}" autocomplete="off" aria-label="Buscar recetas"></div>
    <div><div class="group-h"><span>Lo que te apetece</span></div>
      <div class="chips wrap">${state.ings.map((g, ix) => `<button class="chip soft" data-ing="${ix}" aria-label="Quitar ${esc(g)}">${esc(g)} ✕</button>`).join("")}
      <form id="ing-form"><input class="plain pill" id="ing-in" placeholder="Añadir: pollo, calabacín…" enterkeyhint="done" aria-label="Añadir ingrediente"></form></div>
      ${state.ings.length ? `<p class="foot">Las recetas que usan estos alimentos salen primero.</p>` : ""}</div>
    <div class="chips">${cats.map(c => `<button class="chip ${c === recCat ? "on" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("")}<button class="chip ${recQuick ? "on" : ""}" id="quick">⏱ 30 min o menos</button></div>
    <p class="foot" style="margin-top:-8px">${rs.length} recetas</p>
    <div class="rcards">${rs.slice(0, recShown).map(r => {
      const n = recipeNut(r), sc = recScore(r, words);
      return `<button class="rcard" data-rec="${r.id}"><span class="t">${esc(r.nombre)}</span>
        ${catPill(r.categoria)}<span class="s">${r.tiempo} min · ${esc(r.dificultad)} · ${num(n[0])} kcal/ración</span>
        ${sc ? `<span class="m">Con ${state.ings.filter(g => recHay(r).includes(norm(g))).map(esc).join(", ")}</span>` : ""}</button>`;
    }).join("") || `<div class="empty"><h2>Sin resultados</h2><p>Prueba con otro ingrediente o categoría.</p></div>`}</div>
    ${rs.length > recShown ? `<button class="btn block" id="more">Ver más (${rs.length - recShown})</button>` : ""}`;
  const rq = el.querySelector("#rq");
  rq.addEventListener("input", () => { recQuery = rq.value; recShown = 30; renderRecetas(); const n = $("rq"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); });
  el.querySelector("#ing-form").onsubmit = e => { e.preventDefault(); el.querySelector("#ing-in").value.split(",").map(s => s.trim()).filter(Boolean).forEach(s => { if (!state.ings.some(g => norm(g) === norm(s))) state.ings.push(s); }); commit(); };
  el.querySelectorAll("[data-ing]").forEach(b => b.onclick = () => { state.ings.splice(b.dataset.ing, 1); commit(); });
  el.querySelectorAll("[data-cat]").forEach(b => b.onclick = () => { recCat = b.dataset.cat; recShown = 30; renderRecetas(); });
  el.querySelector("#quick").onclick = () => { recQuick = !recQuick; renderRecetas(); };
  el.querySelector("#more")?.addEventListener("click", () => { recShown += 30; renderRecetas(); });
  el.querySelectorAll("[data-rec]").forEach(b => b.onclick = () => openRecipe(b.dataset.rec));
}
function scaleAmount(a, k) {
  if (k === 1 || !a) return a || "";
  const m = String(a).match(/^([\d.]+)\s*(.*)$/); if (!m) return a;
  const v = parseFloat(m[1]) * k; const r = v >= 10 ? Math.round(v / 5) * 5 : Math.round(v * 4) / 4;
  return `${String(r).replace(".", ",")} ${m[2]}`.trim();
}
function openRecipe(id) {
  const r = RECBY[id]; if (!r) return;
  const ppl = state.menu.people || 2, k = batchK(r, ppl), forTxt = (r.raciones || 2) > 2 && k === 1 ? `salen ${r.raciones} raciones` : `para ${ppl}`;
  const missing = r.ingredientes.filter(i => !have(i.n) && !GENBY[i.n]?.pantry);
  const n = recipeNut(r);
  const planGrid = () => `<div class="plan">${DAYS.map(([d, dn]) => `<span>${dn.slice(0, 3)}</span>${SLOTS.map(([s, sn]) => {
    const cur = state.menu.days?.[d]?.[s], taken = cur && cur !== id, mine = cur === id;
    return `<button data-plan="${d}|${s}" class="${mine ? "sel" : taken ? "taken" : ""}" aria-label="${dn} ${sn}">${mine ? "✓ " : ""}${sn}</button>`;
  }).join("")}`).join("")}</div>`;
  const totalSteps = r.pasos.reduce((a, p) => a + (p.m || 0), 0);
  openSheet(r.nombre, `
    <div class="s" style="color:var(--muted);margin-top:-6px">${r.tiempo} min · ${esc(r.dificultad)} · ${esc(r.categoria)} · ${(r.momento || []).join(" y ")}</div>
    <div class="nutbar">${[["kcal", n[0], ""], ["proteína", n[1], " g"], ["grasa", n[2], " g"], ["hidratos", n[3], " g"]].map(([l, v, u]) => `<div><b>${num(v, l === "kcal" ? 0 : 1)}${u}</b>${l}</div>`).join("")}</div>
    <p class="foot" style="margin-top:-8px">Por ración, con valores medios de referencia o los que hayas apuntado.</p>
    <div><div class="group-h"><span>Ingredientes · ${forTxt}</span></div><div class="group ingl">${r.ingredientes.map(i => {
      const ok = have(i.n), pantry = GENBY[i.n]?.pantry;
      return `<div class="rowi">${img(GENBY[i.n]?.m?.img)}<span class="grow"><span class="t">${esc(i.n)}</span><span class="s">${esc(scaleAmount(i.a, k))}${pantry ? " · despensa" : ""}</span></span><span class="${ok ? "ok" : pantry ? "" : "miss"}" style="font-size:14px">${ok ? "✓ en lista" : pantry ? "" : "falta"}</span></div>`;
    }).join("")}${(r.otros || []).map(o => `<div class="rowi"><span class="thumb ph" aria-hidden="true"></span><span class="grow"><span class="t">${esc(o)}</span><span class="s">Búscalo en la tienda</span></span></div>`).join("")}</div></div>
    ${missing.length ? `<button class="btn primary block" id="r-miss">Añadir lo que falta a la lista (${missing.length})</button>` : ""}
    <div><div class="group-h"><span>Preparación${totalSteps ? ` · unos ${totalSteps} min de fuego u horno` : ""}</span></div><div class="group">${r.pasos.map((p, ix) => `
      <div class="rowi step"><span class="stepn">${ix + 1}</span><span class="grow">${esc(p.t)}</span>${p.m ? `<button class="timer-btn" data-tm="${ix}" aria-label="Temporizador de ${p.m} minutos">⏱ ${p.m}′</button>` : ""}</div>`).join("")}</div>
      <p class="foot">Toca ⏱ para poner un temporizador. Sigue contando aunque cambies de pantalla.</p></div>
    <div><div class="group-h"><span>Añadir al menú</span></div><div class="group" style="padding:12px 16px" id="plan-box">${planGrid()}</div>
      <p class="foot">Toca un hueco para poner esta receta. En amarillo, los que ya tienen otro plato.</p></div>`,
  body => {
    body.querySelector("#r-miss")?.addEventListener("click", e => {
      missing.forEach(i => addItem(i.n, Math.max(1, Math.ceil(i.q * k - 0.15))));
      save(); e.target.disabled = true; e.target.textContent = "Añadido a la lista ✓"; toast(`${missing.length} ingredientes añadidos`);
    });
    body.querySelectorAll("[data-tm]").forEach(b => b.onclick = () => { const p = r.pasos[b.dataset.tm]; startTimer(`${r.nombre}: paso ${+b.dataset.tm + 1}`, p.m); });
    const bindPlan = () => body.querySelectorAll("[data-plan]").forEach(b => b.onclick = () => {
      const [d, s] = b.dataset.plan.split("|");
      state.menu.days[d] ??= {};
      if (state.menu.days[d][s] === id) delete state.menu.days[d][s]; else state.menu.days[d][s] = id;
      save(); body.querySelector("#plan-box").innerHTML = planGrid(); bindPlan();
    });
    bindPlan();
  }, renderAll);
}

// ---------- Temporizadores de cocina ----------
let audioCtx = null;
function beep() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audioCtx.currentTime;
    for (let k = 0; k < 3; k++) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.0001, t0 + k * 0.45); g.gain.exponentialRampToValueAtTime(0.4, t0 + k * 0.45 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + k * 0.45 + 0.35);
      o.start(t0 + k * 0.45); o.stop(t0 + k * 0.45 + 0.4);
    }
  } catch (e) {}
  navigator.vibrate?.([300, 150, 300]);
}
function startTimer(label, mins) {
  try { audioCtx ??= new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume?.(); } catch (e) {} // iOS: desbloquear el sonido con el toque
  state.timers.push({id: Date.now().toString(36), label, end: Date.now() + mins * 60000}); save();
  toast(`Temporizador de ${mins} min en marcha`); renderTimers();
}
function renderTimers() {
  const bar = $("timers"), now = Date.now();
  if (!state.timers.length) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.innerHTML = state.timers.map(t => {
    const left = Math.max(0, Math.round((t.end - now) / 1000)), done = left === 0;
    return `<div class="tmr ${done ? "done" : ""}"><span class="tl">${esc(t.label)}</span><b>${done ? "¡Listo!" : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}</b><button data-tx="${t.id}" aria-label="Quitar temporizador">${done ? "OK" : "✕"}</button></div>`;
  }).join("");
  bar.querySelectorAll("[data-tx]").forEach(b => b.onclick = () => { state.timers = state.timers.filter(t => t.id !== b.dataset.tx); save(); renderTimers(); });
}
setInterval(() => {
  if (!state.timers.length) return;
  const now = Date.now();
  state.timers.forEach(t => { if (!t.rang && t.end <= now) { t.rang = true; save(); beep(); toast(`⏱ ${t.label}: ¡listo!`); } });
  renderTimers();
}, 1000);

// ---------- Menú semanal ----------
const batchK = (r, ppl = state.menu.people || 2) => (r.raciones || 2) > 2 ? Math.max(1, ppl / r.raciones) : ppl / (r.raciones || 2);
const menuRecipes = () => DAYS.flatMap(([d]) => SLOTS.map(([s]) => RECBY[state.menu.days?.[d]?.[s]]).filter(Boolean));
function menuNeeds() {
  const acc = {};
  menuRecipes().forEach(r => { const k = batchK(r); r.ingredientes.forEach(i => acc[i.n] = (acc[i.n] || 0) + i.q * k); });
  return acc;
}
function filteredPool() {
  const prefs = norm(state.menu.prefs);
  const avoid = [...prefs.matchAll(/sin ([a-z ]+?)(?:,|$| y )/g)].map(m => m[1].trim()).filter(Boolean);
  const map = {cerdo: ["lomo", "costilla", "chorizo", "bacon", "salchicha", "jamon"], carne: ["pollo", "pavo", "ternera", "cerdo", "lomo", "costilla", "chorizo", "bacon", "salchicha", "jamon", "carne", "conejo", "alitas", "muslos"], pescado: ["merluza", "salmon", "bacalao", "atun", "sardina", "gamba", "langostino", "calamar", "sepia", "mejillon", "lubina", "dorada", "rape"], marisco: ["gamba", "langostino", "calamar", "sepia", "mejillon"], gluten: ["pasta", "espagueti", "macarron", "fideo", "pan", "harina", "hojaldre", "tortillas de trigo", "cuscus", "galleta"], lactosa: ["leche", "nata", "queso", "yogur", "mantequilla", "mozzarella"], huevo: ["huevo"]};
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
  const rs = menuRecipes(), n = rs.length, needs = menuNeeds(), ppl = state.menu.people || 2;
  let cost = 0; Object.entries(needs).forEach(([name, q]) => { const p = GENBY[name]?.m?.price; if (p) cost += p * q; });
  const kcalDay = rs.reduce((a, r) => a + recipeNut(r)[0], 0) / 7;
  $("subtitle").textContent = n ? `${n} de 14 platos planificados` : "Comida y cena de lunes a domingo";
  const todayKey = DAYS[(new Date().getDay() + 6) % 7][0];
  let h = `<div class="hero"><span class="lbl">Coste estimado de los ingredientes</span><span class="big">${eur(cost)}</span>
      <div class="kpis"><div><b>${eur(n ? cost / ppl / 7 : 0)}</b>por persona y día</div><div><b>${n ? num(kcalDay) : 0} kcal</b>de media al día en comida y cena</div></div></div>
    <div class="group">
      <div class="rowi"><span class="grow">Personas</span><div class="stepper"><button id="pp-dec" aria-label="Menos personas">−</button><span>${ppl}</span><button id="pp-inc" aria-label="Más personas">+</button></div></div>
      <div class="rowi"><input class="plain" id="prefs" value="${esc(state.menu.prefs)}" placeholder="Preferencias: sin cerdo, más pescado, poco tiempo…" aria-label="Preferencias del menú"></div>
    </div>
    <div class="btns"><button class="btn" id="m-auto">Rellenar huecos</button><button class="btn" id="m-redo">Rehacer todo</button></div>`;
  h += DAYS.map(([d, dn]) => `<div class="day"><div class="day-h"><span>${dn}</span>${d === todayKey ? `<span class="today">Hoy</span>` : ""}</div>${SLOTS.map(([s, sn]) => {
    const r = RECBY[state.menu.days?.[d]?.[s]];
    return `<div class="slot"><span class="when">${sn}</span>
      <button class="dish ${r ? "" : "empty"}" data-slot="${d}|${s}">${r ? `<span class="t">${esc(r.nombre)}</span><span class="s">${dot(r.categoria)}${r.tiempo} min · ${esc(r.categoria)} · ${num(recipeNut(r)[0])} kcal</span>` : `<span class="t">+ Elegir plato</span>`}</button>
      ${r ? `<button class="mini" data-swap="${d}|${s}" aria-label="Cambiar por otro parecido">↻</button>` : ""}</div>`;
  }).join("")}</div>`).join("");
  h += `<button class="btn primary block" id="m-list" ${n ? "" : "disabled"}>Crear la lista de la compra</button>
    <button class="btn block" id="m-extra">Añadir otros productos a la lista</button>`;
  if (state.pantry?.length) h += `<div><div class="group-h"><span>Revisa tu despensa</span></div><div class="chips wrap">${state.pantry.map(p => `<button class="chip ${state.list.some(i => i.name === p) ? "on" : ""}" data-pan="${esc(p)}">${esc(p)} ${state.list.some(i => i.name === p) ? "✓" : "+"}</button>`).join("")}</div><p class="foot">Estos productos duran varias semanas, por eso no se añaden solos. Toca los que te falten.</p></div>`;
  if (n) h += `<button class="btn block ghost-danger" id="m-clear"><span class="lbl2">Vaciar el menú</span></button>`;
  const el = $("s-menu"); el.innerHTML = h;
  el.querySelector("#pp-dec").onclick = () => { state.menu.people = Math.max(1, ppl - 1); commit(); };
  el.querySelector("#pp-inc").onclick = () => { state.menu.people = Math.min(12, ppl + 1); commit(); };
  el.querySelector("#prefs").onchange = e => { state.menu.prefs = e.target.value.trim(); save(); };
  el.querySelector("#m-auto").onclick = () => autoMenu(false);
  el.querySelector("#m-redo").onclick = () => autoMenu(true);
  el.querySelector("#m-list").onclick = menuToList;
  el.querySelector("#m-extra").onclick = () => openSearch();
  const mc = el.querySelector("#m-clear"); if (mc) twice(mc, "Pulsa otra vez para vaciar", () => { state.menu.days = {}; commit(); });
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
    ${cur ? `<div class="btns"><button class="btn" id="p-view">Ver receta</button><button class="btn danger" id="p-del">Quitar plato</button></div>` : ""}
    <div id="plist"></div>`, body => {
    const draw = () => {
      const qw = norm(body.querySelector("#pq").value).split(/\s+/).filter(Boolean), likes = state.ings.map(norm);
      let rs = REC.filter(r => r.momento.includes(s));
      if (qw.length) rs = rs.filter(r => qw.every(w => recHay(r).includes(w)));
      rs = rs.sort((a, b) => recScore(b, likes) - recScore(a, likes) || a.nombre.localeCompare(b.nombre, "es")).slice(0, 80);
      body.querySelector("#plist").innerHTML = `<div class="group">${rs.map(r => `<button class="rowi tap" data-pick="${r.id}"><span class="grow"><span class="t">${esc(r.nombre)}${r.id === cur ? " ✓" : ""}</span><span class="s">${r.tiempo} min · ${esc(r.categoria)} · ${num(recipeNut(r)[0])} kcal</span></span><span class="chev">›</span></button>`).join("") || `<div class="rowi">Sin resultados</div>`}</div>`;
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
  const upd = UPDATED ? new Date(UPDATED).toLocaleString("es-ES", {dateStyle: "long", timeStyle: "short"}) : "—";
  const own = Object.keys(state.nut);
  $("s-ajustes").innerHTML = `
    <div><div class="group-h"><span>Apariencia</span></div><div class="group" style="padding:12px 16px">
      <div class="seg2" role="group" aria-label="Tema">${[["dark", "Oscuro"], ["light", "Claro"], ["auto", "Sistema"]].map(([k, l]) => `<button data-theme-set="${k}" aria-pressed="${(state.theme || "dark") === k}">${l}</button>`).join("")}</div>
    </div><p class="foot">«Sistema» sigue el modo claro u oscuro del iPhone. La barra de arriba del iPhone se ajusta al volver a abrir la app.</p></div>
    <div><div class="group-h"><span>Precios</span></div><div class="group">
      <div class="rowi"><span class="grow">Actualizados</span><span class="s" style="color:var(--muted)">${upd}</span></div>
      <div class="rowi"><span class="grow"><span class="t">Fuente</span><span class="s">Tienda online de Mercadona. Se actualizan solos cada lunes. Pueden variar algo según tu tienda.</span></span></div>
    </div></div>
    <div><div class="group-h"><span>Nutrición</span></div><div class="group">
      <div class="rowi"><span class="grow"><span class="t">Valores apuntados por ti</span><span class="s">${own.length ? esc(own.slice(0, 6).join(", ")) + (own.length > 6 ? "…" : "") : "Ninguno. Toca un producto de la lista para apuntar sus valores."}</span></span><span class="p">${own.length}</span></div>
    </div><p class="foot">Mercadona no publica calorías ni macronutrientes. Cesta usa valores medios de referencia para los alimentos básicos, y los tuyos cuando los apuntas desde la etiqueta.</p></div>
    <div><div class="group-h"><span>Tus datos</span></div><div class="group">
      <div class="rowi"><span class="grow">Compras guardadas</span><span class="p">${state.purchases.length}</span></div>
      <button class="rowi tap" id="exp"><span class="grow"><span class="t">Hacer copia de seguridad</span><span class="s">Guarda un archivo con tu lista, menú, compras y valores</span></span><span class="chev">›</span></button>
      <label class="rowi tap" for="imp"><span class="grow"><span class="t">Restaurar copia</span><span class="s">Desde un archivo guardado antes</span></span><span class="chev">›</span></label>
      <input type="file" id="imp" accept="application/json,.json" hidden>
    </div><p class="foot">Tus datos se guardan solo en este móvil. Haz una copia de vez en cuando o si cambias de teléfono.</p></div>
    <div><div class="group-h"><span>Instalar en el iPhone</span></div><div class="group" style="padding:14px 16px">
      ${isStandalone() ? `<p style="margin:0">Cesta ya está instalada en tu pantalla de inicio.</p>` :
      `<ol class="steps"><li>Abre esta página en <b>Safari</b>.</li><li>Pulsa el botón <b>Compartir</b> (el cuadrado con la flecha).</li><li>Elige <b>Añadir a pantalla de inicio</b> y pulsa <b>Añadir</b>.</li></ol>`}
    </div></div>
    <div class="group">
      <button class="rowi tap" id="clr-hist"><span class="grow danger-t lbl2">Borrar historial y compras guardadas</span></button>
      <button class="rowi tap" id="clr-all"><span class="grow danger-t lbl2">Borrar todos los datos</span></button>
    </div>
    <p class="foot">Cesta · ${REC.length} recetas · ${GEN.length} alimentos básicos${MERC ? ` · ${num(MERC.length)} productos de Mercadona` : ""}</p>`;
  const el = $("s-ajustes");
  el.querySelectorAll("[data-theme-set]").forEach(b => b.onclick = () => { state.theme = b.dataset.themeSet; applyTheme(); commit(); });
  el.querySelector("#exp").onclick = exportData;
  el.querySelector("#imp").onchange = e => importData(e.target.files[0]);
  twice(el.querySelector("#clr-hist"), "Pulsa otra vez para borrarlo", () => { state.hist = {}; state.trips = []; state.purchases = []; commit(); toast("Historial borrado"); });
  twice(el.querySelector("#clr-all"), "Pulsa otra vez para borrarlo todo", () => { state = defaultState(); state.tab = "ajustes"; commit(); toast("Datos borrados"); });
}
async function exportData() {
  const name = `cesta-copia-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([JSON.stringify(state, null, 1)], name, {type: "application/json"});
  try { if (navigator.canShare?.({files: [file]})) { await navigator.share({files: [file], title: "Copia de Cesta"}); return; } }
  catch (e) { if (e.name === "AbortError") return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function importData(f) {
  if (!f) return;
  f.text().then(t => {
    const d = JSON.parse(t);
    if (!d || d.v !== 1 || !Array.isArray(d.list)) throw new Error();
    state = {...defaultState(), ...d, tab: "ajustes"}; REC.forEach(r => delete r._nut); applyTheme(); commit(); toast("Copia restaurada");
  }).catch(() => toast("Ese archivo no es una copia de Cesta"));
}

// ---------- Arranque ----------
function renderAll() {
  ({lista: renderLista, menu: renderMenu, recetas: renderRecetas, compras: renderCompras, ajustes: renderAjustes})[state.tab]();
  const pend = state.list.filter(i => !i.done).length; $("badge-lista").hidden = !pend; $("badge-lista").textContent = pend;
  renderTimers();
}
if (!TABS[state.tab]) state.tab = "lista";
applyTheme();
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", applyTheme);
Promise.all([
  fetch("data/precios.json").then(r => r.json()).then(d => { GEN = d.items; GENBY = Object.fromEntries(GEN.map(g => [g.name, g])); UPDATED = d.updated; }),
  fetch("data/recetas.json").then(r => r.json()).then(d => { REC = d; RECBY = Object.fromEntries(REC.map(r => [r.id, r])); }),
]).catch(() => toast("Sin conexión: usando los últimos datos guardados")).finally(() => showTab(state.tab));
showTab(state.tab);
loadMerc().then(() => { if (state.tab === "ajustes") renderAjustes(); });

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").then(reg => {
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w?.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) toast("Nueva versión lista: se aplicará al volver a abrir Cesta"); });
    });
  }).catch(() => {});
}
