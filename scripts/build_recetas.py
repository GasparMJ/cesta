"""Convierte recetas_base.txt en recetas.json para la app Cesta.

Cada ingrediente se valida contra el catálogo de alimentos de actualizar_precios.py y su
cantidad se pasa a "envases estándar" (p. ej. 400 g de pollo = 0,4 del envase de 1 kg),
que es lo que usa el menú semanal para sumar la lista de la compra.

Uso:  python build_recetas.py
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from actualizar_precios import CATALOG  # noqa: E402

ALIAS = {"AOVE": "Aceite de oliva virgen extra"}
BY_NAME = {c["name"]: c for c in CATALOG}
DIFF = {"1": "Fácil", "2": "Media", "3": "Difícil"}
WHEN = {"C": ["comida"], "N": ["cena"], "A": ["comida", "cena"]}
ING_RX = re.compile(r"^(.*?)\s+([\d.]+)(g|ml)?$")


def parse_ing(raw, recipe):
    m = ING_RX.match(raw.strip())
    if not m:
        raise ValueError(f"{recipe}: ingrediente sin cantidad: {raw!r}")
    name, amount, unit = m.group(1).strip(), float(m.group(2)), m.group(3)
    name = ALIAS.get(name, name)
    item = BY_NAME.get(name)
    if not item:
        raise ValueError(f"{recipe}: alimento desconocido: {name!r}")
    ref = item["ref"]
    if ref == "kg":
        if unit != "g":
            raise ValueError(f"{recipe}: {name} va en gramos")
        base = amount / 1000
    elif ref == "L":
        if unit != "ml":
            raise ValueError(f"{recipe}: {name} va en ml")
        base = amount / 1000
    else:
        if unit:
            raise ValueError(f"{recipe}: {name} va en unidades")
        base = amount
    label = f"{amount:g} {unit}" if unit else (f"{amount:g}" if amount >= 1 else f"{amount:g} ud")
    return dict(n=name, q=round(base / item["qty"], 4), a=label)


def main():
    out = []
    with open(os.path.join(HERE, "..", "recetas_base.txt"), encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = [p.strip() for p in line.split("|")]
            if len(parts) != 7:
                raise ValueError(f"Línea mal formada: {line[:60]}")
            name, mins, dif, when, cat, ings, steps = parts
            out.append(dict(
                id="b" + str(len(out) + 1),
                nombre=name, tiempo=int(mins), dificultad=DIFF[dif], momento=WHEN[when], categoria=cat,
                ingredientes=[parse_ing(i, name) for i in ings.split(",")],
                pasos=[s.strip() + "." for s in re.split(r"\.\s+", steps.rstrip(".")) if s.strip()],
                raciones=2,
            ))
    with open(os.path.join(HERE, "..", "web", "data", "recetas.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    cats = {}
    for r in out:
        cats[r["categoria"]] = cats.get(r["categoria"], 0) + 1
    print(f"{len(out)} recetas → recetas.json", cats)


if __name__ == "__main__":
    main()
