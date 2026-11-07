# UI/UX Design System Specification (Warm Minimalist & Floating Cards)

This design system contract defines the visual identity, typography, spacing, component primitives, and interaction patterns for **XMessenger**, directly derived from the mobile-first luxury concept design.

---

## 1. Visual Theme & Color Palette

### Light Mode (Dual Ambient Yellow & Sky Blue Glow)
- **Background**: Multi-point ambient radial gradient combining warm golden amber sunshine on the top-left with fresh pastel sky blue / periwinkle on the right:
  - Class: `.bg-ambient-canvas`
  - Colors: Warm golden sunshine (`rgba(254, 218, 138, 0.78)` at top-left 10%), ethereal pastel sky blue (`rgba(186, 222, 255, 0.85)` at top-right 90%), soft periwinkle (`rgba(199, 228, 255, 0.80)` at bottom-right 85%), warm sand base (`#F8F5EE`).
  - Never use plain yellow or uniform monochromatic cream backgrounds.
- **Inputs & Search Bars (CRITICAL RULE - ZERO SHADOW)**:
  - In light theme, **NEVER use shadows on inputs, textareas, search bars, or floating pill input containers**.
  - Must use `shadow-none` (flat pure white `bg-white` with delicate hairline border `border border-black/[0.05]`).
  - Shadows are strictly reserved for Dark Mode (`dark:shadow-soft`, `dark:shadow-floating`) or distinct primary action buttons.
- **Card Surfaces**: Pure crisp white (`#FFFFFF`) with ultra-smooth rounded corners and subtle diffuse shadow (`shadow-[0_4px_20px_rgba(0,0,0,0.04)]`).
- **Surface Borders**: Ultra-delicate border `border border-white/70` or `border-stone-200/50`.
- **Primary Accent / Dark Accent**: Deep obsidian black / charcoal (`#111827`, `#0F172A`) for high-contrast primary circular buttons and bold typography.
- **Secondary Accent**: Emerald/Mint (`#10B981`) for online presence and security badges, Warm Amber (`#F59E0B`) for ephemeral TTL flame timers and pending alerts.
- **Text Hierarchy**:
  - Headings: `#0F172A` (Charcoal Black, font-extrabold / font-bold)
  - Body: `#334155` (Slate Gray)
  - Muted / Placeholders: `#94A3B8` (Soft Gray)

### Dark Mode (Deep Obsidian & Golden Amber Tint)
- **Background**: Deep obsidian with subtle warm undertones:
  - Gradient: `from-[#0B0F17] via-[#111827] to-[#0A0D14]`
- **Card Surfaces**: Dark slate cards (`#1E293B` / `#162032`) with `border border-slate-700/60` and `shadow-[0_4px_24px_rgba(0,0,0,0.4)]`.
- **Primary Accent**: Pure white or bright emerald for active controls, with crisp high-contrast icon buttons.

---

## 2. Geometry & Corner Radii

- **Cards & Containers**: Ultra-rounded `rounded-3xl` (`24px` to `28px`).
- **Inputs & Search Bars**: Pill-shaped `rounded-full` (`9999px`).
- **Action Buttons & Badges**: Fully circular `rounded-full` (`w-10 h-10` or `w-11 h-11` or `w-12 h-12`).
- **Message Bubbles**: Smooth high-radius bubbles `rounded-2xl` (`18px`) with tailored corner for sender/counterpart.

---

## 3. Core Component Primitives

### 3.1. Circular Action Buttons (Header & Navigation)
- Circular buttons on light/dark backgrounds:
  ```tsx
  <button className="w-10 h-10 rounded-full bg-white/90 dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-sm border border-black/5 dark:border-white/10 flex items-center justify-center hover:scale-105 active:scale-95 transition-all">
    <Icon className="w-5 h-5" />
  </button>
  ```

### 3.2. Top Header (Mobile & Desktop)
- Small user avatar on one side, title in center/side, circular actions (notification bell, grid menu, language/theme) on the other.
- Floating glassmorphism or clean transparent backdrop blur.

### 3.3. Quick Action Cards (2-Column Grid)
- Large square or rectangular white cards with high radius:
  ```tsx
  <div className="bg-white dark:bg-slate-900 rounded-[26px] p-5 shadow-sm border border-black/5 dark:border-white/5 flex flex-col justify-between">
    <div className="w-11 h-11 rounded-2xl bg-amber-50 dark:bg-slate-800 text-slate-800 dark:text-white flex items-center justify-center mb-4">
      <Icon className="w-5 h-5" />
    </div>
    <div className="flex items-end justify-between">
      <h3 className="font-bold text-sm text-slate-800 dark:text-white">Title</h3>
      <span className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
        <ArrowRight className="w-4 h-4 rtl:rotate-180" />
      </span>
    </div>
  </div>
  ```

