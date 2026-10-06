"""Descarga los precios reales de Mercadona y genera los datos de la app Cesta.

Genera en web/data/:
  precios.json   ~120 alimentos genéricos (los que usan las recetas y el menú) con el
                 producto equivalente más barato de Mercadona.
  catalogo.json  Catálogo completo de Mercadona para buscar cualquier producto.

Fuente: API pública de tienda.mercadona.es.
Uso:  python scripts/actualizar_precios.py
"""
import json, os, re, time, unicodedata, urllib.request
from datetime import datetime, timezone

UA = "Mozilla/5.0 (CestaApp; uso personal)"
HERE = os.path.dirname(os.path.abspath(__file__))
import sys; sys.path.insert(0, HERE)
from nutricion import NUT, UD_G  # noqa: E402
CACHE = os.path.join(HERE, "mercadona_cache.json")
OUT = os.path.join(HERE, "..", "web", "data")

# Secciones de Mercadona que no son alimentación ni hogar básico (se excluyen de las búsquedas genéricas)
NON_FOOD_TOPS = {"Bebé", "Bodega", "Cuidado del cabello", "Cuidado facial y corporal", "Fitoterapia y parafarmacia",
                 "Maquillaje", "Mascotas", "Limpieza y hogar", "Pizzas y platos preparados"}


def get(url, accept="application/json"):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def norm(s):
    s = unicodedata.normalize("NFD", s or "")
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower()


def G(name, unit, qty, ref, inc, exc=(), mcat=None, any_=None, pantry=False):
    d = dict(name=name, unit=unit, qty=qty, ref=ref, inc=list(inc), exc=list(exc), pantry=pantry)
    if mcat:
        d["mcat"] = list(mcat)
    if any_:
        d["any"] = list(any_)
    return d


