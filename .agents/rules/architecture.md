# Architecture & Technical Contract

This document outlines the architectural layers, data contracts, and component responsibilities for **XMessenger**.

---

## 1. Hub-and-Spoke Topology

1. **Role Model**:
   - `ADMIN`: Single superuser responsible for answering chats, approving pending registrations, managing system settings, and performing backups.
   - `USER`: Isolated regular user. Each user is strictly bound to a single thread with the ADMIN.
2. **Registration Lifecycle**:
   - `OPEN`: Instant access upon signup.
   - `MANUAL_APPROVAL`: Account created in `pending` state. Socket messages are blocked until an admin approves the account.
   - `DISABLED`: Direct rejection of new user registrations.

---

## 2. Storage & Persistence Layer

- **Database**: SQLite (via `better-sqlite3`), running in WAL mode with busy timeouts.
  - Path: `/app/data/xmessenger.db` (mapped to persistent Docker volume `xmessenger-data-<domain-slug>`).
  - Tables:
    - `users`: ID, username, password hash, role, status, avatar URL, timestamps.
    - `messages`: ID, sender ID, recipient ID, ciphertext (AES-256), IV, auth tag, creation timestamp, expiration timestamp, read status.
    - `settings`: Key-value store for registration control, approval mode, TTL defaults, app name, PWA configuration.
- **Uploads & Static Media**:
  - Mounted volume directory: `/app/data/uploads`
  - Subdirectories:
    - `/app/data/uploads/chat`: Image attachments sent in messages.
    - `/app/data/uploads/icons`: Custom PWA app icons uploaded by admin.
    - `/app/data/uploads/avatars`: Custom user and admin profile avatars.
    - `/app/data/uploads/temp`: Temporary files during database restores.

---

## 3. Web & Static Asset Serving (Production Docker Pipeline)

- **Express Serving Pipeline**:
  - In production, Express serves compiled frontend assets directly from `/app/client-dist`.
  - **Cache-Control Contract**:
    - `index.html`: Must **NEVER** be cached (`Cache-Control: no-cache, no-store, must-revalidate`).
    - Hashed assets (`assets/index-*.js`, `assets/index-*.css`): Cached with `max-age=1y, immutable`.
    - `/uploads/*`: Cached with `max-age=7d`.
    - `/manifest.json`: Dynamic manifest with `no-cache, no-store`.

---

## 4. Real-time Communication (Socket.IO)

- Real-time events:
  - `message:new`: Broadcast new message to recipient and admin room.
  - `message:sent`: Echo message back to sender for optimistic confirmation.
  - `message:deleted`: Purge message from memory and UI on both client instances.
  - `conversation:cleared`: Reset conversation stream for a user-admin thread.
  - `typing`: Live typing status broadcast with debounce.
  - `presence:init` & `user:online_status`: Real-time online/offline presence tracking.
