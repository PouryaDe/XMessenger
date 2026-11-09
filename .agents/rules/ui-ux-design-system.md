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
  - **Outgoing Bubble (Sender)**: Soft Warm Stone Linen (`#EDE8E0`) in Light Mode / Deep Slate Obsidian (`#232936`) in Dark Mode.
    - **CRITICAL LESSON**: Never use green, brown, or saturated royal blue bubbles. Clean slate obsidian (`#232936`) in dark mode and soft stone linen (`#EDE8E0`) in light mode blend naturally with the canvas and eliminate all color muddiness.
    - Corners: Modern rounded bubble `rounded-[20px] rounded-br-[6px]`. No external SVG triangle tails (which create border cut-off glitches).
  - **Incoming Bubble (Counterpart / Admin)**: Pure Crisp White (`#FFFFFF`) in light mode / Charcoal Obsidian (`#161B24`) in dark mode with `rounded-[20px] rounded-bl-[6px]`.
  - **Read Checkmarks**: Emerald Green (`text-emerald-500 dark:text-emerald-400`) for read status, subtle muted gray (`text-slate-400`) for sent/unread.
  - **Time & Ephemeral Info**: Subtle slate tint (`text-slate-500 dark:text-slate-300`) on outgoing, calm muted gray (`text-slate-400`) on incoming.
  - **Flame Tag (TTL Countdown)**: Clean neutral pill (`bg-black/[0.04] dark:bg-white/[0.08]`) with golden flame (`text-amber-500 dark:text-amber-400`).

### 1.2. Dark Mode (Warm Obsidian Ambient Canvas & Frosted Glassmorphism)
- **Ambient Canvas Background**:
  - Class: `.dark .bg-ambient-canvas`
  - Base Color: `#0E1218` (Warm obsidian charcoal).
  - Ambient radial gradients: Mirroring light mode's atmospheric lighting geometry with subtle dark golden amber (`rgba(217, 119, 6, 0.12)` at top-right & `0.08` at bottom-left) and deep muted royal slate (`rgba(37, 99, 235, 0.12)` at top-left & `rgba(30, 58, 138, 0.14)` at bottom-right).
  - **Rule**: NEVER use flat solid black (`#000000`), stark 90s blue gradients (`linear-gradient(#020617, #0B1120)`), or opaque flat slate solids.
- **Glassmorphic Frosted Surfaces**:
  - Headers: `bg-transparent border-b border-black/[0.05] dark:border-white/[0.06]` (seamlessly continues full-bleed ambient canvas gradients without opaque slabs)
  - Footers: `bg-transparent border-t border-black/[0.05] dark:border-white/[0.06]` containing floating frosted input pill
  - Floating 24h Banner Pill: `dark:bg-white/[0.08] dark:backdrop-blur-md dark:border-white/10 dark:text-amber-300/90`
  - Circular Action Buttons: `dark:bg-white/[0.08] dark:hover:bg-white/[0.12] dark:backdrop-blur-md dark:border-white/[0.09] dark:text-slate-200`
  - Floating Input Pill: `dark:bg-[#151922]/95 dark:backdrop-blur-xl dark:border-white/[0.08]`
  - Drawer & Modals: `dark:bg-[#0E121A]/95 dark:backdrop-blur-2xl dark:border-white/[0.08]` with translucent inner cards `dark:bg-white/[0.04]`
- **Message Bubbles**:
  - **Outgoing Bubble**: Deep Slate Obsidian (`#232936`) with delicate hairline border `dark:border-white/[0.08]` and crisp white text (`text-white`).
  - **Incoming Bubble**: Charcoal Obsidian (`#161B24`) with hairline border `dark:border-white/[0.06]`.
  - **Read Checkmarks**: Emerald (`text-emerald-400`).
  - **Flame Tag**: Translucent badge (`bg-white/[0.08] text-slate-200`).

---

## 2. Message Bubbles, Telegram Tails & Grouping Standards

- **No Avatars Beside Messages in Chat Stream**:
  - **CRITICAL USER RULE**: Do NOT render redundant user avatar circles next to every message bubble in the chat view. The counterpart's avatar is already permanently visible in the sticky top header.
- **Telegram Consecutive Grouping Spacing**:
  - Consecutive messages from the same sender on the same calendar day form a continuous streak (`mt-1 mb-1`).
  - When the sender changes or a new group begins, insert standard vertical separation: `mt-3.5 sm:mt-4 mb-1` (via `isFirstInGroup`). This completely prevents messages from different senders from sticking together.
