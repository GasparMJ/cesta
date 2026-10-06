"""Convierte los recetarios (recetas_base.txt y recetas_extra_*.txt) en web/data/recetas.json.

- Valida cada ingrediente contra el catálogo de alimentos de actualizar_precios.py y pasa su
  cantidad a "envases estándar" (400 g de pollo = 0,4 del envase de 1 kg), que es lo que usa
  el menú semanal para sumar la lista de la compra.
- Un ingrediente que empieza por ~ no está en el catálogo: se muestra pero no se compra.
- Calcula el tiempo de cada paso: el que diga el texto ("10 minutos") o, si no lo dice,
  un tiempo habitual según la técnica (cocer pasta, sofreír, hornear…).
- Calcula calorías, proteínas, grasas e hidratos por ración con scripts/nutricion.py.

Uso:  python scripts/build_recetas.py
"""
import glob, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
sys.path.insert(0, HERE)
from actualizar_precios import CATALOG, norm  # noqa: E402
from nutricion import NUT, UD_G  # noqa: E402

ALIAS = {"AOVE": "Aceite de oliva virgen extra"}
BY_NAME = {c["name"]: c for c in CATALOG}
DIFF = {"1": "Fácil", "2": "Media", "3": "Difícil"}
WHEN = {"C": ["comida"], "N": ["cena"], "A": ["comida", "cena"]}
ING_RX = re.compile(r"^(.*?)\s+([\d.]+)\s*(g|ml)?$")

# Tiempos habituales cuando el paso no dice cuánto (en minutos). Se aplica la primera regla que encaje.
STEP_TIMES = [
    (r"cuece (?:la |los |el )?(?:fideos)", 4), (r"cuece (?:la )?pasta|cuece los (?:espaguetis|macarrones)", 10),
    (r"cuece el arroz", 18), (r"cuece (?:la )?quinoa", 12), (r"cuece los huevos", 10),
    (r"cuece (?:el )?brocoli|cuece la coliflor", 6), (r"cuece las judias", 12), (r"cuece las patatas|cuece la patata", 20),
    (r"cuece las lentejas", 25), (r"cuece la menestra", 10), (r"cuece el pollo", 15),
    (r"pocha mucho|pocha .*muy despacio", 20), (r"pocha|sofrie", 8),
    (r"frie las patatas", 12), (r"frie los pimientos", 6), (r"frie (?:los |el )?huevos?", 2),
    (r"(?<![a-z])frie|(?<![a-z])frielo|(?<![a-z])frielas|(?<![a-z])frielos", 5), (r"(?<![a-z])dora", 5), (r"bechamel", 8), (r"a la plancha", 6), (r"saltea", 5), (r"rehoga", 4),
    (r"gratina", 6), (r"hornea", 20), (r"tritura", 2), (r"funde", 2), (r"tuesta", 3), (r"bate", 2),
    (r"cuaja", 4), (r"escalfa", 3), (r"al vapor", 5), (r"calienta", 3), (r"infusiona", 10),
    (r"hidrata", 5), (r"marina", 10), (r"monta la nata|monta las claras", 4), (r"(?<![a-z])cuece|(?<![a-z])cuecelo|(?<![a-z])cuecelas", 10),
]
NUM_RX = re.compile(r"(\d+(?:[.,]\d+)?)\s*(minutos?|min|horas?|segundos)\b")


def step_minutes(text):
    t = norm(text)
    total, found = 0.0, False
    for m in NUM_RX.finditer(t):
        v = float(m.group(1).replace(",", "."))
        unit = m.group(2)
        total += v * 60 if unit.startswith("hora") else v / 60 if unit == "segundos" else v
        found = True
    if found:
        return max(1, round(total))
    for rx, mins in STEP_TIMES:
        if re.search(rx, t):
            return mins
    return None


def parse_ing(raw, recipe):
    raw = raw.strip()
    if raw.startswith("~"):
        return None, raw[1:].strip()
    m = ING_RX.match(raw)
    if not m:
        raise ValueError(f"{recipe}: ingrediente sin cantidad: {raw!r}")
    name, amount, unit = m.group(1).strip(), float(m.group(2)), m.group(3)
    name = ALIAS.get(name, name)
    item = BY_NAME.get(name)
    if not item:
        raise ValueError(f"{recipe}: alimento desconocido: {name!r}")
    ref = item["ref"]
    if ref in ("kg", "L"):
        if unit != ("g" if ref == "kg" else "ml"):
            raise ValueError(f"{recipe}: {name} va en {'g' if ref == 'kg' else 'ml'}")
        base, grams = amount / 1000, amount
    else:
        if unit:
            raise ValueError(f"{recipe}: {name} va en unidades")
        base, grams = amount, amount * UD_G.get(name, 0)
    label = f"{amount:g} {unit}" if unit else (f"{amount:g} ud" if amount < 1 else f"{amount:g}")
    return dict(n=name, q=round(base / item["qty"], 4), a=label), grams


def main():
    files = [os.path.join(ROOT, "recetas_base.txt")] + sorted(glob.glob(os.path.join(ROOT, "recetas_extra_*.txt")))
    out, names = [], set()
    for path in files:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                parts = [p.strip() for p in line.split("|")]
                if len(parts) != 7:
                    raise ValueError(f"Línea mal formada en {os.path.basename(path)}: {line[:60]}")
                name, mins, dif, when, cat, ings, steps = parts
                if norm(name) in names:
                    raise ValueError(f"Receta repetida: {name}")
                names.add(norm(name))
                ingredientes, otros, nut = [], [], [0.0, 0.0, 0.0, 0.0]
                for raw in ings.split(","):
                    ing, extra = parse_ing(raw, name)
                    if ing is None:
                        otros.append(extra)
                        continue
                    ingredientes.append(ing)
                    v = NUT.get(ing["n"])
                    if v:
                        for k in range(4):
                            nut[k] += v[k] * extra / 100
                pasos = []
                for s in re.split(r"(?<=\.)\s+(?=[A-ZÁÉÍÓÚÑ¿])", steps.strip()):
                    s = s.strip()
                    if s:
                        pasos.append({"t": s if s.endswith(".") else s + ".", "m": step_minutes(s)})
                rec = dict(
                    id="r" + str(len(out) + 1), nombre=name, tiempo=int(mins), dificultad=DIFF[dif], momento=WHEN[when],
                    categoria=cat, ingredientes=ingredientes, pasos=pasos, raciones=2,
                    nut=[round(nut[0] / 2), round(nut[1] / 2, 1), round(nut[2] / 2, 1), round(nut[3] / 2, 1)],
                )
                if otros:
                    rec["otros"] = otros
                out.append(rec)
    dest = os.path.join(ROOT, "web", "data", "recetas.json")
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    cats = {}
    for r in out:
        cats[r["categoria"]] = cats.get(r["categoria"], 0) + 1
    timed = sum(1 for r in out for p in r["pasos"] if p["m"])
    steps = sum(len(r["pasos"]) for r in out)
    print(f"{len(out)} recetas → web/data/recetas.json · pasos con tiempo: {timed}/{steps}")
    print(cats)


if __name__ == "__main__":
    main()
