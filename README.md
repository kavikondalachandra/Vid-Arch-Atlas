# Vidarbha Archaeological Atlas

A static, hosting-ready interactive website built from the supplied `Archaeological Sites.xlsx` workbook and `Vidarbha.png` map.

## What is included

- Interactive, pan-and-zoom map with all coordinate records plotted.
- Search across site name, type, investigator, date/year, and both reference fields.
- Type, investigator, and date/year filtering.
- Clickable markers and result cards with complete site metadata, `Reference 1`, and `Reference 2`.
- Responsive layout for desktop and mobile.
- No build step, database, API key, or server-side runtime required.

## Hosting

Upload the **contents of this `atlas-site` folder** to any static host, including GitHub Pages, Netlify, Vercel static hosting, Apache, or IIS. The site entry point is `index.html`.

For a local preview in PowerShell, run this from `atlas-site`:

```powershell
npx serve .
```

Then open the local address shown by the command.

## Updating the workbook data

The browser reads the pre-generated `data/sites.js` file, so it can run even when `index.html` is opened directly. To regenerate the browser data after editing the source workbook, run this command from the parent folder:

```powershell
.\atlas-site\scripts\export-sites.ps1
```

The script reads the `sites` worksheet from `Archaeological Sites.xlsx` and writes:

- `data/sites.json` — reusable structured data
- `data/sites.js` — browser-ready data used by the atlas

The script uses Microsoft Excel through Windows automation, so Excel needs to be installed on the machine that runs the export.

## Coordinate placement

Marker placement is calibrated to the longitude and latitude ticks printed in the supplied map image. The workbook has 742 coordinate records. Most fall inside the printed Vidarbha frame; records outside that frame remain searchable and appear when **Fit results** is selected.
