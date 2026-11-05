# Vidarbha Archaeological Atlas

**Concept & Design by K.S.Chandra 2026**

A static, hosting-ready interactive GIS atlas of archaeological sites across Vidarbha, built from the supplied `Archaeological Sites.xlsx` dataset and enriched with 11 district administrative boundaries, major river systems, and topographic relief features.

## What is included

- **Interactive Map of Vidarbha**: High-performance, pan-and-zoom interactive map powered by Leaflet with multi-layer topographic rendering.
- **11 Administrative Districts of Vidarbha**:
  - **Nagpur Division**: Nagpur, Wardha, Bhandara, Gondia, Chandrapur, Gadchiroli
  - **Amravati Division**: Amravati, Akola, Buldhana, Washim, Yavatmal
  - Boundaries, district headquarters, centroids, and district-level site counts with interactive polygon selection and filtering.
- **Topographic & Hydrographic Features**:
  - **Major River Systems**: Wainganga, Wardha, Painganga (Penganga), Pranhita, Godavari, Purna, Tapi (Tapti), Kanhan, Pench, Indravati, and Erai.
  - **Mountain Ranges & Plateaus**: Satpura Range & Gawilgarh Hills (Melghat), Ajanta Range / Buldhana & Washim Plateau, Ramtek-Mansar Ridge, Tadoba-Chimur Uplands, and Surjagarh & Bhamragad Highlands.
  - **Landmarks & Peaks**: Chikhaldara Peak (1,118 m, highest summit in Vidarbha), Gawilgarh Fort Hill (1,030 m), Lonar Meteorite Crater, Mansar Vakataka Archaeological Complex, Ramtek Hill citadel, Nagardhan Fort, Pauni Ancient Stupas, Sahasrakund Waterfall, and Sironcha confluence.
  - **Water Bodies & Reservoirs**: Gosikhurd (Indira Sagar), Totladoh (Pench), Navegaon Lake, Itiadoh, and Upper Wardha (Morshi).
- **Basemap Switcher**:
  - Topographic Relief & Contours (Esri World Topo)
  - Shaded Physical Relief
  - Clean Cartographic Streets (Esri World Street Map)
  - Satellite Imagery
- **Layer Toggles**:
  - Independent visibility switches for Districts, River Systems, Topography & Ranges, Landmarks, and Archaeological Sites.
- **Search & Filtering**:
  - Search across site name, district, type, investigator, date/year, and references.
  - Dedicated **District filter** for isolating sites by administrative district.
  - Type, investigator, and date/year filtering.
- **Site Details & Browse**:
  - Clickable markers and interactive result cards with complete site metadata, coordinates copy utility, `Reference 1`, and `Reference 2`.
  - Zoom to site button with close-up topographic inspection.
- **No external dependencies at runtime**: Leaflet is bundled locally in `assets/leaflet/` for offline reliability, with zero build steps or server-side requirements.

## Credits & Attribution

- **Concept & Design**: K.S.Chandra 2026
- **Data Source**: `Archaeological Sites.xlsx` (742 Coordinate Records)

## Hosting & Local Preview

Upload the **contents of this `atlas-site` folder** to any static web host, including GitHub Pages, Netlify, Vercel static hosting, Apache, or IIS. The site entry point is `index.html`.

For a local preview in PowerShell, run this from `atlas-site`:

```powershell
npx serve .
```

Then open the local address shown by the command.
