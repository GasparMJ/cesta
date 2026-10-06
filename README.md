# Cesta

App web para iPhone (y cualquier móvil): lista de la compra con precios reales de Mercadona,
menú semanal que genera la lista, compras habituales y un recetario de 180 recetas caseras.

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
| `recetas_base.txt` | El recetario editable (formato explicado al principio del archivo). |
| `.github/workflows/publicar.yml` | Cada lunes actualiza los precios y publica en GitHub Pages. |

## Uso habitual

- **Añadir recetas:** edita `recetas_base.txt`, ejecuta `python scripts/build_recetas.py` y sube los cambios.
- **Actualizar precios a mano:** en GitHub, pestaña *Actions* → *Actualizar precios y publicar* → *Run workflow*.
- **Cambiar la app (`web/index.html`, `web/app.js`):** sube también un cambio de `VERSION` en `web/sw.js`
  para que los móviles descarguen la versión nueva.

## Probar en el ordenador

```bash
cd web
python -m http.server 8000
```

Y abre http://localhost:8000.
