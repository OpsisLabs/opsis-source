# Opsis README artwork

The silent eight-second banner follows the electric-blue and luminous-dot visual
language of the Opsis promotional profile. The emblem is the project's original
profile artwork, used at the project owner's request. Its source is
<https://pbs.twimg.com/profile_images/2100242635260620800/7-YSO2jw_400x400.jpg>,
retrieved 19 October 2026. It is not newly generated third-party artwork.

`opsis-banner.html` is the editable composition. It uses the repository's Space
Grotesk and IBM Plex Mono fonts; their license notices remain beside those fonts
in `apps/web/public/opsis/`. From the repository root, run:

```sh
node scripts/render-readme-banner.mjs
```

This requires the existing Playwright dependency, Chrome, and ffmpeg. It renders
80 deterministic frames into the looping GIF and a static PNG. The README offers
the PNG for reduced-motion users and as a separate link. No product data or
performance metric is depicted in the banner.
