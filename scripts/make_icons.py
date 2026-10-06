"""Genera los iconos de la app (cesta crema sobre verde hoja)."""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "icons")
GREEN, CREAM, MUSTARD = (47, 107, 63), (251, 241, 214), (226, 177, 60)


def icon(size, pad=0.0):
    s = 1024
    im = Image.new("RGB", (s, s), GREEN)
    d = ImageDraw.Draw(im)
    k = 1 - pad * 2
    def P(x, y):  # coordenadas en un lienzo 0..1 con margen de seguridad
        return (s * (pad + x * k), s * (pad + y * k))
    # asa
    w = int(s * 0.055 * k)
    d.arc([*P(0.30, 0.16), *P(0.70, 0.62)], 180, 360, fill=CREAM, width=w)
    # borde superior de la cesta
    d.rounded_rectangle([*P(0.17, 0.38), *P(0.83, 0.47)], radius=int(s * 0.03 * k), fill=MUSTARD)
    # cuerpo
    d.polygon([P(0.21, 0.47), P(0.79, 0.47), P(0.71, 0.83), P(0.29, 0.83)], fill=CREAM)
    # ranuras
    for x in (0.38, 0.5, 0.62):
        d.line([P(x, 0.54), P(x - (x - 0.5) * 0.25, 0.76)], fill=GREEN, width=int(s * 0.03 * k))
    return im.resize((size, size), Image.LANCZOS)


os.makedirs(OUT, exist_ok=True)
icon(180).save(os.path.join(OUT, "apple-touch-icon.png"))
icon(192).save(os.path.join(OUT, "icon-192.png"))
icon(512).save(os.path.join(OUT, "icon-512.png"))
icon(512, pad=0.1).save(os.path.join(OUT, "icon-maskable-512.png"))
print("iconos generados")
