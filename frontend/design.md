# Design: SacDau frontend

The locked system. Every Hallmark run reads this first and pages share it. Change it on purpose; the file is the rule.

## System
- Genre: modern-minimal
- Shape of the first page: Map / Diagram (landing); app screen (after sign-in)
- Theme: Wayfind, colourway platform
- Axes: light/mono/cool · posture: committed

## Tokens
`src/tokens.css` is the source of truth (a Tailwind 4 `@theme static` block plus `:root`). The roles:
```css
:root {
  --color-paper: oklch(95.5% 0.006 250);  --color-paper-2: oklch(91% 0.009 250);  --color-paper-3: oklch(99.5% 0.005 250);
  --color-ink: oklch(16% 0.014 262);  --color-ink-2: oklch(29% 0.014 262);  --color-muted: oklch(47% 0.016 260);  --color-rule: oklch(80% 0.011 250);
  --color-accent: oklch(51% 0.22 264);  --color-accent-2: oklch(81% 0.16 82);  --color-accent-ink: oklch(99.5% 0.003 250);  --color-focus: oklch(51% 0.22 264);
  --color-accent-lit: oklch(72% 0.15 264);  /* cobalt on the ink surfaces */
  --font-display: "Chivo Mono", ui-monospace, monospace;  --font-body: var(--font-display);  --font-outlier: var(--font-body);
  --radius-card: 0;  --radius-pill: 999px;  --rule-hair: 1px;  --rule-bar: 2px;  --shadow-card: 0 24px 40px -24px oklch(8% 0.01 260 / 0.6);
}
```
The spacing scale, the type scale, the easings and the durations are the scaffold's and live in `src/tokens.css`. Page rules live in `src/index.css`, under the Hallmark stamp.

## Rules that hold on every page
- Every glyph in Chivo Mono (400, 500, 800), loaded with the Vietnamese subset; never a proportional face.
- Radius 0 everywhere except pills; surfaces are 2px ink borders, never soft shadows on cards.
- Cobalt marks what is live and the one primary action; amber colours figures only on ink.
- Labels, table heads and nav links: 500 weight, a step smaller, sentence case, untracked.
- Heads: 800, line-height 1.08 (Vietnamese stacked diacritics need the room).

## Controls
- Primary: cobalt fill, square, Chivo Mono 800, 48px tall (`.btn.btn--primary`)
- Secondary: transparent with a 2px ink border, same height (`.btn`); app bar controls 40px (`.btn--sm`) with a 44px hit area
- Inputs: square, 2px ink border on paper-3, 48px, inset focus ring (`.field__input`)

## Motion
- Character: severe. Colour changes in `steps(1)` at `--dur-micro`; no reveal on scroll; under reduced motion everything ends at once.

## Exports
`src/tokens.css` in this project (Tailwind 4 utilities: `bg-paper`, `text-ink`, `font-display`, `rounded-card`…).
