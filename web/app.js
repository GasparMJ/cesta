"use strict";
// ============================================================
// Cesta · lista de la compra con precios de Mercadona, despensa,
// menú semanal, recetario con modo cocina, compras guardadas,
// presupuesto, historial de precios y nutrición.
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
const SCAN_SVG = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8 8v8M11 8v8M14 8v8M17 8v8"/></svg>`;
const SEARCH_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;
const img = (id, size = 96) => id ? `<img class="thumb" loading="lazy" alt="" src="https://prod-mercadona.imgix.net/images/${id}.jpg?fit=crop&h=${size}&w=${size}">` : `<span class="thumb ph" aria-hidden="true"></span>`;
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const fmtDate = iso => new Date(iso).toLocaleDateString("es-ES", {weekday: "short", day: "numeric", month: "long"});
const fmtShort = iso => new Date(iso + (iso.length === 10 ? "T12:00" : "")).toLocaleDateString("es-ES", {day: "numeric", month: "short"});
const today = () => new Date().toISOString().slice(0, 10);
const daysTo = d => Math.round((new Date(d + "T12:00") - new Date(today() + "T12:00")) / 864e5);
const qtyTxt = n => Number.isInteger(n) ? String(n) : "≈ " + num(n, 1);

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
const nsBadge = ns => ns ? `<span class="ns ns-${ns}" title="Nutri-Score ${ns.toUpperCase()}">${ns.toUpperCase()}</span>` : "";

// ---------- Datos ----------
let GEN = [], GENBY = {}, UPDATED = null, REC = [], RECBY = {}, MERC = null, MERCBY = {}, EANBY = {}, mercLoading = null, HIST = null;
function loadMerc() {
  if (MERC) return Promise.resolve(MERC);
  return mercLoading ??= fetch("data/catalogo.json").then(r => r.json()).then(d => {
    MERC = d.rows.map(r => ({pid: r[0], name: r[1], pack: r[2], price: r[3], ref: r[4], fmt: r[5], aisle: r[6], sec: r[7] || r[6],
      shelf: r[8] || "", img: r[9] || "", prev: r[10] || 0, nut: r[11] || null, ns: r[12] || "", ean: r[13] || "", _n: norm(r[1])}));
    MERCBY = Object.fromEntries(MERC.map(m => [m.pid, m]));
    EANBY = Object.fromEntries(MERC.filter(m => m.ean).map(m => [m.ean, m]));
    return MERC;
  }).catch(() => { mercLoading = null; return []; });
}
const loadHist = () => HIST ? Promise.resolve(HIST) : fetch("data/historial.json").then(r => r.json()).then(d => HIST = d).catch(() => null);

// ---------- Estado (en el móvil) ----------
const KEY = "cesta-app-v1";
const defaultState = () => ({v: 1, tab: "lista", listView: "comprar", period: 1, list: [], hist: {}, trips: [], purchases: [],
  despensa: [], autoPantry: true, budget: {week: null, month: null}, diet: [], dietHide: false, comprasView: "compras", offNut: {}, eanMap: {},
  menu: {people: 2, prefs: "", days: {}}, ings: [], pantry: [], nut: {}, timers: [], tipClosed: false, theme: "dark"});
let state = defaultState();
try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.v === 1) state = {...defaultState(), ...s, budget: {...defaultState().budget, ...(s.budget || {})}}; } catch (e) {}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast("No se pudo guardar en el móvil"); } }
function commit() { save(); renderAll(); }

// ---------- Tema ----------
function applyTheme() {
  const t = state.theme || "dark";
  document.documentElement.dataset.theme = t;
  const dark = t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  $("theme-color").content = dark ? "#0f1318" : "#f3f6f5";
}

// ---------- Precios, bajadas y nutrición ----------
const unitPrice = i => i.pid ? (MERCBY[i.pid]?.price ?? i.price ?? null) : (GENBY[i.name]?.m?.price ?? null);
const sectionOf = i => i.sec || GENBY[i.name]?.m?.sec || "Otros";
const unitLabel = i => i.pid ? (i.unit || "unidad") : (GENBY[i.name]?.unit || "unidad");
const imgOf = i => i.img || GENBY[i.name]?.m?.img || "";
const pidOf = i => i.pid || GENBY[i.name]?.m?.pid || null;
function dropOf(i) { // {pct, prev} si el producto ha bajado de precio
  const m = MERCBY[pidOf(i)];
  return m?.prev ? {pct: Math.round((1 - m.price / m.prev) * 100), prev: m.prev, now: m.price} : null;
}
// Nutrición por 100 g: la tuya > la real de Open Food Facts > la de referencia del alimento básico
function nutInfo(name, pid) {
  if (state.nut[name]) return {v: state.nut[name], src: "own"};
  if (pid && state.offNut[pid]) return {v: state.offNut[pid].slice(0, 4), src: "off", ns: state.offNut[pid][4] || ""};
  const m = pid ? MERCBY[pid] : null;
  if (m?.nut) return {v: m.nut, src: "off", ns: m.ns};
  const g = GENBY[name];
  if (g?.real) return {v: g.real.slice(0, 4), src: "off", ns: g.real[4] || ""};
  if (g?.nut) return {v: g.nut, src: "ref"};
  return null;
}
function gramsOf(ing) {
  const g = GENBY[ing.n]; if (!g) return 0;
  return (g.ref === "kg" || g.ref === "L") ? ing.q * g.qty * 1000 : ing.q * g.qty * (g.gud || 0);
}
const OILS = new Set(["Aceite de oliva virgen extra", "Aceite de girasol"]);
function recipeNut(r) { // por ración
  if (r._nut) return r._nut;
  const t = [0, 0, 0, 0], rac = r.raciones || 2;
  r.ingredientes.forEach(i => {
    const n = nutInfo(i.n); if (!n) return;
    let g = gramsOf(i);
    // Aceite de freír o pochar: solo se come una parte. Hasta 15 ml por ración cuenta entero; del resto, un 15 %.
    if (OILS.has(i.n) && g > 15 * rac) g = 15 * rac + (g - 15 * rac) * 0.15;
    for (let k = 0; k < 4; k++) t[k] += n.v[k] * g / 100;
  });
  return r._nut = t.map(x => x / rac);
}
const resetNutCache = () => REC.forEach(r => delete r._nut);
const batchK = (r, ppl = state.menu.people || 2) => (r.raciones || 2) > 2 ? Math.max(1, ppl / r.raciones) : ppl / (r.raciones || 2);
function recipeCost(r, ppl = state.menu.people || 2) { // coste de los ingredientes para ppl personas
  const k = batchK(r, ppl);
  return r.ingredientes.reduce((a, i) => a + (GENBY[i.n]?.m?.price || 0) * i.q * k, 0);
}

// ---------- Alergias, intolerancias y dietas ----------
const MEATS = ["Pechuga de pollo", "Muslos de pollo", "Alitas de pollo", "Pechuga de pavo", "Carne picada mixta", "Lomo de cerdo", "Costillas de cerdo", "Filetes de ternera", "Ternera para guisar", "Conejo", "Chorizo", "Bacon", "Salchichas", "Jamón cocido", "Jamón serrano", "Caldo de pollo"];
const FISH = ["Salmón", "Merluza congelada", "Bacalao", "Atún en aceite", "Sardinas en lata"];
const SHELLFISH = ["Gambas congeladas", "Langostinos", "Calamares", "Mejillones frescos", "Sepia", "Mejillones en escabeche"];
const DAIRY = ["Leche entera", "Leche semidesnatada", "Nata para cocinar", "Mantequilla", "Yogur natural", "Queso rallado", "Queso curado", "Queso fresco", "Mozzarella", "Queso de cabra"];
const DIET = {
  gluten: {label: "Sin gluten", ings: ["Pan de molde", "Barra de pan", "Tortillas de trigo", "Masa de hojaldre", "Pan rallado", "Pasta (macarrones)", "Espaguetis", "Fideos", "Harina de trigo", "Cuscús", "Galletas María", "Cereales de desayuno", "Copos de avena", "Salsa de soja"],
    rx: /\b(pan|panes|harina|trigo|pasta|galleta|cereal|bolleria|pizza|rebozad|empanad|cerveza|cuscus|cous|espagueti|spaghetti|macarr|fideo|canelon|noqui|oblea|hojaldre|croissant|magdalena|bizcocho|tostada|biscote|picos|seitan|centeno|espelta|cebada|avena)/, not: /sin gluten/},
  lactosa: {label: "Sin lactosa", ings: DAIRY, rx: /\b(leche|queso|quesito|yogur|nata|mantequilla|helado|batido|natillas|flan|kefir|mozzarella|burrata|bechamel)/, not: /sin lactosa|bebida (de )?(soja|avena|almendra|arroz)|vegetal/},
  huevo: {label: "Sin huevo", ings: ["Huevos", "Mayonesa"], rx: /\b(huevo|mayonesa|tortilla de patata)/, not: /sin huevo/},
  frutos: {label: "Sin frutos secos", ings: ["Almendras", "Nueces"], rx: /\b(almendra|nuez|nueces|avellana|pistacho|anacardo|cacahuete|turron|praline)/, not: /sin frutos/},
  marisco: {label: "Sin marisco", ings: SHELLFISH, rx: /\b(gamba|langostino|calamar|mejillon|sepia|pulpo|almeja|berberecho|cangrejo|buey de mar|navaja|surimi|marisco)/},
  pescado: {label: "Sin pescado", ings: [...FISH, ...SHELLFISH], rx: /\b(merluza|salmon|bacalao|atun|sardina|anchoa|boqueron|lubina|dorada|rape|caballa|bonito|pescado|gamba|langostino|calamar|mejillon|sepia|pulpo|surimi)/},
  cerdo: {label: "Sin cerdo", ings: ["Lomo de cerdo", "Costillas de cerdo", "Chorizo", "Bacon", "Salchichas", "Jamón cocido", "Jamón serrano", "Carne picada mixta"], rx: /\b(cerdo|lomo|costilla|chorizo|bacon|salchich|jamon|panceta|morcilla|sobrasada|fuet|salchichon|mortadela|chopped|iberico)/},
  vegetariano: {label: "Vegetariano", ings: [...MEATS, ...FISH, ...SHELLFISH], rx: /\b(pollo|pavo|ternera|vacuno|cerdo|lomo|costilla|chorizo|bacon|salchich|jamon|carne|conejo|cordero|merluza|salmon|bacalao|atun|sardina|anchoa|gamba|langostino|calamar|mejillon|sepia|pescado|lubina|dorada|rape)/},
  vegano: {label: "Vegano", ings: [...MEATS, ...FISH, ...SHELLFISH, ...DAIRY, "Huevos", "Mayonesa", "Miel"], rx: /\b(pollo|pavo|ternera|vacuno|cerdo|jamon|carne|merluza|salmon|atun|gamba|pescado|leche|queso|yogur|nata|mantequilla|huevo|mayonesa|miel)/, not: /bebida (de )?(soja|avena|almendra|arroz)|vegetal|vegan/},
};
const activeDiets = () => (state.diet || []).filter(k => DIET[k]);
function recipeAllowed(r) {
  return activeDiets().every(k => { const d = DIET[k];
    return !r.ingredientes.some(i => d.ings.includes(i.n)) && !(r.otros || []).some(o => d.rx.test(norm(o)) && !(d.not && d.not.test(norm(o)))); });
}
function productWarnings(name) { // dietas que el producto parece no cumplir, deducido de su nombre (aproximado)
  const n = norm(name);
  return activeDiets().filter(k => { const d = DIET[k]; return d.rx.test(n) && !(d.not && d.not.test(n)); }).map(k => DIET[k].label.replace(/^Sin /, ""));
}

