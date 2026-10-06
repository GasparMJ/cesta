"""Datos extra del catálogo: códigos de barras, nutrición real e historial de precios.

- Códigos de barras (EAN): de la ficha de cada producto de alimentación en la API de Mercadona.
  Se guardan en scripts/cache/ean.json y solo se piden los de productos nuevos.
- Nutrición: de Open Food Facts (base de datos abierta, licencia ODbL), descargando los productos
  que tienen la tienda «Mercadona». Se guarda en scripts/cache/off.json y se refresca cada 30 días.
- Historial de precios: web/data/historial.json, un precio por producto y semana (últimas 104).

Se usa desde actualizar_precios.py; también se puede ejecutar solo:  python scripts/enriquecer.py
"""
import json, os, time, urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(HERE, "cache")
EAN_FILE = os.path.join(CACHE_DIR, "ean.json")
OFF_FILE = os.path.join(CACHE_DIR, "off.json")
HIST_FILE = os.path.join(HERE, "..", "web", "data", "historial.json")
UA = {"User-Agent": "Cesta/1.0 (https://github.com/GasparMJ/cesta)"}
NON_FOOD = {"Cuidado facial y corporal", "Limpieza y hogar", "Cuidado del cabello", "Maquillaje", "Mascotas",
            "Fitoterapia y parafarmacia"}
OFF_MAX_AGE_DAYS = 30


def _get(url, tries=4, wait=8):
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return json.load(r)
        except Exception as e:
            code = getattr(e, "code", None)
            if code == 404:
                return None
            if k == tries - 1:
                raise
            time.sleep(wait * (k + 1))


def _load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def _save(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))


def update_eans(products, max_new=None):
    """Pide la ficha de los productos de alimentación que aún no tienen EAN en caché.
    Como mucho CESTA_EAN_MAX por ejecución (400 por defecto) para no saturar a Mercadona:
    los que falten se completan en las ejecuciones semanales siguientes."""
    if max_new is None:
        max_new = int(os.environ.get("CESTA_EAN_MAX", "400"))
    eans = _load(EAN_FILE, {})
    todo = [p for p in products if p.get("_top") not in NON_FOOD and p["id"] not in eans][:max_new]
    print(f"EAN: {len(eans)} en caché, {len(todo)} por consultar")
    for n, p in enumerate(todo, 1):
        try:
            d = _get(f"https://tienda.mercadona.es/api/products/{p['id']}/")
            eans[p["id"]] = (d or {}).get("ean") or ""
        except Exception as e:
            print("  aviso EAN", p["id"], e)
        if n % 200 == 0:
            _save(EAN_FILE, eans)
            print(f"  {n}/{len(todo)}")
        time.sleep(0.6)
    _save(EAN_FILE, eans)
    return eans


def update_off(force=False, max_minutes=None):
    """Descarga de Open Food Facts los productos de la tienda Mercadona con su nutrición.
    Es reanudable: si su servidor falla, guarda por dónde iba y sigue en la próxima ejecución."""
    off = _load(OFF_FILE, {"updated": None, "complete": False, "next_page": 1, "items": {}, "partial": {}})
    if off.get("complete") and off.get("updated") and not force:
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(off["updated"])).days
        if age < OFF_MAX_AGE_DAYS:
            print(f"Open Food Facts: caché de hace {age} días con {len(off['items'])} productos")
            return off["items"]
        off.update(next_page=1, partial={})
    max_minutes = max_minutes or float(os.environ.get("CESTA_OFF_MINUTES", "25"))
    start, page, partial = time.time(), off.get("next_page") or 1, off.get("partial") or {}
    fields = "code,nutriments,nutriscore_grade"
    done = False
    while time.time() - start < max_minutes * 60:
        url = f"https://world.openfoodfacts.org/api/v2/search?stores_tags=mercadona&fields={fields}&page_size=100&page={page}"
        try:
            d = _get(url, tries=5, wait=30)
        except Exception as e:
            print("  aviso Open Food Facts, página", page, e, "· se seguirá en la próxima ejecución")
            break
        ps = (d or {}).get("products") or []
        total = (d or {}).get("count") or 0
        for p in ps:
            n = p.get("nutriments") or {}
            vals = [n.get("energy-kcal_100g"), n.get("proteins_100g"), n.get("fat_100g"), n.get("carbohydrates_100g")]
            if p.get("code") and all(isinstance(v, (int, float)) for v in vals):
                ns = (p.get("nutriscore_grade") or "").lower()
                partial[p["code"]] = [round(vals[0]), round(vals[1], 1), round(vals[2], 1), round(vals[3], 1),
                                      ns if len(ns) == 1 and ns in "abcde" else ""]
        if page % 10 == 0:
            print(f"  Open Food Facts: página {page} · {len(partial)} productos con datos")
        if not ps or page * 100 >= total:
            done = True
            break
        page += 1
        off.update(next_page=page, partial=partial)
        _save(OFF_FILE, off)
        time.sleep(6.5)  # su límite para búsquedas es de unas 10 por minuto
    if done:
        off = {"updated": datetime.now(timezone.utc).isoformat(timespec="minutes"), "complete": True,
               "next_page": 1, "items": partial, "partial": {}}
    else:
        # mientras no termina, se usan los datos anteriores más lo descargado hasta ahora
        off.update(next_page=page, partial=partial, items={**off.get("items", {}), **partial})
    _save(OFF_FILE, off)
    print(f"Open Food Facts: {len(off['items'])} productos con nutrición{'' if done else ' (descarga incompleta, continuará)'}")
    return off["items"]


def load_eans():
    return _load(EAN_FILE, {})


def nutrition_by_pid(products):
    eans = update_eans(products)
    off = update_off()
    out = {}
    for p in products:
        e = eans.get(p["id"])
        if e and e in off:
            out[p["id"]] = off[e]
    print(f"Nutrición real para {len(out)} productos del catálogo")
    return out


def update_history(rows, today):
    """rows: filas del catálogo [id, nombre, envase, precio, ...]. Añade la semana actual."""
    h = _load(HIST_FILE, {"dates": [], "p": {}})
    if h["dates"] and h["dates"][-1] == today:
        h["dates"].pop()
        for v in h["p"].values():
            if len(v) > len(h["dates"]):
                v.pop()
    h["dates"].append(today)
    n = len(h["dates"])
    current = {r[0]: r[3] for r in rows}
    for pid, price in current.items():
        v = h["p"].setdefault(pid, [])
        v.extend([0] * (n - 1 - len(v)))
        v.append(price)
    for pid, v in h["p"].items():
        if len(v) < n:
            v.extend([0] * (n - len(v)))
    if n > 104:
        cut = n - 104
        h["dates"] = h["dates"][cut:]
        h["p"] = {k: v[cut:] for k, v in h["p"].items()}
    h["p"] = {k: v for k, v in h["p"].items() if any(v)}
    _save(HIST_FILE, h)
    return h


def previous_price(h, pid, price):
    """Último precio distinto del actual en el historial (para detectar bajadas)."""
    for v in reversed((h["p"].get(pid) or [])[:-1]):
        if v and abs(v - price) > 0.001:
            return v
    return 0


if __name__ == "__main__":
    os.chdir(HERE)
    prods = _load(os.path.join(HERE, "mercadona_cache.json"), [])
    res = nutrition_by_pid(prods)
    print(len(res))
