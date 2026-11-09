# CestaFácil

Planificador semanal de menús y lista de la compra con precios reales de supermercados
(Mercadona, Carrefour, Dia, Aldi, Eroski, Alcampo). Lidl: precios introducidos por cada usuario.

- `index.html`: la app (todo en un archivo).
- `prices.js`: los precios. Se actualiza solo cada lunes.
- `scripts/update_prices.mjs`: descarga los precios del comparador Findit (finditapp.es).
- `.github/workflows/actualizar-precios.yml`: programa la actualización semanal.

Cada persona que usa la app guarda sus ajustes y sus precios corregidos en su propio móvil.
Los precios son orientativos: no incluyen ofertas de cada tienda.
