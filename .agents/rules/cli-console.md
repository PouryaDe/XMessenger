# Terminal, CLI Console & Deployment Standard

This standard defines the mandatory rules for all server-side shell scripts (`deploy/install.sh`, `deploy/xmessenger.sh`, `update.sh`), CLI interfaces, and container deployment pipelines.

---

## 1. Strictly English Console Output (Zero Persian)

- **CRITICAL RULE**:
  - All console scripts (`.sh`), interactive terminal menus, CLI options, prompts, and server logs MUST be written **100% in English**.
  - **NEVER use Persian / RTL Unicode characters in terminal scripts**.
  - **Reason**: SSH clients, remote terminals (PuTTY, Windows Terminal, headless Linux consoles), and Docker log collectors frequently lack proper bidirectional (bidi) shaping or Persian fonts. Printing Persian in terminals leads to reversed text, disconnected glyphs, or unreadable question marks (`???`).

---

## 2. Global Shortcuts Architecture: Live Symlinks (Never Static File Copies)

- **CRITICAL LESSON FROM REAL DEPLOYMENTS**:
  - In initial versions, `deploy/install.sh` copied `deploy/xmessenger.sh` to `/usr/local/bin/xmessenger` via `cp -f`.
  - This created a **static, frozen file** on the user's host operating system.
  - When the user subsequently pulled git updates or pressed `U`, the file `/usr/local/bin/xmessenger` remained outdated and never updated itself, forcing manual command runs.
- **MANDATORY RULE**:
  - Always link global CLI executables as **symbolic links (Symlinks)** pointing directly into `/opt/xmessenger`:
    ```bash
    ln -sf /opt/xmessenger/deploy/xmessenger.sh /usr/local/bin/xmessenger
    ln -sf /opt/xmessenger/update.sh /usr/local/bin/xupdate
    chmod +x /opt/xmessenger/deploy/xmessenger.sh /opt/xmessenger/update.sh
    ```
  - Both `deploy/xmessenger.sh` and `update.sh` must feature self-healing logic at the top of execution that re-establishes these symlinks if a static file is detected.

---

## 3. Fast Update Pipeline (`xupdate` & Option `U`)

- The update command must NEVER require the server administrator to manually copy files or restart Docker services.
- Selecting option `[uU]` in `xmessenger` or running `xupdate` in the terminal MUST execute the exact hot-deployment sequence automatically:
  1. `git fetch origin main && git reset --hard origin/main` (resolves any local conflict cleanly).
  2. Ensure live symlinks for `/usr/local/bin/xmessenger` and `/usr/local/bin/xupdate`.
  3. Direct asset injection into all running XMessenger containers:
     ```bash
     docker cp client/dist/. ${CONTAINER}:/app/client-dist/
     docker cp server/dist/. ${CONTAINER}:/app/dist/
     docker restart ${CONTAINER}
     ```
  4. Flush Nginx proxy cache & buffers:
     ```bash
     docker restart xmessenger-nginx
     ```
  5. Background build of base image `xmessenger-core:latest` without interrupting live containers.
