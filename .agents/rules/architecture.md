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
    - `push_subscriptions`: ID, user ID (foreign key on delete cascade), endpoint, p256dh, auth, user agent, creation timestamp.
    - `settings`: Key-value store for registration control, approval mode, TTL defaults, app name, PWA configuration, VAPID keys.
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

---

## 5. Web Push Notification Architecture

- Built on the official W3C Push API and RFC 8291 / RFC 8292 (VAPID).
- VAPID keys are generated automatically if absent and stored securely in SQLite `settings`.
- Endpoints:
  - `GET /api/push/vapid-public-key`: Exposes public application server key.
  - `POST /api/push/subscribe`: Registers user push endpoint in `push_subscriptions`.
  - `POST /api/push/unsubscribe`: Removes push subscription with owner isolation.
  - `POST /api/push/test`: Dispatches a verification test notification.
- Service Worker (`sw.js`):
  - Listens to `push` event, suppresses noise if client window is focused (`silentIfFocused`), and presents native OS notifications.
  - Listens to `notificationclick`, focuses open window or opens app root URL `/`.
