# Visual Design Brief: Orange Tabby Studio

## Direction

Orange Tabby Studio is a warm, cozy desktop audio workspace powered by a friendly orange cat assistant. It should feel playful and polished like a Japanese mascot utility or cute game launcher, while remaining clear and dependable for serious local transcription.

The assistant uses a warm orange body, dark brown outline, peach inner ears, cream paws and tail tip, a simple happy expression, soft rounded shapes, and an energetic but professional personality.

## Palette

```css
:root {
  --color-bg: #fff6e8;
  --color-bg-soft: #ffe9cf;
  --color-bg-warm: #ffd9b0;
  --color-panel: rgb(255 250 241 / 0.88);
  --color-panel-strong: #fffaf2;
  --color-panel-warm: #ffe3c2;
  --color-border: rgb(126 72 38 / 0.18);
  --color-border-strong: rgb(126 72 38 / 0.34);
  --color-text: #3b2418;
  --color-muted: #8a6755;
  --color-subtle: #b18a75;
  --color-accent: #f58b4c;
  --color-accent-2: #ffb36b;
  --color-accent-3: #ffcf8a;
  --color-coral: #ff8f9c;
  --color-ready: #61c7a8;
  --color-processing: #f6a84f;
  --color-paused: #8aa7ff;
  --color-error: #ef6f6c;
  --color-outline-cat: #5a2f1e;
  --color-cat-orange: #f49a5b;
  --color-cat-stripe: #d66f3f;
  --color-cat-cream: #fff2df;
  --radius-lg: 18px;
  --radius-xl: 28px;
  --radius-pill: 999px;
  --shadow-soft: 0 20px 60px rgb(126 72 38 / 0.16);
  --shadow-warm: 0 16px 48px rgb(245 139 76 / 0.22);
}
```

## Component Style

- Use a cream-paper background with soft peach gradients, warm orange glow, faint waveform curves, and low-contrast dot or paw details.
- Panels are ivory surfaces with thin warm-brown outlines, peach inner highlights, rounded corners, and small cat-ear or paw-inspired corner details.
- The hero places the title, privacy promise, and runtime badge on the left. The orange tabby assistant belongs to a small studio console scene on the right with a connected speech bubble.
- The audio upload area is the visual center: a large cream recording pad with a warm dashed border, waveform details, friendly empty-state copy, and a capsule file-picker button.
- Model, language, output, and CPU controls are compact cream chips with orange-brown borders and clear labels.
- Progress uses a waveform-style meter with warm orange fill, a visible percentage, and a text status badge.
- Runtime dependencies look like compact studio equipment modules rather than generic dashboard cards.
- Logs open as a themed console drawer with a warm dark-brown terminal surface and orange/coral highlights.

## Spacing Scale

- `4px`: fine waveform and icon details.
- `8px`: label-to-control and badge spacing.
- `12px`: compact chip and inline group spacing.
- `16px`: standard component padding and grid gaps.
- `24px`: panel section spacing.
- `32px`: major region spacing.
- `48px`: hero breathing room on wide desktop layouts.

## Concrete UI References

1. A cozy Japanese mascot app with a friendly animal assistant, warm cream/orange surfaces, rounded panels, a soft speech bubble, and cute but functional controls.
2. A Nintendo-like utility interface with an unmistakable primary action, friendly iconography, rounded controls, and playful feedback that never obscures the task.
3. A small anime recording studio in daylight with an orange tabby assistant, audio-waveform decorations, and a calm local-first workflow.

## Guardrails

- Keep transcription logic, file handling, runtime checks, IPC/API contracts, and existing state logic unchanged.
- Do not add a heavy UI library.
- Do not use midnight navy, plum dark mode, cyberpunk styling, black glass panels, purple-heavy decoration, generic SaaS cards, enterprise admin layout, or muddy brown surfaces.
- Ensure status states use readable text in addition to color.
- Preserve keyboard focus, labels, disabled states, and `prefers-reduced-motion`.

## Acceptance Criteria

- The primary palette is warm cream and orange.
- The interface clearly references an orange tabby without becoming a toy UI.
- The assistant is integrated into the hero scene.
- The main drop zone is visually dominant.
- The progress meter reads as an audio waveform.
- Runtime setup resembles compact studio equipment.
- The screen remains readable and usable on desktop and compact widths.
