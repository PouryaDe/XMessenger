# UI/UX Design System Specification (Warm Minimalist & Telegram Standard)

This design system contract defines the visual identity, color harmony, typography, spacing, component primitives, and interaction patterns for **XMessenger**, established directly from user feedback, real-world testing, and mobile-first principles.

---

## 1. Visual Theme & Color Harmony

### 1.1. Light Mode (Warm Linen / Sand Canvas)
- **Ambient Canvas Background**:
  - Class: `.bg-ambient-canvas`
  - Base Color: `#DFDDD6` (Warm sandy linen / paper tone).
  - Ambient radial gradients: subtle warm golden amber (`rgba(235, 225, 189, 0.70)`) and muted soft slate (`rgba(213, 223, 235, 0.72)`).
  - **Rule**: NEVER use cold gray, plain stark white, or harsh yellow backgrounds.
- **Message Bubbles (Color Harmony Contract)**:
  - **Outgoing Bubble (Sender)**: Telegram Soft Pistachio / Warm Mint (`#EFFDDE`).
    - **CRITICAL LESSON**: Never use cold pastel blue (`#E3EDF7`) on a warm sand/beige canvas. Cold blue and warm sand clash. `#EFFDDE` is the global standard of Telegram and WhatsApp on warm wallpapers—it creates a soft, natural, eye-friendly harmony.
  - **Incoming Bubble (Counterpart / Admin)**: Pure Crisp White (`#FFFFFF`) with dark charcoal text (`text-slate-900`).
  - **Read Checkmarks**: Telegram Green (`#4FAE4E`) for read status, subtle muted gray (`#94A3B8`) for sent/unread.
  - **Time & Ephemeral Info**: Subtle emerald tint (`text-emerald-900/60`) on outgoing, calm muted gray (`text-slate-400`) on incoming.
  - **Flame Tag (TTL Countdown)**: Must be subtle, calm, and neutral (`bg-black/[0.04]` with `text-emerald-700/60` or `text-slate-400`). **Rule**: Never use bright, glaring amber/orange flames inside the bubble that distract the eye.

### 1.2. Dark Mode (Warm Obsidian Ambient Canvas & Frosted Glassmorphism)
- **Ambient Canvas Background**:
  - Class: `.dark .bg-ambient-canvas`
  - Base Color: `#0E1218` (Warm obsidian charcoal).
  - Ambient radial gradients: Mirroring light mode's atmospheric lighting geometry with subtle dark golden amber (`rgba(217, 119, 6, 0.12)` at top-right & `0.08` at bottom-left) and deep muted royal slate (`rgba(37, 99, 235, 0.12)` at top-left & `rgba(30, 58, 138, 0.14)` at bottom-right).
  - **Rule**: NEVER use flat solid black (`#000000`), stark 90s blue gradients (`linear-gradient(#020617, #0B1120)`), or opaque flat slate solids.
- **Glassmorphic Frosted Surfaces**:
  - Headers: `dark:bg-[#12161E]/70 dark:backdrop-blur-xl dark:border-white/[0.08]`
  - Floating 24h Banner Pill: `dark:bg-white/[0.08] dark:backdrop-blur-md dark:border-white/10 dark:text-amber-300/90`
  - Circular Action Buttons: `dark:bg-white/[0.08] dark:hover:bg-white/[0.12] dark:backdrop-blur-md dark:border-white/[0.09] dark:text-slate-200`
  - Floating Input Pill: `dark:bg-[#151922]/95 dark:backdrop-blur-xl dark:border-white/[0.08]`
  - Drawer & Modals: `dark:bg-[#0E121A]/95 dark:backdrop-blur-2xl dark:border-white/[0.08]` with translucent inner cards `dark:bg-white/[0.04]`
- **Message Bubbles**:
  - **Outgoing Bubble**: Telegram Muted Navy (`#20364C` / `#2B5278`) with crisp white/slate text (`text-slate-100`).
  - **Incoming Bubble**: Dark Slate Navy (`#161D27` / `#182533`).
  - **Read Checkmarks**: Soft Cyan/Blue (`#64B5F6`).
  - **Flame Tag**: Dark translucent badge (`bg-black/25 text-slate-300`).

---

## 2. Message Bubbles & Corner Tail Standard