- **Telegram Bubble Max-Width Standard**:
  - Bubble max width is strictly capped at `max-w-[76%] sm:max-w-[70%] md:max-w-[65%]` (matching Telegram mobile & desktop layout proportions).
- **Telegram Corner Radii & Integrated SVG Corner Tails**:
  - Intermediate messages in a consecutive streak are uniformly rounded (`rounded-[18px]`).
  - The last message of an outgoing streak (`isLastInGroup && isOwn`) uses `rounded-[18px] rounded-br-[4px]` and displays the authentic Telegram bottom-right SVG curved tail (`fill-[#EDE8E0] dark:fill-[#232936]`, positioned at `-bottom-[0.5px] -right-[7px]`).
  - The last message of an incoming streak (`isLastInGroup && !isOwn`) uses `rounded-[18px] rounded-bl-[4px]` and displays the authentic Telegram bottom-left SVG curved tail (`fill-white dark:fill-[#161B24]`, positioned at `-bottom-[0.5px] -left-[7px] -scale-x-100`).
- **Telegram Reactions Standard (Inside Message Bubble)**:
  - **Inside Message Bubble**: Reactions reside strictly **inside** the message bubble card in the bottom footer row alongside time/read receipts. Negative bottom offset badges (`-bottom-2.5` / `-bottom-3`) that hang outside the bubble or collide with SVG tails are strictly forbidden.
  - **Dual Reaction Support (👍 and ❤️)**: Messages support both `👍` and `❤️` reactions. Tapping an existing reaction pill inside the bubble toggles that reaction.
  - **Context Menu Quick Reactions Bar**: A dedicated top bar in the message floating menu provides instant one-tap selection for both `👍` and `❤️`, displaying active highlight and removal states.
  - **Pill Geometry & Spacing**: Perfectly rounded pill (`rounded-full`) with comfortable, balanced horizontal padding (`px-2.5 py-1 sm:px-3 sm:py-1`), displaying emoji and reaction count without crammed avatar letters.
  - **Color Harmony (No Blurry Neon Blobs)**:
    - Active 👍: Subtle sky tint (`bg-[#2AABEE]/15 dark:bg-[#2AABEE]/20 border-[#2AABEE]/35 dark:border-[#2AABEE]/40 text-[#0c82bf] dark:text-[#2AABEE] shadow-xs`).
    - Active ❤️: Subtle rose tint (`bg-rose-500/15 dark:bg-rose-500/20 border-rose-500/35 dark:border-rose-500/40 text-rose-600 dark:text-rose-400 shadow-xs`).
    - Inactive: Clean neutral pill (`bg-black/[0.04] dark:bg-white/[0.08] text-slate-700 dark:text-slate-300 border-black/[0.06] dark:border-white/[0.08]`).
  - **Burst Animation**: Double-clicking, double-tapping, or selecting a reaction triggers a GPU-accelerated reaction burst (`animate-like-burst`) matching the selected emoji (`👍` or `❤️`). Touch events are debounced (450ms) to prevent synthetic double triggers.

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

## 7. Stream Badges, Ephemeral TTL Notice & Drawer Direction Harmony

- **Ephemeral 24h Auto-Purge Banner**:
  - Must NEVER be pinned or fixed to the top ceiling/header where it permanently occupies screen real estate.
  - Position strictly at the **start of the scrollable message stream**, centered horizontally exactly like date separators (`DateSeparator`).
  - Scrolls naturally with conversation messages instead of staying stuck at the top.
  - Pill style: `inline-flex items-center justify-center gap-1.5 px-3.5 py-1 rounded-full text-[11px] sm:text-xs font-medium tracking-tight bg-slate-900/40 dark:bg-black/50 text-amber-300/95 dark:text-amber-300/95 backdrop-blur-md border border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.12)]`.
- **Top Header Client Navigation Menu**:
  - Use the standard 3-line hamburger menu icon (`Menu` from `lucide-react`) for opening the side drawer, replacing 4-square grid icons.
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

---

## 9. Mobile PWA Safe Areas, Floating Scroll Control & Indicator Standards