// ---------- Presupuesto ----------
function budgetBar(spent, budget, label) {
  if (!budget) return "";
  const pct = Math.min(100, spent / budget * 100), over = spent > budget, near = !over && pct >= 90;
  return `<div class="budget ${over ? "over" : near ? "near" : ""}"><div class="bar"><i style="width:${pct}%"></i></div>
    <span>${over ? `Te pasas ${eur(spent - budget)} del presupuesto ${label}` : `Te quedan ${eur(budget - spent)} de ${eur(budget)} ${label}`}</span></div>`;
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
function toast(t) { const el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => el.hidden = true, 2600); }
function twice(btn, label, fn) { btn.addEventListener("click", () => { if (btn.dataset.sure) fn(); else { btn.dataset.sure = 1; (btn.querySelector(".lbl2") || btn).textContent = label; btn.classList.add("danger"); } }); }

// ---------- Navegación ----------
const TABS = {
  lista: {title: "Lista", action: "＋", label: "Añadir productos", run: () => openSearch({target: state.listView === "casa" ? "pantry" : "list"})},
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
function toEntry(entry) {
  if (typeof entry !== "string") return entry;
  const q = entry.trim(); if (!q) return null;
  const g = GEN.find(x => norm(x.name) === norm(q));
  return {name: g ? g.name : q};
}
function addItem(entry, n = 1) {
  entry = toEntry(entry); if (!entry) return null;
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
  const p = unitPrice(i), g = GENBY[i.name], dr = dropOf(i), inHome = pantryQty(i.name);
  const sub = `${i.n > 1 ? i.n + " × " : ""}${unitLabel(i)}${k > 1 ? " · ×4 semanas" : ""}`;
  const prod = !i.pid && g?.m ? g.m.product : "";
  return `<div class="rowi ${i.done ? "done" : ""}">
    <input type="checkbox" class="check" id="c${ix}" data-ck="${ix}" ${i.done ? "checked" : ""} aria-label="Marcar ${esc(i.name)}">
    <button class="grow linkish" data-info="${ix}">${img(imgOf(i))}<span class="txt"><span class="t">${esc(i.name)}${i.src === "menu" ? `<span class="badge">menú</span>` : ""}${dr ? `<span class="badge drop">↓ ${dr.pct} %</span>` : ""}</span><span class="s one">${esc(sub)}${inHome ? ` · en casa: ${qtyTxt(inHome)}` : ""}</span>${prod ? `<span class="s one">${esc(prod)}</span>` : ""}</span></button>
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
    if (state.autoPantry) addPantry({name: i.name, ...(i.pid ? {pid: i.pid, unit: i.unit, sec: i.sec, img: i.img} : {})}, i.n);
  });
  state.trips = [...state.trips, now].slice(-52);
  state.list = state.list.filter(i => !bought.includes(i));
  toast(`Compra guardada (${eur(total)})${state.autoPantry ? " y pasada a tu despensa" : ""}`);
  commit();
}
function dropsList() { return (MERC || []).filter(m => m.prev); }
function renderLista() {
  const el = $("s-lista");
  const expiring = state.despensa.filter(p => p.exp && daysTo(p.exp) <= 3);
  let h = `<div class="seg2 big" role="group" aria-label="Vista"><button data-view="comprar" aria-pressed="${state.listView !== "casa"}">Por comprar${state.list.filter(i => !i.done).length ? ` · ${state.list.filter(i => !i.done).length}` : ""}</button><button data-view="casa" aria-pressed="${state.listView === "casa"}">En casa${expiring.length ? ` <span class="pip">${expiring.length}</span>` : state.despensa.length ? ` · ${state.despensa.length}` : ""}</button></div>`;
  if (state.listView === "casa") { el.innerHTML = h + pantryHTML(); bindLista(el); bindPantry(el); return; }

  const T = totals(), pending = state.list.filter(i => !i.done), done = state.list.filter(i => i.done);
  $("subtitle").textContent = state.list.length ? `${pending.length} por comprar${done.length ? ` · ${done.length} en la cesta` : ""}` : "";
  h += `<div class="searchrow"><button class="field fake" id="open-search">${SEARCH_SVG}<span>Añadir productos o ingredientes…</span></button><button class="scan-btn" id="scan-list" aria-label="Escanear código de barras">${SCAN_SVG}</button></div>`;
  if (isIOS() && !isStandalone() && !state.tipClosed)
    h += `<div class="tip"><div><b>Instálala en tu iPhone</b>Pulsa Compartir y luego «Añadir a pantalla de inicio». Se abrirá como una app y funcionará sin conexión.</div><button id="tip-x" aria-label="Cerrar aviso">×</button></div>`;
  if (expiring.length) h += `<button class="tip warn" id="go-casa"><div><b>${expiring.length === 1 ? "1 producto caduca" : `${expiring.length} productos caducan`} pronto</b>${expiring.slice(0, 3).map(p => esc(p.name)).join(", ")}. Mira qué cocinar con ${expiring.length === 1 ? "él" : "ellos"}.</div><span class="chev">›</span></button>`;
  if (state.list.length) {
    const budget = state.period === 4 ? (state.budget.month || (state.budget.week ? state.budget.week * 4 : null)) : state.budget.week;
    h += `<div class="hero"><span class="lbl">Total estimado en Mercadona</span><span class="big">${eur(T.all)}</span>
      ${done.length ? `<span class="lbl">En la cesta: ${eur(T.cart)}</span>` : ""}
      ${budgetBar(T.all, budget, state.period === 4 ? "del mes" : "de la semana")}
      <div class="seg" role="group" aria-label="Periodo"><button data-per="1" aria-pressed="${state.period === 1}">Semana</button><button data-per="4" aria-pressed="${state.period === 4}">Mes</button></div></div>`;
  }
  const drops = dropsList();
  if (drops.length) {
    const mine = drops.filter(m => state.list.some(i => pidOf(i) === m.pid) || Object.values(state.hist).some(x => x.pid === m.pid) || GEN.some(g => g.m?.pid === m.pid));
    h += `<button class="rowi tap deal" id="drops"><span class="thumb ph txt deal-ic" aria-hidden="true">↓</span><span class="grow"><span class="t">${drops.length} productos han bajado de precio</span><span class="s">${mine.length ? `${mine.length} de los que sueles comprar` : "Esta semana en Mercadona"}</span></span><span class="chev">›</span></button>`;
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
      <p class="foot">${done.length ? "Se guardará lo marcado en «Compras»" : "Se guardará toda la lista en «Compras»"}${state.autoPantry ? " y pasará a tu despensa" : ""}.${done.length ? "" : " Si solo has comprado una parte, márcala antes."}</p></div>
      <button class="btn block ghost-danger" id="clear-list"><span class="lbl2">Vaciar la lista</span></button>`;
  }
  el.innerHTML = h; bindLista(el);
  el.querySelector("#open-search").onclick = () => openSearch();
  el.querySelector("#scan-list").onclick = () => openScanner("list");
  el.querySelector("#tip-x")?.addEventListener("click", () => { state.tipClosed = true; commit(); });
  el.querySelector("#go-casa")?.addEventListener("click", () => { state.listView = "casa"; commit(); });
  el.querySelector("#drops")?.addEventListener("click", openDrops);
  el.querySelector("#e-search")?.addEventListener("click", () => openSearch());
  el.querySelector("#e-browse")?.addEventListener("click", () => openSearch({browse: true}));
  el.querySelector("#e-menu")?.addEventListener("click", () => showTab("menu"));
  el.querySelector("#add-hab")?.addEventListener("click", addHabituals);
  el.querySelector("#bought")?.addEventListener("click", savePurchase);
  el.querySelector("#undo-all")?.addEventListener("click", () => { state.list.forEach(i => i.done = false); commit(); });
  const clr = el.querySelector("#clear-list"); if (clr) twice(clr, "Pulsa otra vez para vaciar", () => { state.list = []; commit(); toast("Lista vaciada"); });
  el.querySelectorAll("[data-per]").forEach(b => b.onclick = () => { state.period = +b.dataset.per; commit(); });
  el.querySelectorAll("[data-hab]").forEach(b => b.onclick = () => { const x = state.hist[b.dataset.hab]; addItem(histEntry(b.dataset.hab, x), x.n || 1); commit(); });
  el.querySelectorAll("[data-ck]").forEach(c => c.onchange = () => { state.list[c.dataset.ck].done = c.checked; commit(); });
  el.querySelectorAll("[data-inc]").forEach(b => b.onclick = () => { state.list[b.dataset.inc].n++; commit(); });
  el.querySelectorAll("[data-dec]").forEach(b => b.onclick = () => { const i = state.list[b.dataset.dec]; i.n--; if (i.n < 1) { state.list.splice(b.dataset.dec, 1); toast(`Quitado: ${i.name}`); } commit(); });
  el.querySelectorAll("[data-info]").forEach(b => b.onclick = () => openProduct(state.list[b.dataset.info]));
}
function bindLista(el) { el.querySelectorAll("[data-view]").forEach(b => b.onclick = () => { state.listView = b.dataset.view; commit(); window.scrollTo(0, 0); }); }
function openDrops() {
  const drops = dropsList().map(m => ({m, pct: Math.round((1 - m.price / m.prev) * 100)}));
  const mineIds = new Set([...state.list.map(pidOf), ...Object.values(state.hist).map(x => x.pid), ...GEN.map(g => g.m?.pid)].filter(Boolean));
  const mine = drops.filter(d => mineIds.has(d.m.pid)).sort((a, b) => b.pct - a.pct);
  const rest = drops.filter(d => !mineIds.has(d.m.pid)).sort((a, b) => b.pct - a.pct);
  const row = d => resultRow({name: d.m.name, sub: `Antes ${eur(d.m.prev)} · −${d.pct} %`, price: d.m.price, img: d.m.img, entry: productEntry(d.m), ns: d.m.ns});
  openSheet("Bajadas de precio", `
    ${mine.length ? `<div><div class="group-h"><span>De lo que sueles comprar</span></div><div class="group" id="dl1">${mine.map(row).join("")}</div></div>` : ""}
    <div><div class="group-h"><span>${mine.length ? "Otras bajadas" : "Esta semana"}</span></div><div class="group" id="dl2">${rest.slice(0, 120).map(row).join("")}</div></div>
    <p class="foot">Comparado con el precio anterior de Mercadona o con la semana pasada. Toca un producto para añadirlo a la lista.</p>`,
  body => bindAdd(body, "list", () => openDrops()), renderAll);
}

