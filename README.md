# Cesta

App web para iPhone (y cualquier móvil): lista de la compra con precios reales de Mercadona,
despensa con caducidades, menú semanal que genera la lista, compras habituales y guardadas,
presupuesto, bajadas e historial de precios, recetario de más de 400 recetas con modo cocina y
temporizadores, e información nutricional (datos reales de Open Food Facts cuando existen).

Se instala desde Safari con **Compartir → Añadir a pantalla de inicio** y funciona sin conexión.
Los datos del usuario (lista, menú, historial) se guardan solo en el móvil; en Ajustes se puede
hacer una copia de seguridad.

## Estructura

| Ruta | Qué es |
|---|---|
| `web/` | La app que se publica (HTML, JS, service worker, iconos y datos). |
| `web/data/` | `precios.json`, `catalogo.json` y `recetas.json`, generados por los scripts. |
| `scripts/actualizar_precios.py` | Descarga el catálogo de Mercadona y calcula los precios. |
| `scripts/build_recetas.py` | Convierte `recetas_base.txt` en `web/data/recetas.json`. |
| `scripts/make_icons.py` | Genera los iconos. |
| `recetas_base.txt`, `recetas_extra_*.txt` | El recetario editable (formato explicado al principio de `recetas_base.txt`). |
| `scripts/nutricion.py` | Valores nutricionales medios de referencia de los alimentos básicos. |
| `scripts/enriquecer.py` | Códigos de barras, nutrición de Open Food Facts e historial semanal de precios. |
| `scripts/cache/` | Cachés de códigos de barras y de Open Food Facts (se refresca cada 30 días). |
| `.github/workflows/publicar.yml` | Cada lunes actualiza los precios y publica en GitHub Pages. |

## Uso habitual

- **Añadir recetas:** edita `recetas_base.txt` o un `recetas_extra_*.txt` (o crea otro), ejecuta `python scripts/build_recetas.py` y sube los cambios.
- **Actualizar precios a mano:** en GitHub, pestaña *Actions* → *Actualizar precios y publicar* → *Run workflow*.
- **Cambiar la app (`web/index.html`, `web/app.js`):** sube también un cambio de `VERSION` en `web/sw.js`
  para que los móviles descarguen la versión nueva.

## Probar en el ordenador

```bash
cd web
python -m http.server 8000
```

Y abre http://localhost:8000.

## Datos de terceros

- Precios y catálogo: tienda online de Mercadona.
- Información nutricional: [Open Food Facts](https://world.openfoodfacts.org), base de datos abierta
  bajo licencia [ODbL](https://opendatacommons.org/licenses/odbl/1-0/).
