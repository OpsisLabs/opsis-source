# Original Opsis front door

Restored from `https://github.com/OpsisLabs/Opsis`, revision `5f5f966`, `dist/`, on 20 September 2026 under founder decision D12. The original CSS, scene geometry, fonts, illustrations, previews and particle-transition implementation are preserved. Three.js carries its original MIT license in `assets/vendor/LICENSE`; font licenses accompany the fonts.

Integration changes: four-workspace navigation; validated public-address search; document-bound tool-name events to the React host; original terminal transitions retained; scene import uses a local module instead of an inline import map; scene pauses behind workspaces. The original demo renderers and live news/market clients are not shipped. Live headlines are explicitly unavailable; no new provider or API is introduced. The existing frozen `/quant/` artifact is untouched. `integration.js` and `integration.css` contain the added controls.