### 3.4. Recent Activities / Chat Items
- Horizontal card with rounded icon on left, title & subtitle in middle, chevron arrow on right:
  ```tsx
  <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm border border-black/5 dark:border-white/5 flex items-center justify-between">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <h4 className="font-semibold text-xs text-slate-900 dark:text-white">Item Name</h4>
        <p className="text-[11px] text-slate-400">Subtitle description</p>
      </div>
    </div>
    <ChevronRight className="w-4 h-4 text-slate-400 rtl:rotate-180" />
  </div>
  ```

### 3.5. Chat Messages (Bubble & Avatar)
- Sender Message:
  - Clean elevated bubble with smooth shadow, sender avatar on outer side.
  - Flame TTL badge with remaining time countdown.
  - Action row on hover/touch: copy, delete for everyone, TTL info.
- Recipient / Admin Message:
  - Clean white/tinted card bubble with Admin shield avatar on outer side.

### 3.6. Bottom Floating Pill Input Bar
- Floats above the bottom of the screen with margin:
  - Inner white pill input container with attachment icon, input field, and send trigger.
  - Adjacent circular dark floating button (`w-12 h-12 bg-slate-900 text-white rounded-full shadow-lg`) for primary action (Send / Voice / Quick Action).

---

## 4. Typography & RTL Standards
- Font Family: **Vazirmatn** for Persian (`lang="fa"`, `dir="rtl"`) and **Inter / system-ui** for English (`lang="en"`, `dir="ltr"`).
- Icons: Lucide Icons with proper bidirectional mirroring (`rtl:rotate-180` for forward/back arrows).

### 4.1. Select Inputs & Form Controls (Permanent Standard)
- **Arrow Alignment & Padding**: Never let native select arrows touch or clip into rounded pill borders (`rounded-full` or `rounded-3xl`).
- **`appearance-none` Mandatory**: Always reset default browser styling (`appearance: none; -webkit-appearance: none;`).
- **Bidirectional Inset Position**:
  - In Persian/RTL (`[dir="rtl"]`): The dropdown arrow MUST be placed comfortably inside the left curve (`background-position: left 1rem center`), and left padding MUST be at least `2.75rem` (`44px`) so text and arrow never collide.
  - In English/LTR (`[dir="ltr"]`): The dropdown arrow MUST be placed comfortably inside the right curve (`background-position: right 1rem center`), with right padding at least `2.75rem` (`44px`).
- **Auth Inputs (Username / Password)**:
  - Form inputs for usernames, passwords, tokens, or codes MUST ALWAYS be left-aligned (`dir="ltr" text-left`) in both Persian and English.
  - Field icons must have fixed positioning and the input must have generous padding (e.g. `pl-11`) so text never overlaps icons.
- **Zero Colored Focus Rings / Halos**:
  - Never use colored or orange focus rings (`focus:ring-2 focus:ring-amber-400`).
  - Inputs must use clean `focus:outline-none focus:ring-0 focus:border-stone-400 dark:focus:border-slate-500` without any thick colored outline.
- **Zero Shadow in Light Mode (CRITICAL)**:
  - In Light Theme, inputs, textareas, search inputs, and floating input pill containers must NEVER have drop shadows (`shadow-soft`, `shadow-floating`, `shadow-inner`). They must be crisp, flat white (`shadow-none` or `dark:shadow-*` only) with delicate hairline borders.
- **Standardized Mobile Password Bullets**:
  - `input[type="password"]` must always use native system font (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`) with `letter-spacing: 0.18em` to avoid oversized, clunky bullet characters on mobile browsers inheriting Arabic/Persian font glyphs.

### 4.2. Search Inputs & Filter Tab Pills Centering (Permanent Standard)
- **Search Icon Placement**:
  - In LTR and RTL, always use logical positioning (`absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none`).
  - Input padding must use logical properties: `ps-10 pe-4` (or `ps-11 pe-4`) so text never overlaps the icon and has consistent natural margins across both LTR and RTL.
  - Never hardcode `top-*` (like `top-3.5`) for icons inside rounded inputs; ALWAYS use `top-1/2 -translate-y-1/2` for mathematical vertical centering.
- **Filter Tabs & Pill Buttons**:
  - All tab pills must have a shared explicit height: `inline-flex items-center justify-center h-7 px-3.5 rounded-full text-xs font-semibold leading-none`.
  - Badges inside pills must also use `inline-flex items-center justify-center h-4 px-1.5 rounded-full leading-none` so badges and tab labels align along the identical optical center.
- **Language-Responsive Typography**:
  - Switch root font variable automatically: `Inter` for `[dir="ltr"]` (English) and `Vazirmatn` for `[dir="rtl"]` (Persian) to prevent Latin ascender/descender metric distortions.