// ---------- Despensa ----------
function pantryQty(name) { return state.despensa.filter(p => p.name === name).reduce((a, p) => a + p.n, 0); }
function addPantry(entry, n = 1, exp = null) {
  entry = toEntry(entry); if (!entry) return null;
  const ex = state.despensa.find(p => p.name === entry.name && (p.exp || null) === (exp || null));
  if (ex) { ex.n = Math.round((ex.n + n) * 100) / 100; return ex; }
  const it = {...entry, n, exp, added: today()};
  state.despensa.push(it); return it;
}
function usePantry(name, q) { // descuenta q unidades, primero lo que caduca antes
  let left = q;
  state.despensa.filter(p => p.name === name).sort((a, b) => (a.exp || "9999").localeCompare(b.exp || "9999")).forEach(p => {
    if (left <= 0) return; const take = Math.min(p.n, left); p.n = Math.round((p.n - take) * 100) / 100; left -= take;
  });
  state.despensa = state.despensa.filter(p => p.n > 0.04);
}
function expLabel(p) {
  if (!p.exp) return "sin fecha";
  const d = daysTo(p.exp);
  return d < 0 ? `caducó el ${fmtShort(p.exp)}` : d === 0 ? "caduca hoy" : d === 1 ? "caduca mañana" : `caduca el ${fmtShort(p.exp)} (${d} días)`;
}
function pantryHTML() {
  $("subtitle").textContent = state.despensa.length ? `${state.despensa.length} productos en casa` : "";
  let h = `<div class="searchrow"><button class="field fake" id="open-psearch">${SEARCH_SVG}<span>Añadir a la despensa…</span></button><button class="scan-btn" id="scan-pantry" aria-label="Escanear código de barras">${SCAN_SVG}</button></div>`;
  if (!state.despensa.length) {
    return h + `<div class="empty"><div class="ill">🏠</div><h2>Tu despensa está vacía</h2>
      <p>Apunta lo que tienes en casa y cuándo caduca. El menú lo usará primero y no te lo volverá a pedir en la lista.${state.autoPantry ? " Lo que compres se añade solo al pulsar «Ya lo he comprado»." : ""}</p>
      ${state.purchases.length ? `<button class="btn primary block" id="p-last">Añadir mi última compra</button>` : ""}</div>`;
  }
  const sorted = [...state.despensa].sort((a, b) => (a.exp || "9999").localeCompare(b.exp || "9999") || a.name.localeCompare(b.name, "es"));
  const groups = [["Caducados", p => p.exp && daysTo(p.exp) < 0], ["Caducan en 3 días o menos", p => p.exp && daysTo(p.exp) >= 0 && daysTo(p.exp) <= 3], ["Con fecha", p => p.exp && daysTo(p.exp) > 3], ["Sin fecha", p => !p.exp]];
  const soon = sorted.filter(p => p.exp && daysTo(p.exp) <= 3 && daysTo(p.exp) >= 0);
  if (soon.length) h += `<button class="btn block" id="p-cook">Ver recetas con lo que caduca antes</button>`;
  groups.forEach(([title, f]) => {
    const ps = sorted.filter(f); if (!ps.length) return;
    h += `<div><div class="group-h"><span>${title}</span></div><div class="group">${ps.map(p => {
      const ix = state.despensa.indexOf(p), d = p.exp ? daysTo(p.exp) : null;
      return `<div class="rowi"><button class="grow linkish" data-pinfo="${ix}">${img(imgOf(p))}<span class="txt"><span class="t">${esc(p.name)}</span><span class="s one ${d != null && d < 0 ? "bad" : d != null && d <= 3 ? "warn-t" : ""}">${qtyTxt(p.n)} × ${esc(unitLabel(p))} · ${expLabel(p)}</span></span></button>
        <div class="stepper"><button data-pdec="${ix}" aria-label="Quitar uno de ${esc(p.name)}">−</button><span>${qtyTxt(p.n)}</span><button data-pinc="${ix}" aria-label="Añadir uno de ${esc(p.name)}">+</button></div></div>`;
    }).join("")}</div></div>`;
  });
  return h + `<p class="foot">Toca un producto para poner la fecha de caducidad. Al cocinar en modo cocina puedes descontar lo que gastes.</p>`;
}
function bindPantry(el) {
  el.querySelector("#open-psearch")?.addEventListener("click", () => openSearch({target: "pantry"}));
  el.querySelector("#scan-pantry")?.addEventListener("click", () => openScanner("pantry"));
  el.querySelector("#p-cook")?.addEventListener("click", () => { recPantry = true; showTab("recetas"); });
  el.querySelector("#p-last")?.addEventListener("click", () => { const p = state.purchases[0]; p.items.forEach(i => addPantry(i.pid ? {name: i.name, pid: i.pid, unit: i.unit, sec: i.sec, img: i.img} : i.name, i.n)); commit(); toast("Última compra añadida a la despensa"); });
  el.querySelectorAll("[data-pinc]").forEach(b => b.onclick = () => { const p = state.despensa[b.dataset.pinc]; p.n = Math.floor(p.n) + 1; commit(); });
  el.querySelectorAll("[data-pdec]").forEach(b => b.onclick = () => { const p = state.despensa[b.dataset.pdec]; p.n = Math.ceil(p.n) - 1; if (p.n <= 0) { state.despensa.splice(b.dataset.pdec, 1); toast(`Quitado de la despensa: ${p.name}`); } commit(); });
  el.querySelectorAll("[data-pinfo]").forEach(b => b.onclick = () => openPantryItem(+b.dataset.pinfo));
}
function openPantryItem(ix) {
  const p = state.despensa[ix]; if (!p) return;
  openSheet(p.name, `
    <div class="pcard">${img(imgOf(p), 240)}<div><div class="big2">${qtyTxt(p.n)} × ${esc(unitLabel(p))}</div><div class="s">${expLabel(p)}</div></div></div>
    <div class="group">
      <label class="rowi"><span class="grow">Cantidad</span><input class="plain short" type="number" inputmode="decimal" step="0.5" min="0" id="pi-n" value="${p.n}"></label>
      <label class="rowi"><span class="grow">Caduca el</span><input class="plain short" type="date" id="pi-exp" value="${p.exp || ""}"></label>
    </div>
    <div class="btns"><button class="btn primary" id="pi-save">Guardar</button><button class="btn" id="pi-list">A la lista</button></div>
    <button class="btn block ghost-danger" id="pi-del"><span class="lbl2">Quitar de la despensa</span></button>`, body => {
    body.querySelector("#pi-save").onclick = () => {
      const n = parseFloat(String(body.querySelector("#pi-n").value).replace(",", "."));
      p.exp = body.querySelector("#pi-exp").value || null;
      if (!(n > 0)) state.despensa.splice(state.despensa.indexOf(p), 1); else p.n = n;
      save(); closeSheet(); toast("Despensa actualizada");
    };
    body.querySelector("#pi-list").onclick = () => { addItem(p.pid ? {name: p.name, pid: p.pid, unit: p.unit, sec: p.sec, img: p.img} : p.name); save(); toast(`Añadido a la lista: ${p.name}`); };
    twice(body.querySelector("#pi-del"), "Pulsa otra vez para quitarlo", () => { state.despensa.splice(state.despensa.indexOf(p), 1); save(); closeSheet(); });
  }, renderAll);
}

