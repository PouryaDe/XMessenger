# Terminal & CLI Console Language Standard

## Critical Rule
- **STRICTLY ENGLISH ONLY**: All terminal scripts, bash/shell scripts (e.g. `deploy/install.sh`, `deploy/xmessenger.sh`), CLI interfaces, interactive menus, prompts, and server console outputs MUST be written **100% in English**.
- **NEVER USE PERSIAN/RTL CHARACTERS IN CONSOLE SCRIPTS**: SSH clients, terminal emulators (like PuTTY, Windows Terminal, Linux console), and headless servers frequently lack proper bidirectional (bidi) rendering or Persian/Arabic fonts, causing text to appear reversed, broken, disconnected, or as unreadable symbols.
- **Scope Distinction**:
  - **Console / CLI / Server Scripts (`.sh`, terminal menus, docker logs)**: English only.
  - **Web Client UI (`client/`)**: Full bilingual support (Persian RTL with Vazirmatn font + English LTR).
