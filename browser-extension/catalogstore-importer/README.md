# CatalogStore Browser Product Importer

This Manifest V3 Chrome extension is the browser-assisted half of the CatalogStore supplier URL importer.

## Install for development

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select this `browser-extension/catalogstore-importer` folder.
5. Refresh the 4REGN/CatalogStore dashboard.

The dashboard continues to try its server preview first. When SHEIN or another supplier returns an anti-bot shell or omits images/variants, it automatically asks this extension to open the real product page, wait for rendered controls, capture the data, and copy the photos into the draft form.

Captured products are always draft-first. Browser-captured data must be reviewed before publishing.