# Alimentos genéricos. qty/ref = cantidad estándar (precio = €/ref × qty).
# mcat: secciones de Mercadona · inc: todas estas palabras (inicio de palabra) · any: al menos una · exc: ninguna
# pantry: producto de despensa que dura varias semanas (el menú no lo añade solo; avisa de revisarlo)
CATALOG = [
    # Lácteos y huevos
    G("Leche entera", "1 L", 1, "L", ["leche", "entera"], ["sin lactosa", "cabra", "polvo", "fresca", "calcio", "omega"], [72]),
    G("Leche semidesnatada", "1 L", 1, "L", ["leche", "semidesnatada"], ["sin lactosa", "polvo", "fresca", "calcio", "omega"], [72]),
    G("Nata para cocinar", "200 ml", 0.2, "L", ["nata"], ["montar", "spray", "vegetal", "soja", "avena"], any_=["cocinar", "cocina"]),
    G("Huevos", "docena", 12, "ud", ["huevos"], ["codorniz", "liquid", "clara", "camperos", "ecolog", "cocidos"], [77]),
    G("Mantequilla", "250 g", 0.25, "kg", ["mantequilla"], ["sin lactosa", "porciones", "ligera", "untar", "light", "ecolog", "margarina", "ajo", "hierbas", "clarificada", "mezcla"], [75]),
    G("Yogur natural", "pack 6 × 125 g", 0.75, "kg", ["yogur", "natural"], ["azucarado", "edulcorado", "cremoso", "griego", "bifidus", "proteina", "ecolog", "sin lactosa", "coco", "macedonia", "fresa", "frutas", "trozos", "sabores", "limon", "vainilla", "kefir", "cabra", "oveja"], [104]),
    G("Queso rallado", "200 g", 0.2, "kg", ["queso", "rallado"], ["parmesano", "cabra", "light", "grana", "pecorino", "vegano", "sin lactosa", "4 quesos", "cuatro", "polvo"], [56]),
    G("Queso curado", "250 g", 0.25, "kg", ["queso", "curado"], ["cabra", "manchego", "oveja", "semicurado", "romero", "trufa", "pimenton", "mini", "tacos", "dados", "lonchas", "aceite", "reserva", "viejo", "anejo", "cheddar"], [54]),
    G("Queso fresco", "250 g", 0.25, "kg", ["queso", "fresco"], ["untar", "batido", "light", "cabra", "0%"], [53]),
    G("Mozzarella", "125 g", 0.125, "kg", ["mozzarella"], ["rallad", "palitos", "pizza", "bufala", "mini", "perlas"], [53, 56]),
    G("Queso de cabra", "rulo 200 g", 0.2, "kg", ["queso", "cabra"], ["rallado", "untar", "lonchas"], [53, 54]),
    # Panadería
    G("Pan de molde", "460 g", 0.46, "kg", ["pan", "molde"], ["sin gluten", "integral", "brioche", "proteina", "semillas", "cereales", "centeno", "espelta", "avena"], [60]),
    G("Barra de pan", "unidad", 1, "ud", ["barra"], ["integral", "cereales", "semillas", "centeno", "espelta", "chapata"], [59]),
    G("Tortillas de trigo", "paquete 8 uds", 8, "ud", ["tortillas"], ["maiz", "integral", "chips", "patata"], [60]),
    G("Masa de hojaldre", "lámina 230 g", 0.23, "kg", ["hojaldre"], ["palmera", "napolitana", "relleno", "bocado", "pastel", "empanada", "croissant", "atun"], any_=["masa", "lamina", "base"]),
    G("Pan rallado", "500 g", 0.5, "kg", ["pan", "rallado"], ["sin gluten", "ajo", "perejil", "panko", "tempura"], [62], pantry=True),
    # Despensa
    G("Arroz", "1 kg", 1, "kg", ["arroz"], ["integral", "vasito", "cocido", "microondas"], [118], any_=["redondo", "largo"]),
    G("Pasta (macarrones)", "500 g", 0.5, "kg", ["macarron"], ["integral", "sin gluten", "legumbre", "lenteja", "garbanzo", "fresc"], [120]),
    G("Espaguetis", "500 g", 0.5, "kg", ["spaghetti"], ["integral", "sin gluten", "legumbre", "fresc", "calabacin"], [120]),
    G("Fideos", "500 g", 0.5, "kg", ["fideo"], ["integral", "arroz", "chino", "yakisoba", "ramen", "sopa", "instant"], [120]),
    G("Lentejas", "1 kg", 1, "kg", ["lenteja"], ["cocid", "jardinera", "estofad", "chorizo", "con", "bote", "tarro", "roja", "coral"], [121]),
    G("Garbanzos cocidos", "400 g", 0.4, "kg", ["garbanzo", "cocido"], ["espinacas", "callos", "con"], [121]),
    G("Alubias blancas cocidas", "400 g", 0.4, "kg", ["alubia", "blanca"], ["con", "fabada"], [121], any_=["cocida"]),
    G("Harina de trigo", "1 kg", 1, "kg", ["harina", "trigo"], ["integral", "fuerza", "reposteria", "maiz", "espelta", "rebozar", "tempura", "bizcocho"], [69], pantry=True),
    G("Azúcar", "1 kg", 1, "kg", ["azucar"], ["moreno", "glas", "caña", "cana", "sobres", "edulcorante", "vainillado", "terron"], [89], pantry=True),
    G("Sal", "1 kg", 1, "kg", ["sal"], ["escamas", "himalaya", "hierbas", "lavavajillas", "baja", "yodo", "rosa"], [112], pantry=True),
    G("Aceite de oliva virgen extra", "1 L", 1, "L", ["aceite", "virgen", "extra"], ["spray", "ecolog", "seleccion", "arbequina", "picual", "hojiblanca", "cosecha"], [112], pantry=True),
    G("Aceite de girasol", "1 L", 1, "L", ["aceite", "girasol"], ["alto oleico", "spray"], [112], pantry=True),
    G("Vinagre", "1 L", 1, "L", ["vinagre"], ["modena", "balsamico", "manzana", "jerez", "limpieza", "crema", "arroz"], [112], pantry=True),
    G("Tomate triturado", "400 g", 0.4, "kg", ["tomate", "triturado"], ["albahaca", "ecolog"], [126]),
    G("Tomate frito", "400 g", 0.4, "kg", ["tomate", "frito"], ["ecolog", "albahaca", "sin azucar", "picante", "receta"], [126]),
    G("Caldo de pollo", "1 L", 1, "L", ["caldo", "pollo"], ["pastilla", "cubito", "concentrado", "sopa"], [129]),
    G("Caldo de verduras", "1 L", 1, "L", ["caldo", "verdura"], ["pastilla", "cubito", "concentrado", "sopa"], [129]),
    G("Atún en aceite", "3 latas (~200 g)", 0.2, "kg", ["atun"], ["ventresca", "escabeche", "natural", "tomate", "ensalada", "picante", "pate", "bonito", "rojo", "pimiento"], [122], any_=["aceite"]),
    G("Sardinas en lata", "lata 120 g", 0.12, "kg", ["sardina"], ["tomate", "picante", "limon", "pate", "escabeche"], [122]),
    G("Mejillones en escabeche", "lata 111 g", 0.111, "kg", ["mejillon"], ["natural", "picante", "vapor"], [123], any_=["escabeche"]),
    G("Maíz dulce", "lata 140 g", 0.14, "kg", ["maiz"], ["palomitas", "harina", "tortitas", "copos", "mazorca", "baby"], [127]),
    G("Aceitunas", "bote 200 g", 0.2, "kg", ["aceituna"], ["pate", "rellenas de anchoa con", "negras sin hueso cortadas"], [135]),
    G("Pimentón", "75 g", 0.075, "kg", ["pimenton"], ["picante", "vera"], [115], pantry=True),
    G("Comino", "40 g", 0.04, "kg", ["comino"], [], [115], pantry=True),
    G("Orégano", "15 g", 0.015, "kg", ["oregano"], [], [115], pantry=True),
    G("Pimienta negra", "50 g", 0.05, "kg", ["pimienta", "negra"], ["grano molinillo"], [115], pantry=True),
    G("Laurel", "10 g", 0.01, "kg", ["laurel"], [], [115], pantry=True),
    G("Canela", "40 g", 0.04, "kg", ["canela"], ["rama"], [115], pantry=True),
    G("Curry", "50 g", 0.05, "kg", ["curry"], ["salsa", "pollo", "arroz"], [115], pantry=True),
        G("Cuscús", "500 g", 0.5, "kg", ["cous"], ["integral", "verdura", "sabor"], [118, 120, 121]),
    G("Quinoa", "500 g", 0.5, "kg", ["quinoa"], ["con", "vasito", "cocida", "galleta"], [118, 121]),
    G("Copos de avena", "500 g", 0.5, "kg", ["avena"], ["bebida", "galleta", "barrita", "chocolate", "miel", "crema"], [78]),
        G("Salsa de soja", "150 ml", 0.15, "L", ["salsa", "soja"], ["teriyaki", "dulce"], [117], pantry=True),
    G("Mayonesa", "450 ml", 0.45, "L", ["mayonesa"], ["light", "ajo", "huevo", "vegana", "sin huevo", "kebab"], [116], pantry=True),
    G("Mostaza", "250 g", 0.25, "kg", ["mostaza"], ["miel", "antigua", "dijon"], [116], pantry=True),
    G("Miel", "500 g", 0.5, "kg", ["miel"], ["mostaza", "caramelo", "galleta", "cereales", "yogur", "avena"], [90], pantry=True),
    G("Chocolate negro", "tableta 100 g", 0.1, "kg", ["chocolate", "negro"], ["cacahuete", "almendras", "naranja", "relleno", "bombon", "galleta", "cereales"], [92]),
    G("Cacao en polvo", "500 g", 0.5, "kg", ["cacao"], ["bebida", "galleta", "cereales", "crema"], [86], any_=["polvo", "soluble"]),
    G("Almendras", "200 g", 0.2, "kg", ["almendra"], ["chocolate", "bebida", "crema", "turron", "harina", "galleta", "mezcla"], [133]),
    G("Nueces", "200 g", 0.2, "kg", ["nuez", "nueces"][:1], ["chocolate", "mezcla", "pan", "macadamia", "pecanas", "brasil", "galleta"], [133]),
    G("Pasas", "250 g", 0.25, "kg", ["pasas"], ["chocolate", "mezcla"], [133]),
    G("Café molido", "250 g", 0.25, "kg", ["cafe", "molido"], ["descafeinado", "grano", "ecolog", "colombia", "intenso", "suave", "torrefacto"], [83]),
    G("Galletas María", "800 g", 0.8, "kg", ["galletas", "maria"], ["chocolate", "integral", "sin azucar", "sin gluten", "dorada", "tostada", "fibra", "rellena", "avena"], [80]),
    G("Cereales de desayuno", "500 g", 0.5, "kg", ["cereales"], ["barrita", "bebe", "infantil", "rellenos"], [78]),
    G("Zumo de naranja", "1 L", 1, "L", ["zumo", "naranja"], ["exprimido", "refrigerado", "mango", "zanahoria", "uva", "melocoton", "piña", "pina", "mandarina", "fresa", "frutas"], [143]),
    G("Agua mineral", "5 L", 5, "L", ["agua"], ["gas", "sabor", "limon", "fresa", "melocoton", "tonica", "coco", "gota", "botellin", "pack"], [156]),
    # Verdura y hortalizas
    G("Tomate", "1 kg", 1, "kg", ["tomate"], ["cherry", "pera", "kumato", "rama", "rosa", "raf", "mini", "corazon", "monterosa", "ensalada", "tarrina"], [29]),
    G("Cebolla", "1 kg", 1, "kg", ["cebolla"], ["morada", "roja", "tierna", "dulce", "chalota", "cebolleta", "frita", "picada", "pimiento"], [29]),
    G("Ajo", "250 g", 0.25, "kg", ["ajo"], ["negro", "pelado", "tierno", "picad", "puerro", "perejil"], [29], pantry=True),
    G("Patatas", "1 kg", 1, "kg", ["patata"], ["dulce", "boniato", "baby", "mini", "snack", "lisas", "chips", "fritas", "microondas", "pelada", "cortada", "gajo", "asar", "cocer", "guarnicion", "freir"], [29]),
    G("Calabacín", "1 kg", 1, "kg", ["calabacin"], ["espagueti", "rodajas", "tallarines", "dados", "bandeja", "cortado"], [29]),
    G("Pimiento rojo", "1 kg", 1, "kg", ["pimiento", "rojo"], ["verde", "tiras", "asado", "padron", "italiano", "tricolor", "mini", "dados"], [29]),
    G("Pimiento verde", "1 kg", 1, "kg", ["pimiento", "verde"], ["rojo", "tiras", "asado", "padron", "tricolor", "mini", "dados"], [29]),
    G("Zanahoria", "1 kg", 1, "kg", ["zanahoria"], ["rallada", "baby", "bastones", "dados", "mini", "cortada"], [29]),
    G("Berenjena", "1 kg", 1, "kg", ["berenjena"], ["rodajas", "asada", "crema"], [29]),
    G("Champiñones", "250 g", 0.25, "kg", ["champinon"], ["laminado", "lata", "pie", "crema", "salsa"], [29]),
    G("Brócoli", "500 g", 0.5, "kg", ["brocoli"], ["arroz", "crema", "ramilletes congelado"], [29]),
    G("Coliflor", "1 kg", 1, "kg", ["coliflor"], ["arroz", "crema"], [29]),
    G("Puerro", "500 g", 0.5, "kg", ["puerro"], ["crema"], [29]),
    G("Calabaza", "1 kg", 1, "kg", ["calabaza"], ["crema", "pipas", "dados"], [29]),
    G("Judías verdes", "500 g", 0.5, "kg", ["judia", "verde"], ["redonda", "lata"], [29, 145]),
    G("Guisantes congelados", "400 g", 0.4, "kg", ["guisante"], ["zanahoria", "jamon", "lata"], [145]),
    G("Pepino", "unidad (~300 g)", 0.3, "kg", ["pepino"], ["mini", "encurtido", "pepinillo"], [29]),
    G("Aguacate", "unidad (~200 g)", 0.2, "kg", ["aguacate"], ["guacamole", "mini", "triturado", "dados", "smoothie"], [27, 29]),
    G("Perejil", "bolsa 50 g", 0.05, "kg", ["perejil"], ["ajo", "seco", "deshidratado"], [29]),
        G("Lechuga", "unidad", 1, "ud", ["lechuga"], ["bolsa", "mezcla", "brotes", "cogollo", "corazon", "ensalada", "mini", "hoja de roble", "lollo", "batavia"], [28]),
    G("Espinacas", "300 g", 0.3, "kg", ["espinaca"], ["baby", "brotes", "mezcla", "ensalada", "rucula", "canonigo"], [28, 29]),
    G("Espárragos verdes", "manojo 250 g", 0.25, "kg", ["esparrago", "verde"], ["lata", "blanco", "trigueros en conserva"], [29]),
    G("Repollo", "1 kg", 1, "kg", ["repollo", "col"][:1], ["lombarda", "ensalada"], [29]),
    G("Verduras para menestra", "bolsa 400 g", 0.4, "kg", ["menestra"], [], [145]),
    # Fruta
    G("Plátanos", "1 kg", 1, "kg", ["platano"], ["macho", "mini", "ecolog"], [27]),
    G("Manzanas", "1 kg", 1, "kg", ["manzana"], ["troceada", "trozos", "rodajas", "ecolog", "mini", "macedonia", "pera"], [27]),
    G("Naranjas", "1 kg", 1, "kg", ["naranja"], ["sanguina", "troceada", "ecolog", "pelada", "gajos"], [27]),
    G("Limones", "500 g", 0.5, "kg", ["limon"], ["ecolog", "verde", "lima"], [27]),
    G("Peras", "1 kg", 1, "kg", ["pera"], ["troceada", "ecolog", "mini"], [27]),
    G("Fresas", "500 g", 0.5, "kg", ["fresa"], ["congelad"], [27]),
    G("Mandarinas", "1 kg", 1, "kg", ["mandarina"], ["gajos", "lata"], [27]),
    G("Kiwis", "1 kg", 1, "kg", ["kiwi"], ["gold", "ecolog"], [27]),
    G("Uvas", "500 g", 0.5, "kg", ["uva"], ["pasas", "zumo"], [27]),
    # Carne
    G("Pechuga de pollo", "1 kg", 1, "kg", ["pechuga", "pollo"], ["empanad", "rebozad", "marinad", "adobad", "brocheta", "rellen", "ajillo", "tiras", "finas", "dados", "kebab", "corral", "ecolog", "campero", "hamburguesa", "salchicha", "burger", "cuadritos", "taquitos"], [38]),
    G("Muslos de pollo", "1 kg", 1, "kg", ["pollo"], ["marinad", "adobad", "empanad", "corral", "campero", "barbacoa", "deshuesad"], [38], any_=["muslos", "contramuslos", "muslo"]),
    G("Alitas de pollo", "1 kg", 1, "kg", ["alas", "pollo"], ["marinad", "barbacoa", "picante", "corral"], [38]),
    G("Pechuga de pavo", "1 kg", 1, "kg", ["pavo"], ["tacos", "contramuslo", "ajillo", "fiambre", "lonchas", "loncheada", "marinad", "hamburguesa", "salchicha", "burger", "cocida", "asada"], [38]),
    G("Carne picada mixta", "500 g", 0.5, "kg", ["picad"], ["pollo", "pavo", "hamburguesa", "albondiga", "vegetal"], [44], any_=["vacuno", "cerdo", "mixta", "burger"]),
    G("Lomo de cerdo", "1 kg", 1, "kg", ["lomo"], ["adobado", "marinado", "iberico", "relleno", "lonchas", "filetes finos", "cinta", "salchicha", "brocheta"], [37]),
    G("Costillas de cerdo", "1 kg", 1, "kg", ["costilla"], ["barbacoa", "adobad", "marinad", "iberic", "asada"], [37]),
    G("Filetes de ternera", "500 g", 0.5, "kg", ["filete"], ["higado", "marinado", "pollo", "pavo", "cerdo", "empanad", "rellen", "hamburguesa", "finos"], [40], any_=["ternera", "vacuno", "añojo", "anojo"]),
    G("Ternera para guisar", "500 g", 0.5, "kg", ["guisar"], [], [40], any_=["ternera", "vacuno", "añojo", "anojo"]),
    G("Conejo", "1 kg", 1, "kg", ["conejo"], ["ajillo", "adobado"], [42]),
    G("Chorizo", "200 g", 0.2, "kg", ["chorizo"], ["pamplona", "lonchas", "loncheado", "iberico", "picante", "pavo", "pollo", "vegetal", "barbacoa", "mini", "lentejas"], [43, 51]),
    G("Bacon", "200 g", 0.2, "kg", ["bacon"], ["queso", "pavo", "ahumado lonchas finas", "patatas", "taquitos con"], [52]),
    G("Salchichas", "400 g", 0.4, "kg", ["salchicha"], ["pavo", "pollo", "vegetal", "queso", "cocktail", "coctel", "lata", "pan", "hot dog", "bocadillo"], [44, 52]),
    G("Jamón cocido", "200 g", 0.2, "kg", ["jamon", "cocido"], ["taquitos", "tacos", "mini", "pavo", "pollo", "ahumado", "trufa", "hierbas", "lacon", "con"], [48]),
    G("Jamón serrano", "loncheado 100 g", 0.1, "kg", ["jamon", "serrano"], ["pieza", "taquitos", "tacos", "mini", "iberico", "reserva", "gran", "hueso", "pieza", "paleta", "virutas", "maza"], [50]),
    # Pescado y marisco
    G("Salmón", "1 kg", 1, "kg", ["salmon"], ["ahumado", "marinado", "tartar", "hamburguesa", "dados", "taquitos", "teriyaki", "sushi", "tacos"], [31, 34]),
    G("Merluza congelada", "1 kg", 1, "kg", ["merluza"], ["rebozad", "empanad", "varitas", "salsa", "plato", "harina", "tempura", "palitos", "croqueta", "hamburguesa", "pescadilla"], [34, 149]),
    G("Bacalao", "1 kg", 1, "kg", ["bacalao"], ["albondiga", "rebozad", "empanad", "salsa", "croqueta", "buñuelo", "bunuelo", "desmigado", "ajoarriero", "tempura", "pil"], [31, 34, 36, 149]),
    G("Gambas congeladas", "400 g", 0.4, "kg", ["gamba"], ["ajillo", "cocida", "rebozad", "tempura", "gabardina", "brocheta"], [32, 150]),
    G("Langostinos", "500 g", 0.5, "kg", ["langostino"], ["tempura", "rebozad", "cocido grande", "brocheta", "salsa"], [32, 150]),
    G("Calamares", "500 g", 0.5, "kg", ["calamar"], ["romana", "rebozad", "tinta", "relleno", "harina", "frito", "tempura", "salsa", "anillas rebozadas"], [32, 34, 149, 150]),
    G("Mejillones frescos", "malla 1 kg", 1, "kg", ["mejillon"], ["escabeche", "lata", "salsa", "vinagreta", "picante"], [32, 150]),
    G("Sepia", "500 g", 0.5, "kg", ["sepia"], ["rebozad", "salsa", "tinta", "huevas"], [32, 34, 149, 150]),
    # Limpieza e higiene
    G("Papel higiénico", "12 rollos", 12, "ud", ["papel", "higienico"], ["humedo", "toallitas", "compacto", "triple", "perfumado"], [238]),
        G("Detergente", "40 lavados", 40, "lav", ["detergente"], ["capsula", "polvo", "lana", "delicad", "oscura", "negra", "bebe", "sport", "suavizante", "quitamanchas", "color", "frescor", "aloe", "hipoalergenico"], [226]),
    G("Suavizante", "60 lavados", 60, "lav", ["suavizante"], ["concentrado perfume"], [226]),
    G("Lavavajillas a mano", "750 ml", 0.75, "L", ["lavavajillas"], ["maquina", "pastilla", "capsula", "abrillantador", "sal", "aloe", "recarga"], [229], any_=["mano"]),
    G("Lejía", "2 L", 2, "L", ["lejia"], ["gel", "perfumada", "detergente", "spray"], [234]),
    G("Bolsas de basura", "rollo 15 uds", 15, "ud", ["bolsa", "basura"], ["5l", "perfumadas"], [239]),
]