- **Safe Area Inset Utility Classes**:
  - Never use raw arbitrary Tailwind values like `pt-[max(...)]` or `pb-[max(...)]` with nested commas, as Tailwind CSS drops them during bundling.
  - Always use dedicated CSS utilities defined in `client/src/index.css`:
    - `.pt-safe`: `padding-top: max(0.875rem, calc(env(safe-area-inset-top, 0px) + 0.65rem))` — guarantees clean clearance below iOS Dynamic Island and notch across iPhone models.
    - `.pb-safe`: `padding-bottom: max(0.65rem, calc(env(safe-area-inset-bottom, 0px) + 0.5rem))` — extends the docked input footer cleanly into the iOS home indicator safe area without black gaps.
    - `.top-safe`: `top: max(1.25rem, calc(env(safe-area-inset-top, 0px) + 0.85rem))` — keeps top floating actions (e.g., auth language/theme pills) below the status bar.
    - `.pt-safe-drawer` / `.pb-safe-drawer`: Dedicated safe area padding for sliding drawers.
- **Floating Scroll-to-Bottom FAB**:
  - Position strictly at `bottom-3.5 right-4 sm:right-6 z-20` inside the scroll container wrapper.
  - In RTL (Persian) mode, placing it at the right side aligns with thumb ergonomics and avoids colliding with the left-aligned Send button or incoming message bubbles.
- **Circular Loading & Status Badges**:
  - Loading indicators, spinner containers, and icon badges must always use `rounded-full` (circles), never rounded squircles or squares (`rounded-2xl` / `rounded-3xl`).
- **No Artificial Separator Gradients / Masks**:
  - Avoid artificial top/bottom dark gradient overlays (`bg-gradient-to-b from-[#...]/90`) or CSS fade masks (`chat-fade-mask`), which create muddy horizontal shadow bands. Rely on clean frosted glassmorphism borders (`border-b border-black/[0.05] dark:border-white/[0.08]`).

---

## 10. Segmented Tab Filters & Notification Badges Standard

- **No Parentheses Counts**:
  - Never display counts inside parentheses (e.g., `همه (2)`) in tab or segmented control text labels.
- **Top-Corner Floating Badges**:
  - Badges must be styled as small circular/pill indicators floating at the top-left of the text label in RTL (top-right in LTR): `absolute -top-1.5 rtl:-left-2.5 ltr:-right-2.5 min-w-[15px] h-[15px] px-1 rounded-full text-[8.5px] font-bold flex items-center justify-center leading-none shadow-xs ring-1.5 ring-white/70 dark:ring-[#0E1218]`.
- **Targeted Notification Scopes**:
  - **All Chats Tab (`all`)**: Display only the count of unread chats (`unreadChatsCount`), and only when `> 0`. Styled with Telegram emerald indicator `bg-emerald-500 text-white`.
  - **Pending Approval Tab (`pending`)**: Display only pending approval users count (`pendingCount`), and only when `> 0`. Styled with amber indicator `bg-amber-500 text-white`.
  - **Active (`active`) & Banned (`banned`) Tabs**: Never display numerical count badges.

---

## 11. Chat List Layout, Unread Badges & Avatar Identity Standard

- **Deterministic Avatar Color Harmony**:
  - **CRITICAL UX RULE**: Initials avatars must NEVER use pale gray `bg-stone-100` with invisible white borders, which blend into light mode linen cards (`bg-white/50` on `#DFDDD6`).
  - Always use `getAvatarPalette(username)` to deterministically assign vibrant, high-contrast, distinct pastel colors with defined borders in light mode (`bg-*-100 text-*-800 border-*-300/80`) and frosted neon tints in dark mode (`dark:bg-*-500/20 dark:text-*-300 dark:border-*-500/30`).
- **Chat Row Alignment & Visual Hierarchy**:
  - **Top Row (Start to End)**: Contact username and status pills on start side; **Message Timestamp** (`text-[10px] text-slate-400 font-sans leading-tight`) strictly on the end side. This guarantees timestamps are positioned at the exact same horizontal baseline across all chats.
  - **Bottom Row (Start to End)**: Last message snippet on start side; **Vibrant Unread Badge** strictly on the end side.
- **Telegram Unread Message Badge**:
  - Never use harsh solid black blobs (`bg-slate-900 text-white`) in light mode.
  - Always use Telegram standard vibrant emerald green: `bg-emerald-500 text-white min-w-[19px] h-[19px] px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center leading-none shadow-xs`.



