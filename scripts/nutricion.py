"""Valores nutricionales medios de referencia de los alimentos genéricos de Cesta.

Por 100 g (o 100 ml) de parte comestible: (kcal, proteínas g, grasas g, hidratos g).
Son valores aproximados de tablas de composición de alimentos habituales (tipo BEDCA/USDA);
cada marca concreta puede variar. Mercadona no publica estos datos en su API.

UD_G: peso en gramos de una unidad para los alimentos que se cuentan por unidades.
"""

NUT = {
    "Leche entera": (63, 3.1, 3.6, 4.7), "Leche semidesnatada": (46, 3.2, 1.6, 4.8),
    "Nata para cocinar": (195, 2.5, 18, 4), "Huevos": (143, 12.6, 9.5, 0.7), "Mantequilla": (717, 0.9, 81, 0.1),
    "Yogur natural": (61, 3.5, 3.3, 4.7), "Queso rallado": (380, 28, 29, 1.5), "Queso curado": (400, 25, 33, 0.5),
    "Queso fresco": (175, 12, 13, 3), "Mozzarella": (250, 18, 19, 1.5), "Queso de cabra": (280, 18, 23, 1),
    "Pan de molde": (265, 8, 4, 48), "Barra de pan": (270, 9, 1.5, 55), "Tortillas de trigo": (310, 8.5, 7, 52),
    "Masa de hojaldre": (410, 5.5, 26, 38), "Pan rallado": (380, 12, 5, 72),
    "Arroz": (355, 7, 0.6, 79), "Pasta (macarrones)": (355, 12.5, 1.5, 72), "Espaguetis": (355, 12.5, 1.5, 72),
    "Fideos": (355, 12.5, 1.5, 72), "Lentejas": (314, 24, 1.5, 48), "Garbanzos cocidos": (120, 7, 2.5, 16),
    "Alubias blancas cocidas": (100, 7, 0.5, 14), "Harina de trigo": (350, 10, 1.2, 74), "Azúcar": (400, 0, 0, 100),
    "Sal": (0, 0, 0, 0), "Aceite de oliva virgen extra": (899, 0, 99.9, 0), "Aceite de girasol": (899, 0, 99.9, 0),
    "Vinagre": (20, 0, 0, 0.5), "Tomate triturado": (30, 1.3, 0.2, 4.5), "Tomate frito": (75, 1.5, 3.5, 9),
    "Caldo de pollo": (5, 0.6, 0.2, 0.3), "Caldo de verduras": (6, 0.2, 0.2, 1),
    "Atún en aceite": (200, 26, 10, 0), "Sardinas en lata": (210, 24, 12, 0), "Mejillones en escabeche": (170, 16, 10, 3),
    "Maíz dulce": (80, 2.7, 1.2, 14), "Aceitunas": (145, 1, 15, 0.5), "Pimentón": (290, 14, 13, 34),
    "Comino": (375, 18, 22, 44), "Orégano": (265, 9, 4, 69), "Pimienta negra": (250, 10, 3, 64), "Laurel": (310, 7.6, 8, 75),
    "Canela": (247, 4, 1.2, 81), "Curry": (325, 14, 14, 56), "Cuscús": (360, 13, 1.5, 73), "Quinoa": (368, 14, 6, 64),
    "Copos de avena": (370, 13, 7, 60), "Salsa de soja": (55, 8, 0.1, 5), "Mayonesa": (680, 1, 75, 1),
    "Mostaza": (66, 4, 3.5, 5), "Miel": (304, 0.3, 0, 82), "Chocolate negro": (550, 7, 35, 45),
    "Cacao en polvo": (380, 5, 3, 80), "Almendras": (610, 21, 52, 7), "Nueces": (654, 15, 65, 7), "Pasas": (300, 3, 0.5, 70),
    "Galletas María": (440, 7, 12, 74), "Cereales de desayuno": (380, 8, 3, 80), "Zumo de naranja": (45, 0.7, 0.2, 10),
    "Agua mineral": (0, 0, 0, 0),
    "Tomate": (19, 0.9, 0.2, 3.5), "Cebolla": (38, 1.1, 0.1, 8), "Ajo": (130, 6, 0.5, 27), "Patatas": (77, 2, 0.1, 17),
    "Calabacín": (17, 1.2, 0.3, 2.5), "Pimiento rojo": (31, 1, 0.3, 6), "Pimiento verde": (20, 0.9, 0.2, 4),
    "Zanahoria": (41, 0.9, 0.2, 8), "Berenjena": (25, 1, 0.2, 4.5), "Champiñones": (22, 3, 0.3, 3), "Brócoli": (34, 2.8, 0.4, 4.5),
    "Coliflor": (25, 2, 0.3, 4), "Puerro": (61, 1.5, 0.3, 12), "Calabaza": (26, 1, 0.1, 6), "Judías verdes": (31, 1.8, 0.2, 5),
    "Guisantes congelados": (81, 5.4, 0.4, 12), "Pepino": (15, 0.7, 0.1, 3), "Aguacate": (160, 2, 15, 2), "Perejil": (36, 3, 0.8, 6),
    "Lechuga": (15, 1.4, 0.2, 2), "Espinacas": (23, 2.9, 0.4, 1.6), "Espárragos verdes": (20, 2.2, 0.1, 2),
    "Repollo": (25, 1.3, 0.1, 5), "Verduras para menestra": (45, 3, 0.3, 7),
    "Plátanos": (89, 1.1, 0.3, 22), "Manzanas": (52, 0.3, 0.2, 12), "Naranjas": (47, 0.9, 0.1, 10), "Limones": (29, 1.1, 0.3, 6),
    "Peras": (57, 0.4, 0.1, 13), "Fresas": (32, 0.7, 0.3, 6), "Mandarinas": (53, 0.8, 0.3, 12), "Kiwis": (61, 1.1, 0.5, 13),
    "Uvas": (69, 0.7, 0.2, 17),
    "Pechuga de pollo": (110, 23, 1.5, 0), "Muslos de pollo": (140, 19, 7, 0), "Alitas de pollo": (200, 18, 14, 0),
    "Pechuga de pavo": (105, 23, 1, 0), "Carne picada mixta": (240, 17, 19, 0), "Lomo de cerdo": (150, 21, 7, 0),
    "Costillas de cerdo": (280, 17, 23, 0), "Filetes de ternera": (130, 22, 4.5, 0), "Ternera para guisar": (150, 20, 8, 0),
    "Conejo": (135, 21, 5.5, 0), "Chorizo": (450, 24, 38, 2), "Bacon": (400, 14, 38, 1), "Salchichas": (280, 12, 25, 2),
    "Jamón cocido": (110, 18, 3, 1.5), "Jamón serrano": (240, 30, 13, 0),
    "Salmón": (208, 20, 13, 0), "Merluza congelada": (75, 17, 0.8, 0), "Bacalao": (80, 18, 0.7, 0),
    "Gambas congeladas": (85, 18, 1, 0), "Langostinos": (90, 19, 1.2, 0), "Calamares": (90, 16, 1.5, 3),
    "Mejillones frescos": (30, 4.5, 0.8, 1), "Sepia": (80, 16, 1, 1),
}

UD_G = {"Huevos": 55, "Barra de pan": 250, "Tortillas de trigo": 40, "Lechuga": 400}