- **No Avatars Beside Messages in Chat Stream**:
  - **CRITICAL USER RULE**: Do NOT render user avatar circles next to every message bubble in the chat view. The counterpart's avatar is already permanently visible in the sticky top header.
- **Telegram Curved Bubble Tails**:
  - Message bubbles feature authentic Telegram curved corner tails rendered via seamless SVG paths.
  - **Outgoing Tail (Bottom-Right)**:
    - Bubble corner: `rounded-[18px] rounded-br-[2px]`
    - SVG Tail: position `absolute -bottom-[1px] -right-[9px]`, scaleX(-1), filled with `#EFFDDE` (light) or `#2B5278` (dark).
    - SVG Path: `M-6 16h6v17c-.193-2.84-.876-5.767-2.05-8.782-.904-2.325-2.446-4.485-4.625-6.48A1 1 0 01-6 16z`
  - **Incoming Tail (Bottom-Left)**:
    - Bubble corner: `rounded-[18px] rounded-bl-[2px]`
    - SVG Tail: position `absolute -bottom-[1px] -left-[9px]`, filled with `#FFFFFF` (light) or `#182533` (dark).

---

## 3. Chat Input Bar (Floating Pill Standard)

- **Desktop Breathing Room Standard**:
  - **CRITICAL USER RULE**: On desktop, the floating pill input must NEVER stick to the bottom edge of the screen or chat container.
  - Footer padding standard: `p-4 sm:px-6 sm:pt-3 sm:pb-8 md:pb-9 pb-safe shrink-0` (giving 32px to 36px of bottom floating space on desktop screens).
  - `.pb-safe` is constrained with `@media (max-width: 639px)` so it never overrides or conflicts with desktop bottom padding.
- **Static Border & ZERO Hover/Focus Border Jumps**:
  - **CRITICAL USER RULE**: When clicking, tapping, or typing in the input pill bar, its border MUST NOT jump, flash, darken, or expand (`hover:border-...` and `focus-within:border-...` are STRICTLY FORBIDDEN).
  - The border must remain completely static: `border border-black/[0.06] dark:border-white/10`.
  - CSS standard:
    ```css
    [data-input-pill], [data-input-pill]:hover, [data-input-pill]:focus-within {
      outline: none !important;
      box-shadow: none !important;
    }
    ```
- **Send Button**:
  - Direct paper airplane icon pointing right (`M2.01 21L23 12 2.01 3 2 10l15 2-15 2z`).
  - **No Circular Background**: Completely transparent background (`bg-transparent border-none`).
  - Color: `#2AABEE` (Telegram active blue), disabled: `#CBD5E1`.
- **Paperclip (Attachment) Button**:
  - Located on the start side of the pill.
  - Triggers photo/image selection from device gallery or camera.
  - Supports desktop clipboard paste (`Ctrl+V`) directly into the input.
- **Image Preview Bar**:
  - Appears smoothly above the pill input when an image is selected.
  - Shows 48x48 rounded thumbnail, filename, size in KB, and `(X)` discard button.
  - Input placeholder automatically changes to "نوشتن متن برای عکس (اختیاری)..." / "Add a caption (optional)...".

---

## 4. Admin Sidebar & User Item Cards

- **Top Header Action Buttons**:
  - The 4 circular action buttons in the admin header (Settings, LanguageToggle, ThemeToggle, Logout) must be compact:
  - Standard size: `w-8 h-8` (32px), `gap-1.5`, with `w-3.5 h-3.5` icons and `text-[11px]` font (`size="sm"`).
  - Never use oversized `w-10 h-10` buttons that crowd the header title.
- **Card Geometry & Radii**:
  - Standard: `rounded-xl` (12px), NOT exaggerated capsules (`rounded-[22px]`).
  - Padding: `px-3 py-2.5` (compact and balanced).
- **Elevation & Shadows**:
  - Normal state: flat hairline border `border border-black/[0.04] dark:border-white/[0.04]` with ultra-subtle ambient shadow `shadow-[0_1px_2px_rgba(0,0,0,0.02)]`.
  - **Rule**: Never use heavy, muddy drop shadows (`shadow-soft` / `shadow-floating`) under list items.
  - Selected state: `bg-white dark:bg-slate-800 border-black/10 dark:border-white/15 shadow-sm`.