// ---------- Ficha de producto: precio, historial y nutrición ----------
function sparkline(dates, prices) {
  const pts = dates.map((d, ix) => [d, prices[ix]]).filter(x => x[1]);
  if (pts.length < 2) return `<p class="foot" style="margin:0">Aún no hay historial: Cesta guarda el precio cada semana y aquí verás cómo cambia.</p>`;
  const W = 300, H = 90, P = 8, vs = pts.map(x => x[1]), lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;
  const xy = pts.map((x, ix) => [P + ix * (W - 2 * P) / (pts.length - 1), H - P - (x[1] - lo) / span * (H - 2 * P - 14)]);
  const line = xy.map(p => p.map(v => v.toFixed(1)).join(",")).join(" ");
  const last = xy[xy.length - 1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución del precio">
    <polygon points="${P},${H - P} ${line} ${last[0].toFixed(1)},${H - P}" fill="var(--leaf-soft)"/>
    <polyline points="${line}" fill="none" stroke="var(--leaf)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="4" fill="var(--leaf)"/>
  </svg><div class="spark-l"><span>${fmtShort(pts[0][0])}</span><span>mín. ${eur(lo)} · máx. ${eur(hi)}</span><span>${fmtShort(pts[pts.length - 1][0])}</span></div>`;
}
function openProduct(i) {
  const g = GENBY[i.name], pid = pidOf(i), m = MERCBY[pid];
  const p = unitPrice(i), n = nutInfo(i.name, i.pid), dr = dropOf(i);
  const refTxt = i.pid ? (m ? `${num(m.ref, 2)} €/${m.fmt}` : "") : (g?.m ? `${num(g.m.ref_price, 2)} €/${g.ref}` : "");
  const v = n?.v || ["", "", "", ""];
  const srcTxt = !n ? "Sin datos. Apúntalos desde la etiqueta del envase." : n.src === "own" ? "Valores apuntados por ti." : n.src === "off" ? "Datos reales del producto, de Open Food Facts (base de datos abierta). Si no coinciden con tu etiqueta, cámbialos aquí." : "Valores medios de referencia. Si tu producto trae otros en la etiqueta, cámbialos aquí.";
  openSheet(i.name, `
    <div class="pcard">${img(imgOf(i), 240)}<div><div class="big2">${p != null ? eur(p) : "Sin precio"} ${dr ? `<span class="badge drop">↓ ${dr.pct} %</span>` : ""}</div>
      <div class="s">${esc(unitLabel(i))}${refTxt ? " · " + esc(refTxt) : ""}</div>
      ${dr ? `<div class="s">Antes: ${eur(dr.prev)} (precio del producto)</div>` : ""}
      ${!i.pid && g?.m ? `<div class="s">Producto más barato equivalente: ${esc(g.m.product)}</div>` : ""}
      ${pid ? `<a class="s link" href="${esc(g?.m?.url || `https://tienda.mercadona.es/product/${pid}`)}" target="_blank" rel="noopener">Ver en Mercadona ↗</a>` : ""}</div></div>
    ${pid ? `<div><div class="group-h"><span>Evolución del precio</span></div><div class="group" style="padding:12px 14px" id="hist">Cargando…</div></div>` : ""}
    <div><div class="group-h"><span>Nutrición por 100 g o 100 ml</span>${n?.ns ? `<span>Nutri-Score ${nsBadge(n.ns)}</span>` : ""}</div>
      <form class="group nutform" id="nf">
        ${[["kcal", "Calorías", "kcal"], ["p", "Proteínas", "g"], ["g", "Grasas", "g"], ["h", "Hidratos", "g"]].map(([k, l, u], ix) => `
          <label class="rowi"><span class="grow">${l}</span><input type="number" inputmode="decimal" step="0.1" min="0" name="${k}" value="${v[ix] === "" ? "" : v[ix]}" placeholder="—"><span class="u">${u}</span></label>`).join("")}
      </form>
      <p class="foot">${srcTxt}</p></div>
    <div class="btns"><button class="btn primary" id="nf-save">Guardar valores</button>${n?.src === "own" ? `<button class="btn" id="nf-reset">Quitar los míos</button>` : `<button class="btn" id="to-pantry">A la despensa</button>`}</div>`,
  body => {
    if (pid) loadHist().then(hh => { const box = body.querySelector("#hist"); if (!box) return; box.innerHTML = hh?.p?.[pid] ? sparkline(hh.dates, hh.p[pid]) : `<p class="foot" style="margin:0">Aún no hay historial de este producto.</p>`; });
    body.querySelector("#nf-save").onclick = () => {
      const f = body.querySelector("#nf"), vals = ["kcal", "p", "g", "h"].map(k => parseFloat(String(f[k].value).replace(",", ".")));
      if (vals.some(x => isNaN(x) || x < 0)) { toast("Rellena los cuatro valores con números"); return; }
      state.nut[i.name] = vals; resetNutCache(); save(); toast("Valores guardados"); closeSheet();
    };
    body.querySelector("#nf-reset")?.addEventListener("click", () => { delete state.nut[i.name]; resetNutCache(); save(); toast("Se usan los valores del producto"); closeSheet(); });
    body.querySelector("#to-pantry")?.addEventListener("click", () => { addPantry(i.pid ? {name: i.name, pid: i.pid, unit: i.unit, sec: i.sec, img: i.img} : i.name, 1); save(); toast(`Añadido a la despensa: ${i.name}`); });
  }, renderAll);
}

// ---------- Buscador y secciones ----------
let searchTarget = "list";
function openSearch(opts = {}) {
  searchTarget = opts.target || "list";
  openSheet(searchTarget === "pantry" ? "Añadir a la despensa" : "Añadir a la lista", `
    <div class="field">${SEARCH_SVG}<input id="q" type="search" placeholder="Producto o ingrediente: leche, sal, merluza…" autocomplete="off" enterkeyhint="done" aria-label="Buscar productos"></div>
    <div id="results"></div>`, body => {
    const q = body.querySelector("#q"); q.value = opts.initial || "";
    let path = opts.browse ? [] : null; // null = búsqueda; [] = secciones; [sec] = pasillos; [sec, pasillo] = productos
    const run = () => renderResults(q.value, path, p => { path = p; run(); $("sheet-body").scrollTop = 0; });
    q.addEventListener("input", () => { if (q.value) path = null; run(); });
    q.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); const v = q.value.trim(); if (v) { addTo(v); save(); toast(`Añadido: ${v}`); q.value = ""; run(); } } });
    loadMerc().then(run); run();
    if (!opts.browse) setTimeout(() => q.focus(), 250);
  }, renderAll);
}
const addTo = (entry, target = searchTarget) => target === "pantry" ? addPantry(entry, 1) : addItem(entry);
function resultRow(r) {
  const inList = searchTarget === "pantry" ? null : state.list.find(i => i.name === r.name);
  const home = pantryQty(r.name), warns = productWarnings(r.name);
  return `<button class="rowi tap" data-add="${esc(JSON.stringify(r.entry))}">
    ${img(r.img)}<span class="grow"><span class="t">${esc(r.name)} ${nsBadge(r.ns)}${warns.length ? `<span class="badge warnb">⚠ ${esc(warns.join(", "))}</span>` : ""}</span><span class="s">${esc(r.sub)}</span>${inList ? `<span class="s inl">✓ En tu lista: ${inList.n}</span>` : ""}${home ? `<span class="s inl">En casa: ${qtyTxt(home)}</span>` : ""}</span>
    <span class="p">${r.price != null ? eur(r.price) : ""}${r.prev ? `<s class="old">${eur(r.prev)}</s>` : ""}</span><span class="plus" aria-hidden="true">＋</span></button>`;
}
const genRow = g => resultRow({name: g.name, sub: `${g.unit} · ${g.m?.product || ""}`, price: g.m?.price, img: g.m?.img, entry: g.name, ns: g.real?.[4]});
const mercRow = m => resultRow({name: m.name, sub: `${m.pack || m.shelf}${m.fmt ? ` · ${num(m.ref, 2)} €/${m.fmt}` : ""}`, price: m.price, prev: m.prev, img: m.img, entry: productEntry(m), ns: m.ns});
function bindAdd(box, target, redraw) {
  box.querySelectorAll("[data-add]").forEach(b => b.onclick = () => {
    const it = addTo(JSON.parse(b.dataset.add), target); save();
    toast(`Añadido${target === "pantry" ? " a la despensa" : ""}: ${it.name}${it.n > 1 ? ` (${qtyTxt(it.n)})` : ""}`); redraw();
  });
}
function renderResults(qraw, path, go) {
  const box = document.getElementById("results"); if (!box) return;
  const words = norm(qraw).split(/\s+/).filter(Boolean);
  let h = "";
  if (words.length) {
    const hit = s => words.every(w => s.includes(w));
    const gens = GEN.filter(g => hit(norm(g.name))).slice(0, 6);
    const mercs = (MERC || []).filter(r => hit(r._n) && !(state.dietHide && productWarnings(r.name).length)).sort((a, b) => a.name.length - b.name.length).slice(0, 60);
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
      const items = all.filter(m => m.sec === path[0] && m.aisle === path[1] && !(state.dietHide && productWarnings(m.name).length));
      const shelves = {}; items.forEach(m => (shelves[m.shelf || "Otros"] ??= []).push(m));
      h += `<button class="back" data-up="1">‹ ${esc(path[0])}</button>` + Object.entries(shelves).map(([s, ms]) => `<div><div class="group-h"><span>${esc(s)}</span></div><div class="group">${ms.map(mercRow).join("")}</div></div>`).join("");
    }
    if (!MERC) h += `<p class="foot">Cargando el catálogo…</p>`;
  } else {
    h += `<div class="group"><button class="rowi tap" id="scan-row"><span class="thumb ph txt" aria-hidden="true">${SCAN_SVG}</span><span class="grow"><span class="t">Escanear código de barras</span><span class="s">Con la cámara, en casa o en la tienda</span></span><span class="chev">›</span></button><button class="rowi tap" id="browse"><span class="thumb ph txt" aria-hidden="true">≡</span><span class="grow"><span class="t">Explorar secciones de Mercadona</span><span class="s">Todos los productos ordenados por pasillos</span></span><span class="chev">›</span></button></div>`;
    const hs = habituals().slice(0, 12);
    if (hs.length) h += `<div><div class="group-h"><span>Tus habituales</span></div><div class="group">${hs.map(x => x.pid ? mercRow(MERCBY[x.pid] || {name: x.name, pid: x.pid, pack: x.unit, price: x.price, ref: 0, fmt: "", img: x.img, sec: x.sec}) : (GENBY[x.name] ? genRow(GENBY[x.name]) : resultRow({name: x.name, sub: "", price: null, entry: x.name}))).join("")}</div></div>`;
    const basics = ["Leche entera", "Huevos", "Pan de molde", "Barra de pan", "Plátanos", "Tomate", "Patatas", "Cebolla", "Pechuga de pollo", "Yogur natural", "Arroz", "Pasta (macarrones)"].map(n => GENBY[n]).filter(Boolean);
    h += `<div><div class="group-h"><span>Básicos</span></div><div class="group">${basics.map(genRow).join("")}</div></div>`;
  }
  box.innerHTML = h;
  box.querySelector("#browse")?.addEventListener("click", () => go([]));
  box.querySelector("#scan-row")?.addEventListener("click", () => { const t = searchTarget; closeSheet(); openScanner(t); });
  box.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go([...path, b.dataset.go]));
  box.querySelectorAll("[data-up]").forEach(b => b.onclick = () => go(path.slice(0, -1)));
  bindAdd(box, searchTarget, () => renderResults(qraw, path, go));
}

// ---------- Compras anteriores ----------
let statsRange = "3m", statsMonth = null;
function purchaseSection(i) { return i.sec || GENBY[i.name]?.m?.sec || (i.pid && MERCBY[i.pid]?.sec) || "Otros"; }
function renderCompras() {
  const ps = state.purchases;
  $("subtitle").textContent = ps.length ? `${ps.length} ${ps.length === 1 ? "compra guardada" : "compras guardadas"}` : "";
  const el = $("s-compras");
  if (!ps.length) {
    el.innerHTML = `<div class="empty"><div class="ill">🧾</div><h2>Aún no hay compras</h2><p>Cuando termines de comprar, pulsa «Ya lo he comprado» en la lista. La compra quedará guardada aquí con su fecha y su importe, podrás repetirla y verás tus estadísticas de gasto.</p><button class="btn primary block" id="go-list">Ir a la lista</button></div>`;
    el.querySelector("#go-list").addEventListener("click", () => showTab("lista"));
    return;
  }
  const view = state.comprasView === "stats" ? "stats" : "compras";
  let h = `<div class="seg2 big" role="group" aria-label="Vista"><button data-cv="compras" aria-pressed="${view === "compras"}">Compras</button><button data-cv="stats" aria-pressed="${view === "stats"}">Estadísticas</button></div>`;
  h += view === "stats" ? statsHTML() : comprasListHTML();
  el.innerHTML = h;
  el.querySelectorAll("[data-cv]").forEach(b => b.onclick = () => { state.comprasView = b.dataset.cv; commit(); window.scrollTo(0, 0); });
  el.querySelectorAll("[data-pur]").forEach(b => b.onclick = () => openPurchase(b.dataset.pur));
  el.querySelectorAll("[data-range]").forEach(b => b.onclick = () => { statsRange = b.dataset.range; renderCompras(); });
  el.querySelectorAll("[data-mb]").forEach(b => b.onclick = () => { statsMonth = b.dataset.mb; renderCompras(); });
}
function comprasListHTML() {
  const ps = state.purchases, now = new Date();
  const month = ps.filter(p => { const d = new Date(p.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const spentMonth = month.reduce((a, p) => a + p.total, 0), avg = ps.reduce((a, p) => a + p.total, 0) / ps.length;
  const monthBudget = state.budget.month || (state.budget.week ? state.budget.week * 4.33 : null);
  let h = `<div class="hero"><span class="lbl">Gastado este mes</span><span class="big">${eur(spentMonth)}</span>
      ${budgetBar(spentMonth, monthBudget, "del mes")}
      <div class="kpis"><div><b>${month.length}</b>${month.length === 1 ? "compra" : "compras"} este mes</div><div><b>${eur(avg)}</b>de media por compra</div></div></div>`;
  const byMonth = {};
  ps.forEach(p => (byMonth[new Date(p.date).toLocaleDateString("es-ES", {month: "long", year: "numeric"})] ??= []).push(p));
  h += Object.entries(byMonth).map(([m, list]) => `<div><div class="group-h"><span>${esc(m)}</span><span>${eur(list.reduce((a, p) => a + p.total, 0))}</span></div><div class="group">${
    list.map(p => `<button class="rowi tap" data-pur="${p.id}"><span class="grow"><span class="t">${esc(fmtDate(p.date))}</span><span class="s one">${p.items.length} productos · ${esc(p.items.slice(0, 4).map(i => i.name).join(", "))}${p.items.length > 4 ? "…" : ""}</span></span><span class="p">${eur(p.total)}</span><span class="chev">›</span></button>`).join("")
  }</div></div>`).join("");
  return h + `<p class="foot">Los importes son estimados con los precios de Mercadona del día en que guardaste cada compra.${monthBudget ? "" : " Puedes poner un presupuesto en Ajustes."}</p>`;
}
const monthKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthName = (k, opt = {month: "short"}) => new Date(k + "-15T12:00").toLocaleDateString("es-ES", opt).replace(".", "");
function statsHTML() {
  const ps = state.purchases, now = new Date();
  const from = {"1m": new Date(now.getFullYear(), now.getMonth(), 1), "3m": new Date(now.getFullYear(), now.getMonth() - 2, 1), "12m": new Date(now.getFullYear(), now.getMonth() - 11, 1), "all": new Date(0)}[statsRange];
  const inRange = ps.filter(p => new Date(p.date) >= from);
  const spent = inRange.reduce((a, p) => a + p.total, 0);
  const firstDate = inRange.length ? new Date(Math.min(...inRange.map(p => +new Date(p.date)))) : now;
  const weeks = Math.max(1, (now - (statsRange === "all" ? firstDate : from)) / (7 * 864e5));
  let h = `<div class="seg2" role="group" aria-label="Periodo">${[["1m", "Este mes"], ["3m", "3 meses"], ["12m", "12 meses"], ["all", "Todo"]].map(([k, l]) => `<button data-range="${k}" aria-pressed="${statsRange === k}">${l}</button>`).join("")}</div>`;
  h += `<div class="hero"><span class="lbl">Gastado ${({"1m": "este mes", "3m": "en los últimos 3 meses", "12m": "en los últimos 12 meses", "all": "en total"})[statsRange]}</span><span class="big">${eur(spent)}</span>
    <div class="kpis"><div><b>${inRange.length}</b>${inRange.length === 1 ? "compra" : "compras"}</div><div><b>${eur(inRange.length ? spent / inRange.length : 0)}</b>por compra</div><div><b>${eur(spent / weeks)}</b>por semana</div></div></div>`;
  // Gasto por mes (últimos 6 meses)
  const months = Array.from({length: 6}, (_, k) => monthKey(new Date(now.getFullYear(), now.getMonth() - 5 + k, 1)));
  const perMonth = months.map(k => ({k, v: ps.filter(p => monthKey(new Date(p.date)) === k).reduce((a, p) => a + p.total, 0), n: ps.filter(p => monthKey(new Date(p.date)) === k).length}));
  const budgetM = state.budget.month || (state.budget.week ? state.budget.week * 4.33 : null);
  const sel = perMonth.find(m => m.k === statsMonth) || perMonth[perMonth.length - 1];
  const maxV = Math.max(...perMonth.map(m => m.v), budgetM || 0, 1);
  const W = 320, H = 150, B = 22, T = 14, bw = 30, gap = (W - bw * 6) / 6;
  const y = v => H - B - (v / maxV) * (H - B - T);
  h += `<div><div class="group-h"><span>Gasto por mes</span></div><div class="group chartbox">
    <p class="chart-cap"><b>${eur(sel.v)}</b> en ${monthName(sel.k, {month: "long", year: "numeric"})} · ${sel.n} ${sel.n === 1 ? "compra" : "compras"}${budgetM ? ` · presupuesto ${eur(budgetM)}` : ""}</p>
    <svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Gasto por mes en los últimos 6 meses">
      <line x1="0" x2="${W}" y1="${H - B}" y2="${H - B}" stroke="var(--line)" stroke-width="1"/>
      ${budgetM ? `<line x1="0" x2="${W}" y1="${y(budgetM).toFixed(1)}" y2="${y(budgetM).toFixed(1)}" stroke="var(--muted)" stroke-width="1" stroke-dasharray="4 4"/>` : ""}
      ${perMonth.map((m, ix) => { const x = gap / 2 + ix * (bw + gap), top = y(m.v), on = m.k === sel.k, over = budgetM && m.v > budgetM;
        return `<g data-mb="${m.k}" class="barg" role="button" tabindex="0" aria-label="${monthName(m.k, {month: "long"})}: ${eur(m.v)}">
          <rect x="${(x - gap / 2).toFixed(1)}" y="0" width="${(bw + gap).toFixed(1)}" height="${H}" fill="transparent"/>
          ${m.v ? `<path d="M${x},${H - B} V${(top + 4).toFixed(1)} q0,-4 4,-4 h${bw - 8} q4,0 4,4 V${H - B} Z" fill="${over ? "var(--danger)" : "var(--leaf)"}" opacity="${on ? 1 : 0.45}"/>` : ""}
          <text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle" class="ax ${on ? "on" : ""}">${monthName(m.k)}</text></g>`; }).join("")}
    </svg>
    <details class="tbl"><summary>Ver como tabla</summary><table>${perMonth.map(m => `<tr><td>${monthName(m.k, {month: "long", year: "numeric"})}</td><td>${m.n}</td><td>${eur(m.v)}</td></tr>`).join("")}</table></details>
  </div><p class="foot">Toca un mes para ver su importe.${budgetM ? " La línea discontinua es tu presupuesto mensual; en rojo, los meses que lo superan." : ""}</p></div>`;
  // Por sección
  const bySec = {}, byProd = {};
  inRange.forEach(p => p.items.forEach(i => {
    const v = (i.price || 0) * i.n; if (!v) return;
    const sec = purchaseSection(i); bySec[sec] = (bySec[sec] || 0) + v;
    const pr = byProd[i.name] ??= {v: 0, c: 0, img: i.img}; pr.v += v; pr.c += 1;
  }));
  const secs = Object.entries(bySec).sort((a, b) => b[1] - a[1]), totalSec = secs.reduce((a, x) => a + x[1], 0) || 1, maxSec = secs[0]?.[1] || 1;
  if (secs.length) h += `<div><div class="group-h"><span>En qué se va el dinero</span></div><div class="group" style="padding:12px 16px">${secs.map(([sec, v]) => `
    <div class="hbar"><div class="hbar-l"><span>${dot(sec)}${esc(sec)}</span><span class="num">${eur(v)} · ${Math.round(v / totalSec * 100)} %</span></div><div class="hbar-t"><i style="width:${(v / maxSec * 100).toFixed(1)}%"></i></div></div>`).join("")}</div></div>`;
  const prods = Object.entries(byProd).sort((a, b) => b[1].v - a[1].v).slice(0, 10);
  if (prods.length) h += `<div><div class="group-h"><span>Lo que más gasto supone</span></div><div class="group">${prods.map(([name, x]) => `<div class="rowi">${img(x.img)}<span class="grow"><span class="t">${esc(name)}</span><span class="s">${x.c} ${x.c === 1 ? "vez" : "veces"}</span></span><span class="p">${eur(x.v)}</span></div>`).join("")}</div></div>`;
  return h + `<p class="foot">Calculado con los precios estimados de cada compra guardada.</p>`;
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
      save(); closeSheet(); state.listView = "comprar"; toast(`${p.items.length} productos añadidos a la lista`); showTab("lista");
    };
    twice(body.querySelector("#del-pur"), "Pulsa otra vez para borrarla", () => { state.purchases = state.purchases.filter(x => x.id !== id); save(); closeSheet(); toast("Compra borrada"); });
  }, renderAll);
}

// ---------- Recetas ----------
const recIngNames = r => r.ingredientes.map(i => i.n).concat(r.otros || []);
const recHay = r => r._hay ??= norm(r.nombre + " " + recIngNames(r).join(" "));
const recScore = (r, words) => words.filter(w => recHay(r).includes(w)).length;
function pantryScore(r) { // ingredientes que ya tienes en casa; lo que caduca pronto cuenta el doble
  return r.ingredientes.reduce((a, i) => {
    const ps = state.despensa.filter(p => p.name === i.n); if (!ps.length || GENBY[i.n]?.pantry) return a;
    return a + (ps.some(p => p.exp && daysTo(p.exp) <= 3) ? 2 : 1);
  }, 0);
}
function have(name) { const n = norm(name); return state.ings.some(g => { const x = norm(g); return n.includes(x) || x.includes(n); }) || state.list.some(i => norm(i.name) === n) || state.despensa.some(p => norm(p.name) === n); }
let recCat = "Todas", recQuick = false, recShown = 30, recQuery = "", recPantry = false, recCheap = false;
function renderRecetas() {
  $("subtitle").textContent = `${REC.length} recetas caseras`;
  const cats = ["Todas", ...new Set(REC.map(r => r.categoria))];
  const words = state.ings.map(norm), qw = norm(recQuery).split(/\s+/).filter(Boolean);
  const allowed = REC.filter(recipeAllowed), hiddenN = REC.length - allowed.length;
  let rs = allowed.filter(r => recCat === "Todas" || r.categoria === recCat);
  if (recQuick) rs = rs.filter(r => r.tiempo <= 30);
  if (qw.length) rs = rs.filter(r => qw.every(w => recHay(r).includes(w)));
  const score = r => recScore(r, words) * 2 + (recPantry ? pantryScore(r) * 3 : 0);
  rs = rs.map(r => ({r, s: score(r), c: recipeCost(r)})).sort((a, b) => recCheap ? a.c - b.c : (b.s - a.s || a.r.nombre.localeCompare(b.r.nombre, "es"))).map(x => x.r);
  if (recPantry) rs = rs.filter(r => pantryScore(r) > 0);
  const el = $("s-recetas");
  el.innerHTML = `
    <div class="field">${SEARCH_SVG}<input id="rq" type="search" placeholder="Buscar receta o ingrediente" value="${esc(recQuery)}" autocomplete="off" aria-label="Buscar recetas"></div>
    <div><div class="group-h"><span>Lo que te apetece</span></div>
      <div class="chips wrap">${state.ings.map((g, ix) => `<button class="chip soft" data-ing="${ix}" aria-label="Quitar ${esc(g)}">${esc(g)} ✕</button>`).join("")}
      <form id="ing-form"><input class="plain pill" id="ing-in" placeholder="Añadir: pollo, calabacín…" enterkeyhint="done" aria-label="Añadir ingrediente"></form></div>
      ${state.ings.length ? `<p class="foot">Las recetas que usan estos alimentos salen primero.</p>` : ""}</div>
    <div class="chips"><button class="chip ${recPantry ? "on" : ""}" id="r-pantry">🏠 Con lo que tengo en casa</button><button class="chip ${recCheap ? "on" : ""}" id="r-cheap">€ Más baratas</button><button class="chip ${recQuick ? "on" : ""}" id="quick">⏱ 30 min o menos</button></div>
    <div class="chips">${cats.map(c => `<button class="chip ${c === recCat ? "on" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("")}</div>
    ${activeDiets().length ? `<div class="chips wrap">${activeDiets().map(k => `<span class="chip diet">✓ ${esc(DIET[k].label)}</span>`).join("")}<button class="chip" id="r-diet">Cambiar</button></div>` : ""}
    <p class="foot" style="margin-top:-8px">${rs.length} recetas${hiddenN ? ` · ${hiddenN} ocultas por tus filtros de alimentación` : ""}${recPantry && !state.despensa.length ? " · tu despensa está vacía: añade productos en Lista → En casa" : ""}</p>
    <div class="rcards">${rs.slice(0, recShown).map(r => {
      const n = recipeNut(r), sc = recScore(r, words), ps = recPantry ? pantryScore(r) : 0, cost = recipeCost(r, 1);
      return `<button class="rcard" data-rec="${r.id}"><span class="t">${esc(r.nombre)}</span>
        ${catPill(r.categoria)}<span class="s">${r.tiempo} min · ${esc(r.dificultad)} · ${num(n[0])} kcal · ≈ ${eur(cost)}/ración</span>
        ${sc ? `<span class="m">Con ${state.ings.filter(g => recHay(r).includes(norm(g))).map(esc).join(", ")}</span>` : ""}
        ${ps ? `<span class="m">Usa ${r.ingredientes.filter(i => pantryQty(i.n) && !GENBY[i.n]?.pantry).map(i => esc(i.n)).join(", ")} de tu despensa</span>` : ""}</button>`;
    }).join("") || `<div class="empty"><h2>Sin resultados</h2><p>Prueba con otro ingrediente o categoría.</p></div>`}</div>
    ${rs.length > recShown ? `<button class="btn block" id="more">Ver más (${rs.length - recShown})</button>` : ""}`;
  const rq = el.querySelector("#rq");
  rq.addEventListener("input", () => { recQuery = rq.value; recShown = 30; renderRecetas(); const n = $("rq"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); });
  el.querySelector("#ing-form").onsubmit = e => { e.preventDefault(); el.querySelector("#ing-in").value.split(",").map(s => s.trim()).filter(Boolean).forEach(s => { if (!state.ings.some(g => norm(g) === norm(s))) state.ings.push(s); }); commit(); };
  el.querySelectorAll("[data-ing]").forEach(b => b.onclick = () => { state.ings.splice(b.dataset.ing, 1); commit(); });
  el.querySelectorAll("[data-cat]").forEach(b => b.onclick = () => { recCat = b.dataset.cat; recShown = 30; renderRecetas(); });
  el.querySelector("#quick").onclick = () => { recQuick = !recQuick; renderRecetas(); };
  el.querySelector("#r-pantry").onclick = () => { recPantry = !recPantry; recShown = 30; renderRecetas(); };
  el.querySelector("#r-cheap").onclick = () => { recCheap = !recCheap; recShown = 30; renderRecetas(); };
  el.querySelector("#more")?.addEventListener("click", () => { recShown += 30; renderRecetas(); });
  el.querySelector("#r-diet")?.addEventListener("click", () => showTab("ajustes"));
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
  const n = recipeNut(r), cost = recipeCost(r, ppl);
  const planGrid = () => `<div class="plan">${DAYS.map(([d, dn]) => `<span>${dn.slice(0, 3)}</span>${SLOTS.map(([s, sn]) => {
    const cur = state.menu.days?.[d]?.[s], taken = cur && cur !== id, mine = cur === id;
    return `<button data-plan="${d}|${s}" class="${mine ? "sel" : taken ? "taken" : ""}" aria-label="${dn} ${sn}">${mine ? "✓ " : ""}${sn}</button>`;
  }).join("")}`).join("")}</div>`;
  const totalSteps = r.pasos.reduce((a, p) => a + (p.m || 0), 0);
  openSheet(r.nombre, `
    <div class="s" style="color:var(--muted);margin-top:-6px">${r.tiempo} min · ${esc(r.dificultad)} · ${esc(r.categoria)} · ≈ ${eur(cost)} ${forTxt}</div>
    <button class="btn primary block cookbtn" id="cook">👩‍🍳 Empezar a cocinar</button>
    <div class="nutbar">${[["kcal", n[0], ""], ["proteína", n[1], " g"], ["grasa", n[2], " g"], ["hidratos", n[3], " g"]].map(([l, v, u]) => `<div><b>${num(v, l === "kcal" ? 0 : 1)}${u}</b>${l}</div>`).join("")}</div>
    <p class="foot" style="margin-top:-8px">Por ración. Con datos reales de los productos cuando los hay, o valores medios de referencia.</p>
    <div><div class="group-h"><span>Ingredientes · ${forTxt}</span></div><div class="group ingl">${r.ingredientes.map(i => {
      const home = pantryQty(i.n), ok = have(i.n), pantry = GENBY[i.n]?.pantry;
      return `<div class="rowi">${img(GENBY[i.n]?.m?.img)}<span class="grow"><span class="t">${esc(i.n)}</span><span class="s">${esc(scaleAmount(i.a, k))}${pantry ? " · despensa" : ""}</span></span><span class="${ok ? "ok" : pantry ? "" : "miss"}" style="font-size:14px">${home ? "✓ en casa" : ok ? "✓ en lista" : pantry ? "" : "falta"}</span></div>`;
    }).join("")}${(r.otros || []).map(o => `<div class="rowi"><span class="thumb ph" aria-hidden="true"></span><span class="grow"><span class="t">${esc(o)}</span><span class="s">Búscalo en la tienda</span></span></div>`).join("")}</div></div>
    ${missing.length ? `<button class="btn block" id="r-miss">Añadir lo que falta a la lista (${missing.length})</button>` : ""}
    <div><div class="group-h"><span>Preparación${totalSteps ? ` · unos ${totalSteps} min de fuego u horno` : ""}</span></div><div class="group">${r.pasos.map((p, ix) => `
      <div class="rowi step"><span class="stepn">${ix + 1}</span><span class="grow">${esc(p.t)}</span>${p.m ? `<button class="timer-btn" data-tm="${ix}" aria-label="Temporizador de ${p.m} minutos">⏱ ${p.m}′</button>` : ""}</div>`).join("")}</div>
      <p class="foot">Toca ⏱ para poner un temporizador. Sigue contando aunque cambies de pantalla.</p></div>
    <div><div class="group-h"><span>Añadir al menú</span></div><div class="group" style="padding:12px 16px" id="plan-box">${planGrid()}</div>
      <p class="foot">Toca un hueco para poner esta receta. En amarillo, los que ya tienen otro plato.</p></div>`,
  body => {
    body.querySelector("#cook").onclick = () => { closeSheet(); openCook(id); };
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

// ---------- Escáner de códigos de barras ----------
let scan = null;
function loadZXing() {
  return window.ZXing ? Promise.resolve(window.ZXing) : new Promise((ok, ko) => {
    const sc = document.createElement("script"); sc.src = "vendor/zxing.min.js"; sc.onload = () => ok(window.ZXing); sc.onerror = ko; document.head.appendChild(sc);
  });
}
async function openScanner(target = "list") {
  const el = $("scan"); el.hidden = false; document.body.style.overflow = "hidden";
  el.innerHTML = `<div class="ck-top"><button class="ck-x" id="sc-x" aria-label="Cerrar escáner">✕</button><span class="ck-title">Escanear ${target === "pantry" ? "para la despensa" : "para la lista"}</span></div>
    <div class="sc-view"><video id="sc-video" playsinline muted autoplay></video><div class="sc-frame"><i></i></div></div>
    <p class="sc-msg" id="sc-msg">Abriendo la cámara…</p>
    <form class="sc-manual" id="sc-form"><input class="plain" id="sc-code" inputmode="numeric" autocomplete="off" placeholder="O escribe los números del código" aria-label="Número del código de barras"><button class="btn primary">Buscar</button></form>`;
  scan = {target, stop: null, done: false};
  $("sc-x").onclick = closeScanner;
  $("sc-form").onsubmit = e => { e.preventDefault(); const c = $("sc-code").value.replace(/\D/g, ""); if (c.length >= 8) onBarcode(c); else toast("El código tiene 8 o 13 números"); };
  loadMerc();
  const video = $("sc-video");
  try {
    if ("BarcodeDetector" in window && (await BarcodeDetector.getSupportedFormats?.() || []).includes("ean_13")) {
      const stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: "environment"}, audio: false});
      video.srcObject = stream; await video.play();
      const det = new BarcodeDetector({formats: ["ean_13", "ean_8", "upc_a", "upc_e"]});
      let alive = true; scan.stop = () => { alive = false; stream.getTracks().forEach(t => t.stop()); };
      $("sc-msg").textContent = "Centra el código de barras en el recuadro";
      const tick = async () => { if (!alive || !scan) return; try { const r = await det.detect(video); if (r[0]) return onBarcode(r[0].rawValue); } catch (e) {} setTimeout(tick, 120); };
      tick();
    } else {
      const ZX = await loadZXing();
      const hints = new Map(); hints.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [ZX.BarcodeFormat.EAN_13, ZX.BarcodeFormat.EAN_8, ZX.BarcodeFormat.UPC_A, ZX.BarcodeFormat.UPC_E]);
      const reader = new ZX.BrowserMultiFormatReader(hints, 150);
      if (!scan) return;
      scan.stop = () => { try { reader.reset(); } catch (e) {} };
      $("sc-msg").textContent = "Centra el código de barras en el recuadro";
      await reader.decodeFromConstraints({video: {facingMode: "environment"}, audio: false}, video, res => { if (res && scan && !scan.done) onBarcode(res.getText()); });
    }
  } catch (e) {
    const m = $("sc-msg"); if (!m) return;
    m.textContent = e?.name === "NotAllowedError" ? "Cesta no tiene permiso para usar la cámara. Actívalo en Ajustes del iPhone → Safari → Cámara, o escribe los números del código." : "No se pudo abrir la cámara. Escribe los números que hay debajo de las barras.";
  }
}
function closeScanner() { try { scan?.stop?.(); } catch (e) {} scan = null; $("scan").hidden = true; $("scan").innerHTML = ""; document.body.style.overflow = ""; renderAll(); }
async function offLookup(code) {
  try {
    const d = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,nutriments,nutriscore_grade`).then(r => r.json());
    if (d.status !== 1 || !d.product) return null;
    const p = d.product, n = p.nutriments || {}, v = [n["energy-kcal_100g"], n.proteins_100g, n.fat_100g, n.carbohydrates_100g];
    const ns = (p.nutriscore_grade || "").toLowerCase();
    return {name: [p.product_name, p.brands].filter(Boolean).join(" · "), short: p.product_name || "",
      nut: v.every(x => typeof x === "number") ? [Math.round(v[0]), ...v.slice(1).map(x => Math.round(x * 10) / 10), ns.length === 1 && "abcde".includes(ns) ? ns : ""] : null};
  } catch (e) { return null; }
}
async function onBarcode(code) {
  if (!scan || scan.done) return;
  scan.done = true; const target = scan.target;
  navigator.vibrate?.(60); closeScanner();
  await loadMerc();
  const m = MERCBY[state.eanMap[code]] || EANBY[code] || EANBY[code.padStart(13, "0")];
  if (m) return scanResult(m, code, target);
  openSheet(`Código ${code}`, `<p class="foot">Buscando el producto…</p>`, null, renderAll);
  showUnknown(code, await offLookup(code), target);
}
function scanResult(m, code, target) {
  const inList = state.list.find(i => i.pid === m.pid || i.name === m.name);
  const needNut = !m.nut && !state.offNut[m.pid] && !state.nut[m.name];
  openSheet("Producto escaneado", `
    <div class="pcard">${img(m.img, 240)}<div><div class="t" style="font-weight:600">${esc(m.name)} ${nsBadge(m.ns || state.offNut[m.pid]?.[4])}</div>
      <div class="big2">${eur(m.price)}</div><div class="s">${esc(m.pack || "")} · ${num(m.ref, 2)} €/${esc(m.fmt)}</div>
      ${productWarnings(m.name).length ? `<div class="s warn-t">⚠ Puede no ser apto: ${esc(productWarnings(m.name).join(", "))}</div>` : ""}</div></div>
    ${inList ? `<button class="btn primary block" id="sr-done">${inList.done ? "✓ Ya está en la cesta" : "✓ Marcar como comprado"}</button>` : ""}
    <div class="btns"><button class="btn ${inList ? "" : "primary"}" id="sr-list">${inList ? "Uno más a la lista" : "Añadir a la lista"}</button><button class="btn ${target === "pantry" ? "primary" : ""}" id="sr-pantry">A la despensa</button></div>
    <div class="group"><label class="rowi"><span class="grow">Caduca el (opcional)</span><input class="plain short" type="date" id="sr-exp"></label></div>
    <p class="foot" id="sr-nut">${needNut ? "Buscando su información nutricional…" : ""}</p>
    <button class="btn block" id="sr-again">Escanear otro</button>`, body => {
    const entry = productEntry(m);
    body.querySelector("#sr-done")?.addEventListener("click", () => { inList.done = true; save(); closeSheet(); toast(`Marcado como comprado: ${m.name}`); });
    body.querySelector("#sr-list").onclick = () => { addItem(entry); save(); closeSheet(); toast(`Añadido a la lista: ${m.name}`); };
    body.querySelector("#sr-pantry").onclick = () => { addPantry(entry, 1, body.querySelector("#sr-exp").value || null); save(); closeSheet(); toast(`Añadido a la despensa: ${m.name}`); };
    body.querySelector("#sr-again").onclick = () => { closeSheet(); openScanner(target); };
    if (needNut) offLookup(code).then(o => {
      const el = body.querySelector("#sr-nut"); if (!el) return;
      if (o?.nut) { state.offNut[m.pid] = o.nut; resetNutCache(); save(); el.textContent = `Información nutricional añadida: ${o.nut[0]} kcal por 100 g.`; }
      else el.textContent = "Open Food Facts no tiene sus datos nutricionales. Puedes apuntarlos desde la ficha del producto.";
    });
  }, renderAll);
}
function showUnknown(code, off, target) {
  const words = norm(off?.short || "").split(/\s+/).filter(w => w.length > 2).slice(0, 4);
  const cands = words.length ? (MERC || []).map(m => ({m, s: words.filter(w => m._n.includes(w)).length})).filter(x => x.s >= Math.min(2, words.length)).sort((a, b) => b.s - a.s || a.m.name.length - b.m.name.length).slice(0, 5).map(x => x.m) : [];
  openSheet(off ? "¿Qué producto es?" : `Código ${code}`, `
    ${off ? `<p style="margin:0">Open Food Facts lo conoce como <b>${esc(off.name)}</b>${off.nut ? ` (${off.nut[0]} kcal por 100 g)` : ""}, pero aún no sé cuál es en el catálogo de Mercadona.</p>` : `<p style="margin:0">Este código no está en el catálogo de Mercadona que tiene Cesta ni en Open Food Facts. Puede ser un producto nuevo o de otra tienda.</p>`}
    ${cands.length ? `<div><div class="group-h"><span>¿Es alguno de estos?</span></div><div class="group">${cands.map(m => `<button class="rowi tap" data-cand="${m.pid}">${img(m.img)}<span class="grow"><span class="t">${esc(m.name)}</span><span class="s">${esc(m.pack || "")}</span></span><span class="p">${eur(m.price)}</span></button>`).join("")}</div><p class="foot">Si eliges uno, Cesta recordará este código para la próxima vez.</p></div>` : ""}
    ${off ? `<button class="btn block" id="su-free">Añadir como «${esc(off.short || off.name)}»</button>` : ""}
    <button class="btn block" id="su-search">Buscarlo por nombre</button>
    <button class="btn block" id="su-again">Escanear otro</button>`, body => {
    body.querySelectorAll("[data-cand]").forEach(b => b.onclick = () => {
      const m = MERCBY[b.dataset.cand]; state.eanMap[code] = m.pid;
      if (off?.nut && !m.nut) { state.offNut[m.pid] = off.nut; resetNutCache(); }
      save(); scanResult(m, code, target);
    });
    body.querySelector("#su-free")?.addEventListener("click", () => {
      const name = off.short || off.name; if (off.nut) { state.nut[name] = off.nut.slice(0, 4); resetNutCache(); }
      addTo(name, target); save(); closeSheet(); toast(`Añadido: ${name}`);
    });
    body.querySelector("#su-search").onclick = () => { closeSheet(); openSearch({target, initial: off?.short || ""}); };
    body.querySelector("#su-again").onclick = () => { closeSheet(); openScanner(target); };
  }, renderAll);
}

// ---------- Modo cocina ----------
let cook = null, wakeLock = null;
async function keepAwake() { try { wakeLock = await navigator.wakeLock?.request("screen"); } catch (e) { wakeLock = null; } }
document.addEventListener("visibilitychange", () => { if (cook && document.visibilityState === "visible") keepAwake(); });
function openCook(id) {
  const r = RECBY[id]; if (!r) return;
  cook = {r, step: 0, k: batchK(r), checked: new Set()};
  $("cook").hidden = false; document.body.style.overflow = "hidden";
  keepAwake(); drawCook();
}
function closeCook() {
  $("cook").hidden = true; document.body.style.overflow = ""; cook = null;
  try { wakeLock?.release(); } catch (e) {} wakeLock = null; renderAll();
}
function drawCook() {
  const {r, step, k} = cook, total = r.pasos.length + 2; // ingredientes + pasos + final
  let body = "";
  if (step === 0) {
    body = `<p class="ck-kicker">Antes de empezar, prepara</p><div class="ck-ings">${r.ingredientes.map((i, ix) => `<button class="ck-ing ${cook.checked.has(ix) ? "on" : ""}" data-ci="${ix}"><span class="ck-box"></span><span>${esc(i.n)}</span><b>${esc(scaleAmount(i.a, k))}</b></button>`).join("")}${(r.otros || []).map(o => `<div class="ck-ing"><span class="ck-box"></span><span>${esc(o)}</span></div>`).join("")}</div>`;
  } else if (step <= r.pasos.length) {
    const p = r.pasos[step - 1];
    body = `<p class="ck-kicker">Paso ${step} de ${r.pasos.length}</p><p class="ck-text">${esc(p.t)}</p>
      ${p.m ? `<button class="btn primary ck-timer" id="ck-tm">⏱ Poner temporizador de ${p.m} min</button>` : ""}`;
  } else {
    const usable = r.ingredientes.filter(i => pantryQty(i.n) > 0);
    body = `<p class="ck-kicker">¡Listo!</p><p class="ck-text">Buen provecho.</p>
      ${usable.length ? `<button class="btn primary ck-timer" id="ck-use">Descontar de la despensa lo que has usado (${usable.length})</button>` : ""}`;
  }
  $("cook").innerHTML = `
    <div class="ck-top"><button class="ck-x" id="ck-close" aria-label="Salir del modo cocina">✕</button><span class="ck-title">${esc(r.nombre)}</span></div>
    <div class="ck-dots">${Array.from({length: total}, (_, ix) => `<i class="${ix === step ? "on" : ix < step ? "past" : ""}"></i>`).join("")}</div>
    <div class="ck-body">${body}</div>
    <div class="ck-nav"><button class="btn" id="ck-prev" ${step === 0 ? "disabled" : ""}>‹ Anterior</button>
      ${step < total - 1 ? `<button class="btn primary" id="ck-next">${step === 0 ? "Empezar" : "Siguiente"} ›</button>` : `<button class="btn primary" id="ck-done">Terminar</button>`}</div>`;
  $("ck-close").onclick = closeCook;
  $("ck-prev").onclick = () => { cook.step--; drawCook(); };
  $("ck-next")?.addEventListener("click", () => { cook.step++; drawCook(); });
  $("ck-done")?.addEventListener("click", closeCook);
  $("ck-tm")?.addEventListener("click", () => { const p = r.pasos[step - 1]; startTimer(`${r.nombre}: paso ${step}`, p.m); });
  $("ck-use")?.addEventListener("click", e => {
    r.ingredientes.forEach(i => { if (pantryQty(i.n) > 0) usePantry(i.n, i.q * k); });
    save(); e.target.disabled = true; e.target.textContent = "Despensa actualizada ✓";
  });
  document.querySelectorAll("[data-ci]").forEach(b => b.onclick = () => { const ix = +b.dataset.ci; cook.checked.has(ix) ? cook.checked.delete(ix) : cook.checked.add(ix); drawCook(); });
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
const menuRecipes = () => DAYS.flatMap(([d]) => SLOTS.map(([s]) => RECBY[state.menu.days?.[d]?.[s]]).filter(Boolean));
function menuNeeds() {
  const acc = {};
  menuRecipes().forEach(r => { const k = batchK(r); r.ingredientes.forEach(i => acc[i.n] = (acc[i.n] || 0) + i.q * k); });
  return acc;
}
function menuCost() { return menuRecipes().reduce((a, r) => a + recipeCost(r), 0); }
function filteredPool() {
  const prefs = norm(state.menu.prefs);
  const avoid = [...prefs.matchAll(/sin ([a-z ]+?)(?:,|$| y )/g)].map(m => m[1].trim()).filter(Boolean);
  const map = {cerdo: ["lomo", "costilla", "chorizo", "bacon", "salchicha", "jamon"], carne: ["pollo", "pavo", "ternera", "cerdo", "lomo", "costilla", "chorizo", "bacon", "salchicha", "jamon", "carne", "conejo", "alitas", "muslos"], pescado: ["merluza", "salmon", "bacalao", "atun", "sardina", "gamba", "langostino", "calamar", "sepia", "mejillon", "lubina", "dorada", "rape"], marisco: ["gamba", "langostino", "calamar", "sepia", "mejillon"], gluten: ["pasta", "espagueti", "macarron", "fideo", "pan", "harina", "hojaldre", "tortillas de trigo", "cuscus", "galleta"], lactosa: ["leche", "nata", "queso", "yogur", "mantequilla", "mozzarella"], huevo: ["huevo"]};
  const words = avoid.flatMap(a => map[a] || [a]);
  const quick = /rapid|poco tiempo/.test(prefs);
  return REC.filter(r => !["Postres", "Desayunos"].includes(r.categoria) && (!quick || r.tiempo <= 40) && !words.some(w => recHay(r).includes(w)) && recipeAllowed(r));
}
function autoMenu(redo) {
  if (!REC.length) return;
  if (redo) state.menu.days = {};
  const pool = filteredPool(), prefs = norm(state.menu.prefs), likes = state.ings.map(norm);
  const morefish = /mas pescado/.test(prefs), veg = /vegetarian|sin carne/.test(prefs), cheap = !!state.budget.week || /barat|economic/.test(prefs);
  const used = new Set(menuRecipes().map(r => r.id));
  const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
  const lunch = shuffle(["Legumbres", "Pescado", "Arroces", "Legumbres", "Carne", "Pasta", morefish ? "Pescado" : veg ? "Verduras" : "Carne"]);
  const dinner = shuffle(["Huevos", "Verduras", "Pescado", "Sopas", "Ensaladas", veg ? "Huevos" : "Carne", "Verduras"]);
  DAYS.forEach(([d], ix) => [["comida", lunch[ix]], ["cena", dinner[ix]]].forEach(([s, cat]) => {
    if (state.menu.days?.[d]?.[s]) return;
    let c = pool.filter(r => r.momento.includes(s) && !used.has(r.id) && r.categoria === cat);
    if (!c.length) c = pool.filter(r => r.momento.includes(s) && !used.has(r.id));
    if (!c.length) return;
    const pick = c.map(r => ({r, w: recScore(r, likes) * 2 + pantryScore(r) * 1.5 + Math.random() * 3 - (cheap ? recipeCost(r, 1) * 1.2 : 0)})).sort((a, b) => b.w - a.w)[0].r;
    used.add(pick.id); state.menu.days[d] ??= {}; state.menu.days[d][s] = pick.id;
  }));
  const n = menuRecipes().length;
  toast(n < 14 ? `Menú con ${n} platos: no hay más recetas que cumplan tus preferencias` : "Menú de la semana listo");
  commit();
}
function cheapenMenu() { // cambia los platos más caros por otros más baratos del mismo tipo
  const pool = filteredPool(), used = new Set(menuRecipes().map(r => r.id));
  const slots = DAYS.flatMap(([d]) => SLOTS.map(([s]) => [d, s, RECBY[state.menu.days?.[d]?.[s]]])).filter(x => x[2]).sort((a, b) => recipeCost(b[2]) - recipeCost(a[2]));
  let saved = 0, changed = 0;
  for (const [d, s, r] of slots.slice(0, 5)) {
    const c = pool.filter(x => x.momento.includes(s) && x.categoria === r.categoria && !used.has(x.id) && recipeCost(x) < recipeCost(r) * 0.8).sort((a, b) => recipeCost(a) - recipeCost(b));
    if (!c.length) continue;
    const pick = c[Math.floor(Math.random() * Math.min(3, c.length))];
    saved += recipeCost(r) - recipeCost(pick); used.add(pick.id); state.menu.days[d][s] = pick.id; changed++;
  }
  toast(changed ? `${changed} platos cambiados · ahorras unos ${eur(saved)}` : "No he encontrado platos más baratos del mismo tipo");
  commit();
}
function menuToList() {
  const needs = menuNeeds();
  state.list = state.list.filter(i => !(i.src === "menu" && !i.done));
  let added = 0, home = 0; const pantry = [];
  Object.entries(needs).forEach(([name, q]) => {
    if (GENBY[name]?.pantry) { pantry.push(name); return; }
    const need = q - pantryQty(name);
    if (need <= 0.15) { home++; return; }
    if (state.list.some(i => i.name === name && !i.done)) return;
    state.list.push({name, n: Math.max(1, Math.ceil(need - 0.15)), done: false, src: "menu"}); added++;
  });
  state.pantry = pantry;
  toast(`${added} productos añadidos a la lista${home ? ` · ${home} ya los tienes en casa` : ""}`);
  commit();
}
function renderMenu() {
  const rs = menuRecipes(), n = rs.length, ppl = state.menu.people || 2;
  const cost = menuCost();
  const kcalDay = rs.reduce((a, r) => a + recipeNut(r)[0], 0) / 7;
  $("subtitle").textContent = n ? `${n} de 14 platos planificados` : "Comida y cena de lunes a domingo";
  const todayKey = DAYS[(new Date().getDay() + 6) % 7][0];
  let h = `<div class="hero"><span class="lbl">Coste estimado de los ingredientes</span><span class="big">${eur(cost)}</span>
      ${budgetBar(cost, state.budget.week, "de la semana")}
      <div class="kpis"><div><b>${eur(n ? cost / ppl / 7 : 0)}</b>por persona y día</div><div><b>${n ? num(kcalDay) : 0} kcal</b>de media al día en comida y cena</div></div></div>
    <div class="group">
      <div class="rowi"><span class="grow">Personas</span><div class="stepper"><button id="pp-dec" aria-label="Menos personas">−</button><span>${ppl}</span><button id="pp-inc" aria-label="Más personas">+</button></div></div>
      <div class="rowi"><input class="plain" id="prefs" value="${esc(state.menu.prefs)}" placeholder="Preferencias: sin cerdo, más pescado, poco tiempo, barato…" aria-label="Preferencias del menú"></div>
    </div>
    <div class="btns"><button class="btn" id="m-auto">Rellenar huecos</button><button class="btn" id="m-redo">Rehacer todo</button></div>
    ${n ? `<button class="btn block" id="m-cheap">€ Abaratar el menú</button>` : ""}`;
  h += DAYS.map(([d, dn]) => `<div class="day"><div class="day-h"><span>${dn}</span>${d === todayKey ? `<span class="today">Hoy</span>` : ""}</div>${SLOTS.map(([s, sn]) => {
    const r = RECBY[state.menu.days?.[d]?.[s]];
    return `<div class="slot"><span class="when">${sn}</span>
      <button class="dish ${r ? "" : "empty"}" data-slot="${d}|${s}">${r ? `<span class="t">${esc(r.nombre)}</span><span class="s">${dot(r.categoria)}${r.tiempo} min · ${num(recipeNut(r)[0])} kcal · ${eur(recipeCost(r))}</span>` : `<span class="t">+ Elegir plato</span>`}</button>
      ${r ? `<button class="mini" data-swap="${d}|${s}" aria-label="Cambiar por otro parecido">↻</button>` : ""}</div>`;
  }).join("")}</div>`).join("");
  h += `<button class="btn primary block" id="m-list" ${n ? "" : "disabled"}>Crear la lista de la compra</button>
    <p class="foot" style="margin-top:-10px">${state.despensa.length ? "Descuenta lo que ya tienes en la despensa." : "Si apuntas lo que tienes en casa (Lista → En casa), no te lo volverá a pedir."}</p>
    <button class="btn block" id="m-extra">Añadir otros productos a la lista</button>`;
  if (state.pantry?.length) h += `<div><div class="group-h"><span>Revisa tu despensa</span></div><div class="chips wrap">${state.pantry.map(p => `<button class="chip ${state.list.some(i => i.name === p) || pantryQty(p) ? "on" : ""}" data-pan="${esc(p)}">${esc(p)} ${pantryQty(p) ? "🏠" : state.list.some(i => i.name === p) ? "✓" : "+"}</button>`).join("")}</div><p class="foot">Estos productos duran varias semanas, por eso no se añaden solos. Toca los que te falten.</p></div>`;
  if (n) h += `<button class="btn block ghost-danger" id="m-clear"><span class="lbl2">Vaciar el menú</span></button>`;
  const el = $("s-menu"); el.innerHTML = h;
  el.querySelector("#pp-dec").onclick = () => { state.menu.people = Math.max(1, ppl - 1); commit(); };
  el.querySelector("#pp-inc").onclick = () => { state.menu.people = Math.min(12, ppl + 1); commit(); };
  el.querySelector("#prefs").onchange = e => { state.menu.prefs = e.target.value.trim(); save(); };
  el.querySelector("#m-auto").onclick = () => autoMenu(false);
  el.querySelector("#m-redo").onclick = () => autoMenu(true);
  el.querySelector("#m-cheap")?.addEventListener("click", cheapenMenu);
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
      let rs = REC.filter(r => r.momento.includes(s) && recipeAllowed(r));
      if (qw.length) rs = rs.filter(r => qw.every(w => recHay(r).includes(w)));
      rs = rs.sort((a, b) => (recScore(b, likes) + pantryScore(b)) - (recScore(a, likes) + pantryScore(a)) || a.nombre.localeCompare(b.nombre, "es")).slice(0, 80);
      body.querySelector("#plist").innerHTML = `<div class="group">${rs.map(r => `<button class="rowi tap" data-pick="${r.id}"><span class="grow"><span class="t">${esc(r.nombre)}${r.id === cur ? " ✓" : ""}</span><span class="s">${dot(r.categoria)}${r.tiempo} min · ${num(recipeNut(r)[0])} kcal · ${eur(recipeCost(r))}</span></span><span class="chev">›</span></button>`).join("") || `<div class="rowi">Sin resultados</div>`}</div>`;
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
  const realN = MERC ? MERC.filter(m => m.nut).length : 0;
  $("s-ajustes").innerHTML = `
    <div><div class="group-h"><span>Apariencia</span></div><div class="group" style="padding:12px 16px">
      <div class="seg2" role="group" aria-label="Tema">${[["dark", "Oscuro"], ["light", "Claro"], ["auto", "Sistema"]].map(([k, l]) => `<button data-theme-set="${k}" aria-pressed="${(state.theme || "dark") === k}">${l}</button>`).join("")}</div>
    </div><p class="foot">«Sistema» sigue el modo claro u oscuro del iPhone. La barra de arriba del iPhone se ajusta al volver a abrir la app.</p></div>
    <div><div class="group-h"><span>Alimentación</span></div><div class="group" style="padding:12px 16px">
      <div class="chips wrap">${Object.entries(DIET).map(([k, d]) => `<button class="chip ${activeDiets().includes(k) ? "on" : ""}" data-diet="${k}" aria-pressed="${activeDiets().includes(k)}">${activeDiets().includes(k) ? "✓ " : ""}${esc(d.label)}</button>`).join("")}</div>
    </div><div class="group" style="margin-top:8px">
      <label class="rowi"><span class="grow"><span class="t">Ocultar productos que no cumplan</span><span class="s">En el buscador y las secciones</span></span><input type="checkbox" class="switch" id="diet-hide" ${state.dietHide ? "checked" : ""}></label>
    </div><p class="foot">Las recetas y el menú se filtran por sus ingredientes. En los productos de Mercadona se deduce del nombre, así que es orientativo: revisa siempre la etiqueta si tienes una alergia.</p></div>
    <div><div class="group-h"><span>Presupuesto</span></div><div class="group">
      <label class="rowi"><span class="grow">Por semana</span><input class="plain short" type="number" inputmode="decimal" min="0" step="5" id="b-week" value="${state.budget.week ?? ""}" placeholder="Sin límite"><span class="u">€</span></label>
      <label class="rowi"><span class="grow">Por mes</span><input class="plain short" type="number" inputmode="decimal" min="0" step="10" id="b-month" value="${state.budget.month ?? ""}" placeholder="Sin límite"><span class="u">€</span></label>
    </div><p class="foot">Verás cuánto te queda en la lista, el menú y las compras del mes. Con presupuesto, el menú automático elige platos más baratos.</p></div>
    <div><div class="group-h"><span>Despensa</span></div><div class="group">
      <label class="rowi"><span class="grow"><span class="t">Pasar lo comprado a la despensa</span><span class="s">Al pulsar «Ya lo he comprado»</span></span><input type="checkbox" class="switch" id="auto-pantry" ${state.autoPantry ? "checked" : ""}></label>
    </div></div>
    <div><div class="group-h"><span>Precios</span></div><div class="group">
      <div class="rowi"><span class="grow">Actualizados</span><span class="s" style="color:var(--muted)">${upd}</span></div>
      <div class="rowi"><span class="grow"><span class="t">Fuente</span><span class="s">Tienda online de Mercadona. Se actualizan solos cada lunes y Cesta guarda el historial para detectar bajadas.</span></span></div>
    </div></div>
    <div><div class="group-h"><span>Nutrición</span></div><div class="group">
      <div class="rowi"><span class="grow"><span class="t">Productos con datos reales</span><span class="s">De Open Food Facts, base de datos abierta (licencia ODbL)</span></span><span class="p">${num(realN)}</span></div>
      <div class="rowi"><span class="grow"><span class="t">Valores apuntados por ti</span><span class="s">${own.length ? esc(own.slice(0, 6).join(", ")) + (own.length > 6 ? "…" : "") : "Ninguno. Toca un producto para apuntar sus valores."}</span></span><span class="p">${own.length}</span></div>
    </div><p class="foot">Mercadona no publica la información nutricional. Cesta usa los datos reales de Open Food Facts cuando existen, valores medios de referencia para los alimentos básicos y los tuyos cuando los apuntas.</p></div>
    <div><div class="group-h"><span>Tus datos</span></div><div class="group">
      <div class="rowi"><span class="grow">Compras guardadas</span><span class="p">${state.purchases.length}</span></div>
      <button class="rowi tap" id="exp"><span class="grow"><span class="t">Hacer copia de seguridad</span><span class="s">Guarda un archivo con tu lista, despensa, menú, compras y valores</span></span><span class="chev">›</span></button>
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
  const bset = (id, key) => el.querySelector(id).onchange = e => { const v = parseFloat(String(e.target.value).replace(",", ".")); state.budget[key] = v > 0 ? v : null; save(); toast(v > 0 ? "Presupuesto guardado" : "Sin presupuesto"); };
  bset("#b-week", "week"); bset("#b-month", "month");
  el.querySelector("#auto-pantry").onchange = e => { state.autoPantry = e.target.checked; save(); };
  el.querySelectorAll("[data-diet]").forEach(b => b.onclick = () => { const k = b.dataset.diet, d = new Set(activeDiets()); d.has(k) ? d.delete(k) : d.add(k); state.diet = [...d]; commit(); });
  el.querySelector("#diet-hide").onchange = e => { state.dietHide = e.target.checked; save(); };
  el.querySelector("#exp").onclick = exportData;
  el.querySelector("#imp").onchange = e => importData(e.target.files[0]);
  twice(el.querySelector("#clr-hist"), "Pulsa otra vez para borrarlo", () => { state.hist = {}; state.trips = []; state.purchases = []; commit(); toast("Historial borrado"); });
  twice(el.querySelector("#clr-all"), "Pulsa otra vez para borrarlo todo", () => { const theme = state.theme; state = defaultState(); state.theme = theme; state.tab = "ajustes"; commit(); toast("Datos borrados"); });
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
    state = {...defaultState(), ...d, budget: {...defaultState().budget, ...(d.budget || {})}, tab: "ajustes"};
    resetNutCache(); applyTheme(); commit(); toast("Copia restaurada");
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
loadMerc().then(() => { resetNutCache(); renderAll(); });

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").then(reg => {
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w?.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) toast("Nueva versión lista: se aplicará al volver a abrir Cesta"); });
    });
  }).catch(() => {});
}
