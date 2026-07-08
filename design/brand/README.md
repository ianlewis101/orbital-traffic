# Icon source (orbit-ring mark)

Editable vector originals for the app icon used throughout `apps/web/public/icons/`
and the iOS `AppIcon.appiconset`.

- `icon-master.svg` — full-detail mark, used to render every size 72px and up.
- `icon-favicon-master.svg` — bolder variant (thicker ring, larger blip) used only
  for 16/32/48px. At true favicon size the fine ring detail from the full mark
  disappears into a blur, so this variant fattens the stroke and grows the blip
  until it reads clearly at that size.
- `icon-mark-transparent.svg` — same mark, no background, for overlay use on
  existing dark surfaces (e.g. in-app HUD, docs).

Palette: `#eef1f8 → #5eead4 → #a78bfa` gradient on `#07080f` — same tokens as
`apps/web/src/config.js` / the app's own CSS custom properties, so any future
re-export stays on-brand automatically.

To re-render at a custom size (requires `librsvg`):
```
rsvg-convert -w 1024 -h 1024 icon-master.svg -o icon-1024.png
```