- **Segmented Filter Control**:
  - iOS/Telegram-style 4-segment pill (`All`, `Pending`, `Active`, `Banned`) with live counter badges.
  - Quick clear `(X)` button inside the search field.

---

## 5. Mobile & PWA Optimization

- **Notch & Home Bar Protection**:
  - Header: `.pt-safe` (`padding-top: max(0.875rem, env(safe-area-inset-top, 0.875rem))`).
  - Footer input: `.pb-safe` (`padding-bottom: max(1rem, env(safe-area-inset-bottom, 1rem))`).
- **PWA Capabilities**:
  - Full standalone web app capability for iOS Safari and Android Chrome.
  - Dynamic PWA manifest generated via `/manifest.json`.
  - Service worker caching static assets with immediate activation.

---

## 6. Micro-Elevation & Crisp Shadow Standards (Eliminating Blurry Halos)

- **Root Cause of "Blurry Fog"**:
  - Wide Gaussian blur radii (15px to 50px) at low opacities act like a fuzzy smudge/halo radiating out in all directions around cards, buttons, and inputs, making them appear out-of-focus ("دورش رو انگار تار کرده").
- **Strict Shadow Hierarchy**:
  - **Buttons, Badges, Tabs & Avatars**: Always use `shadow-xs` (`0 1px 2px 0 rgba(0,0,0,0.04)`) or `shadow-none`. Never apply multi-pixel blur clouds on compact controls.
  - **Message Bubbles**: Use crisp hairline depth `shadow-[0_1px_2px_rgba(0,0,0,0.05)] dark:shadow-none border border-black/[0.04] dark:border-white/[0.05]`.
  - **Inputs & Search Bars**: `shadow-none` with hairline border `border border-black/[0.05] dark:border-white/5`.
  - **Modals & Drawers**: Tight layered elevations (`shadow-floating` or `shadow-xl`) constrained to small blur radii (`0 4px 16px -2px rgba(0,0,0,0.08)`), anchored by clean 1px borders.

---

## 7. Floating Banners & Drawer Direction Harmony

- **Ephemeral 24h Auto-Purge Banner**:
  - Must NEVER be bare unstyled text touching the top header border.
  - Standard container: Centered floating pill card with generous top spacing (`px-4 pt-4 sm:pt-5 pb-2 flex justify-center`), detached from the ceiling/header.
  - Card style: `inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/70 dark:bg-slate-800/80 backdrop-blur-md border border-black/[0.06] dark:border-white/10 shadow-xs text-[11px] font-medium text-amber-700 dark:text-amber-400`.
- **Drawer Direction & Trigger Alignment**:
  - **CRITICAL UX RULE**: The side navigation drawer MUST open from the exact same side of the screen as the button that opened it.
  - In RTL (Persian): The menu button is on the top-left; the drawer must open on the **LEFT** with slide-in animation `animate-drawer-left` (`translateX(-100%)` to `0`).
  - In LTR (English): The menu button is on the top-right; the drawer must open on the **RIGHT** with slide-in animation `animate-drawer-right` (`translateX(100%)` to `0`).
  - Never allow cross-screen dissonance where a left-side button triggers a right-side drawer.

---

## 8. Smart Dynamic Context Menu Positioning (Anti-Clipping Rule)

- **Root Cause of Menu Hiding**:
  - In scrollable chat streams, static upward menus (`bottom-full mb-2`) on messages near the top of the viewport shoot up into the clipped overflow area or go underneath the sticky header.
- **Dynamic Orientation Standard**:
  - Compute `rect.top` via `bubbleRef.current.getBoundingClientRect()`.
  - **Top Messages (`rect.top < 135px`)**: Menu dynamically opens **DOWNWARDS** (`top-full mt-2`), and feedback badge opens below (`-bottom-7`).
  - **Lower Messages (`rect.top >= 135px`)**: Menu opens **UPWARDS** (`bottom-full mb-2`), and badge opens above (`-top-7`).
  - **Stacking Context**: When `showMenu` is active, the entire message item is elevated to `relative z-40` with menu at `z-50`, preventing subsequent message elements in the DOM from painting over the open menu.

