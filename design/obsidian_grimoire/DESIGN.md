# Design System: Nikczemny Krzemuch

## 1. Overview & Creative North Star
**Creative North Star: "The Living Manuscript"**

This design system rejects the "flat and sterile" trend of modern SaaS in favor of a "Living Manuscript." The goal is to make the user feel as though they are interacting with a sentient, mystical artifact. We achieve this by blending high-end editorial layouts with the atmospheric depth of dark fantasy. 

The UI breaks the "template" look through **intentional asymmetry**—where heavy serif headings are offset by airy, minimal AI-driven modules. We utilize overlapping elements (e.g., a glassmorphic card partially obscuring a weathered background texture) to create a sense of physical space and "found footage" realism. This is not a dashboard; it is an ancient interface bridge between the player and the arcane AI.

---

## 2. Colors: Tonal Depth & The "No-Line" Rule
The palette is built on **Deep Obsidian** foundations, punctuated by **Mystical Purple** energy and **Parchment Gold** utility.

### The "No-Line" Rule
Traditional 1px solid borders are strictly prohibited for sectioning. They shatter the illusion of a seamless, mystical experience. Instead:
- **Tonal Shifts:** Define boundaries by shifting from `surface` (#0e0e10) to `surface_container_low` (#131316).
- **Glow Boundaries:** Use a subtle `primary` (#c59aff) outer glow (blur: 20px, opacity: 5%) to define an active container's edge.

### Surface Hierarchy & Nesting
Treat the UI as a series of stacked, semi-transparent layers of "obsidian glass."
1.  **Base Layer:** `surface_dim` (#0e0e10) with a faint, weathered noise texture.
2.  **Navigation/Sidebar:** `surface_container_low` (#131316) to provide a soft anchor.
3.  **Active Modules:** `surface_container_high` (#1f1f22) with a backdrop blur of 12px.
4.  **Floating AI Overlays:** `surface_container_highest` (#262529) at 80% opacity to create maximum focus.

### The "Glass & Gradient" Rule
Main CTAs and AI interaction points should never be flat. Use a linear gradient transitioning from `primary_dim` (#9547f7) to `primary` (#c59aff) at a 135-degree angle to simulate "pulsing mana."

---

## 3. Typography: The Arcane & The Functional
The contrast between the mystical serif and the technical sans-serif represents the bridge between the RPG narrative and the AI system.

*   **Display & Headlines (Noto Serif):** These are your "Manuscript" elements. Use `display-lg` for world titles and `headline-md` for quest headers. Use `tertiary` (#ffefd5) for these tokens to evoke aged parchment gold. Letter spacing should be slightly tight (-0.02em) to feel authoritative.
*   **Body & Labels (Manrope):** These are your "System" elements. Use `body-md` for AI-generated lore and `label-md` for technical stats. These should remain in `on_surface_variant` (#adaaad) to keep the focus on the narrative headers.
*   **Signature Styling:** All `headline-lg` elements should have a very subtle `text-shadow` using `primary_dim` at 10% opacity to suggest the text is etched in light.

---

## 4. Elevation & Depth: Tonal Layering
We move away from the "shadow-drop" of the early 2010s. Depth is an environmental effect.

*   **The Layering Principle:** To lift a card, do not add a shadow. Instead, place a `surface_container_highest` card onto a `surface_dim` background. The delta in luminance creates the "lift."
*   **Ambient Glows:** For AI-suggested actions, use "Ambient Glows." This is a shadow with a blur of 40px, a spread of 2px, and a color of `primary_fixed_dim` (#b075ff) at 8% opacity. It should feel like the component is radiating light onto the table.
*   **The "Ghost Border" Fallback:** For input fields or nested lists, use the `outline_variant` (#48474a) at 15% opacity. It should be barely visible, acting as a whisper of a boundary.

---

## 5. Components: The Alchemist's Toolkit

### AI-Integrated Input Fields
*   **Style:** No background color. Only a bottom "Ghost Border."
*   **Focus State:** The bottom border transitions to a `primary` gradient, and the `label-sm` above it glows in `tertiary` (Parchment Gold).
*   **AI Suggestion:** Ghost text appears in `primary_dim` with a "shimmer" animation.

### Primary Action Buttons
*   **Shape:** `rounded-sm` (0.125rem). In dark fantasy, sharp or slightly softened corners feel more "forged" than hyper-rounded pills.
*   **Treatment:** A `surface_tint` (#c59aff) fill with `on_primary` (#420082) text. Add a 1px inner "sheen" on the top edge using `primary_fixed` (#ba88ff) at 30% opacity to simulate a glass edge.

### Glassmorphic Cards
*   **Usage:** For character stats or AI lore summaries.
*   **Execution:** `surface_container_highest` at 60% opacity, `backdrop-filter: blur(16px)`. No dividers; use `spacing-6` (2rem) of vertical white space to separate the header from the content.

### Floating Chips
*   **Style:** `surface_bright` (#2c2c2f) background with a `tertiary` (#ffefd5) border at 10% opacity. Use these for spell categories or AI tags.

---

## 6. Do's and Don'ts

### Do
*   **Do** use asymmetrical layouts. A character portrait might bleed off the edge of a card to break the "grid" feel.
*   **Do** use `tertiary` (#ffefd5) for high-value information (e.g., Gold, Legendary items).
*   **Do** lean into `surface_container_lowest` (#000000) for deep-set areas like the main game map or chat history.

### Don't
*   **Don't** use pure white (#ffffff) for text. Always use `on_surface` (#fffbfe) or `on_surface_variant` (#adaaad) to prevent eye strain against the obsidian background.
*   **Don't** use standard "Material Design" shadows. They are too grey and "digital." Use tinted glows or tonal shifts.
*   **Don't** use horizontal rules (HRs). If you need to separate content, use a `2px` tall gradient line that fades to 0% opacity at both ends.