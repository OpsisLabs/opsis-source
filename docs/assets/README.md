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
160 deterministic frames at 20 fps into the looping GIF and a static PNG. The
emblem stays upright with a subtle eight-second pulse in scale and brightness;
an orbiting light and a sweep across the wordmark complete the loop. The README
embeds the GIF directly and provides a
separate still-image link for readers who prefer no motion. No product data or
performance metric is depicted in the banner.