def _rx(w):
    return re.compile(r"(?<![a-z0-9])" + re.escape(norm(w)))


def match(text, it, pack=""):
    t = norm(text)
    tp = norm(text + " " + (pack or ""))
    if not all(_rx(w).search(t) for w in it["inc"]):
        return False
    if it.get("any") and not any(_rx(w).search(t) for w in it["any"]):
        return False
    return not any(_rx(w).search(tp) for w in it.get("exc", []))


# ---------------- Mercadona ----------------
def mercadona_products():
    if os.path.exists(CACHE) and time.time() - os.path.getmtime(CACHE) < 6 * 3600:
        with open(CACHE, encoding="utf-8") as f:
            data = json.load(f)
        if data and "_l2" in data[0]:
            return data
    print("Mercadona: descargando catálogo…")
    tops = get("https://tienda.mercadona.es/api/categories/?lang=es")["results"]
    out = []
    for top in tops:
        for sub in top["categories"]:
            try:
                data = get(f"https://tienda.mercadona.es/api/categories/{sub['id']}/?lang=es")
            except Exception as e:
                print("  aviso Mercadona", sub["id"], e)
                continue
            for cat in data.get("categories", []):
                for p in cat.get("products", []):
                    p["_cat"], p["_catname"], p["_top"], p["_l2"] = sub["id"], sub["name"], top["name"], cat.get("name", "")
                    out.append(p)
            time.sleep(0.25)  # ser amables con el servidor
    with open(CACHE, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    return out


IMG_RX = re.compile(r"/images/([0-9a-f]+)\.jpg")
COUNT_RX = re.compile(r"(\d+)\s*(lavados|rollos|huevos|uds|ud|unidades|dosis|barras|bolsas|tortillas)")


def mercadona_ref(p, ref):
    """€ por unidad de referencia (kg, L, ud o lav) o None si no se puede normalizar."""
    pi = p["price_instructions"]
    price = float(pi["unit_price"])
    fmt = norm(pi.get("reference_format") or "")
    refp = float(pi.get("reference_price") or price)
    if ref == "kg" and fmt == "kg":
        return price, refp
    if ref == "kg" and fmt == "100 g":
        return price, refp * 10
    if ref == "L" and fmt == "100 ml":
        return price, refp * 10
    if ref == "L" and fmt == "l":
        return price, refp
    if ref in ("ud", "lav"):
        m = COUNT_RX.search(norm(p["display_name"]))
        if m:
            return price, price / float(m.group(1))
        if pi.get("total_units"):
            return price, price / float(pi["total_units"])
        if fmt in ("ud", "docena", "lavado", "rollo", "lv"):
            return price, refp / (12 if fmt == "docena" else 1)
        if pi.get("size_format") == "ud" and pi.get("unit_size"):
            return price, price / float(pi["unit_size"])
    return None


def extra_words(name, it):
    return max(0, len(norm(name).split()) - len(it["inc"]))


def best_mercadona(products, it):
    cands = []
    for p in products:
        if "mcat" in it:
            if p.get("_cat") not in it["mcat"]:
                continue
        elif p.get("_top") in NON_FOOD_TOPS:
            continue
        if not match(p["display_name"], it, p.get("packaging")):
            continue
        r = mercadona_ref(p, it["ref"])
        if not r:
            continue
        price, refp = r
        cands.append((extra_words(p["display_name"], it), refp, price, p))
    if not cands:
        return None
    # Entre los nombres más "genéricos" (pocas palabras extra), el más barato por kg/L/ud
    min_extra = min(c[0] for c in cands)
    extra, refp, price, p = min((c for c in cands if c[0] <= min_extra + 3), key=lambda c: c[1])
    return dict(price=round(refp * it["qty"], 2), sale_price=price, ref_price=round(refp, 4),
                product=p["display_name"] + (f" · {p['packaging']}" if p.get("packaging") else ""),
                url=p.get("share_url"), sec=p.get("_top", ""),
                img=(IMG_RX.search(p.get("thumbnail") or "") or [None, ""])[1])


def compact_catalog(products):
    """Catálogo completo en formato compacto:
    [id, nombre, envase, precio, €/ref, ref, sección, pasillo, estante, foto]"""
    rows, seen = [], set()
    for p in products:
        if p["id"] in seen or p.get("_top") == "Maquillaje":
            continue
        seen.add(p["id"])
        pi = p["price_instructions"]
        m = IMG_RX.search(p.get("thumbnail") or "")
        rows.append([p["id"], p["display_name"], p.get("packaging") or "", float(pi["unit_price"]),
                     float(pi.get("reference_price") or pi["unit_price"]), pi.get("reference_format") or "",
                     p.get("_catname", ""), p.get("_top", ""), p.get("_l2", ""), m.group(1) if m else ""])
    return rows


def main():
    os.chdir(HERE)
    merc = mercadona_products()
    print(f"Mercadona: {len(merc)} productos")
    if len(merc) < 1000:
        raise SystemExit("Catálogo de Mercadona demasiado pequeño; no se actualizan los datos.")
    items, missing = [], []
    for it in CATALOG:
        m = best_mercadona(merc, it)
        if not m:
            missing.append(it["name"])
        print(f"  {it['name']:<28} {m and m['price']!s:<6} {m and m['product']}")
        extra = {}
        if it["name"] in NUT:
            extra["nut"] = NUT[it["name"]]
        if it["name"] in UD_G:
            extra["gud"] = UD_G[it["name"]]
        items.append(dict(name=it["name"], unit=it["unit"], qty=it["qty"], ref=it["ref"], pantry=it["pantry"], m=m, **extra))
    if len(missing) > 15:
        raise SystemExit(f"Faltan demasiados precios ({len(missing)}): {', '.join(missing)}")
    updated = datetime.now(timezone.utc).isoformat(timespec="minutes")
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "precios.json"), "w", encoding="utf-8") as f:
        json.dump(dict(updated=updated, items=items), f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT, "catalogo.json"), "w", encoding="utf-8") as f:
        json.dump(dict(updated=updated, rows=compact_catalog(merc)), f, ensure_ascii=False, separators=(",", ":"))
    print(f"Guardados precios.json y catalogo.json · sin precio: {', '.join(missing) or 'ninguno'}")


if __name__ == "__main__":
    main()
