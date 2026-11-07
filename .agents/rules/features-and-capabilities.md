# XMessenger Features, Capabilities & Project Scope

This document provides a comprehensive inventory of all built-in features, architectural capabilities, and user requirements implemented in **XMessenger**.

---

## 1. Project Goal & Core Philosophy

- **Goal**: A high-security, hub-and-spoke web-based private messenger tailored for seamless mobile (PWA) and desktop operation.
- **Core Principle**: Absolute user privacy, zero long-term retention of communications, transparent administration, and military-grade encryption at rest.

---

## 2. Communication Model: Hub-and-Spoke (One-Way Routing)

1. **User Isolation**:
   - Regular users cannot see, discover, search, or message other regular users.
   - Each user interacts exclusively with the central administrator (`role: 'admin'`).
2. **Admin Operations**:
   - The Admin can view the list of all registered users in the sidebar.
   - The Admin can filter users by status (`All`, `Pending`, `Active`, `Banned`).
   - The Admin can approve new pending users, ban/unban users, delete users, and wipe conversations.
3. **Live Socket Presence**:
   - Real-time online/offline presence tracking (`presence:init`, `user:online_status`, `admin:online_status`).
   - Real-time bidirectional typing indicators (`typing`).
   - Instant message delivery (`message:new`, `message:sent`).

---

## 3. Disappearing Messages (TTL) & Zero Residual Footprint

1. **Configurable TTL Engine**:
   - Admin can set the global default TTL (e.g. 15 minutes, 1 hour, 6 hours, 24 hours, 2 days, 7 days).
   - Every message receives an exact `expires_at` timestamp.
   - A background engine automatically hard-purges expired messages from SQLite on a periodic schedule.
2. **Ephemeral Countdown Badge**:
   - Each message bubble displays a subtle remaining TTL countdown tag with a subtle flame icon.
3. **Two-Way Instant Deletion ("Delete for Everyone")**:
   - Either party (sender or admin) can delete any message.
   - Executes an immediate `DELETE` from SQLite and dispatches a WebSocket event to purge the message from both screens instantly.
4. **Wipe Entire Chat**:
   - Both users and administrators have the ability to clear the entire conversation history with one click.

---

## 4. Media & Image Messaging

1. **Photo Sending (Paperclip Attachment)**:
   - Users and admins can attach and send images directly in the chat stream.
   - Supports device camera and gallery selection via the paperclip icon.
   - Supports desktop clipboard image paste (`Ctrl+V`) directly into the input bar.
2. **Pre-Send Preview Bar**:
   - Shows image thumbnail, filename, file size, and discard button.
   - Supports adding an optional caption text to the image before sending.
3. **Encrypted Payload Representation**:
   - Stored in the database as `[image:${url}]\n${caption}`, encrypted with AES-256-GCM.
4. **Full-Screen Lightbox**:
   - Tapping/clicking any image in the chat opens an animated high-resolution modal with blur backdrop, close button, and instant download button.

---

## 5. Security & Encryption Standards

1. **At-Rest Message Encryption**:
   - Every message ciphertext is encrypted using **AES-256-GCM** with a unique 96-bit initialization vector (IV) and 128-bit authentication tag per row.
   - Raw plaintext messages never hit the disk unencrypted.
2. **Password Hashing**:
   - Salted and hashed using `bcrypt` (12 rounds).
3. **JWT Authentication**:
   - Stateless JWT tokens passed via `Authorization: Bearer <token>` and validated on both REST API and Socket.IO handshakes.
4. **Input Sanitization**:
   - All rendered content is strictly sanitized against XSS attacks.

---

## 6. Progressive Web App (PWA) & Custom Branding

1. **Mobile Installation (iOS & Android)**:
   - Installable on iOS via Safari ("Add to Home Screen") and Android via Chrome ("Install App").
   - Responsive standalone view with notch (`.pt-safe`) and home indicator (`.pb-safe`) spacing.
2. **Admin Branding & Customization**:
   - **App Name**: Custom system title dynamically reflected in browser title and PWA manifest.
   - **PWA Short Name**: Custom label under the home screen app icon.
   - **PWA Icon Upload**: Admin can upload custom PNG/SVG app icons dynamically served in `/manifest.json`.
   - **Profile Photo Upload**: Admin and users can upload their own profile pictures stored in `/app/data/uploads/avatars`.

---

## 7. Database Backup & Disaster Recovery

1. **Online Database Backup**:
   - Admin can download a verified, consistent `.db` snapshot of the SQLite database at any time via the admin modal (`GET /api/admin/backup`).
   - Uses SQLite's online backup API (`db.backup()`) ensuring zero corruption even during active writes.
2. **Live Database Restore**:
   - Admin can upload a `.db` backup file to restore the entire system (`POST /api/admin/restore`).
   - Implements automated schema integrity checks (`PRAGMA integrity_check`) before swapping the database file.

---

## 8. Multi-Domain Server Architecture

1. **Shared Nginx Gateway**:
   - Reverse proxy container (`xmessenger-nginx`) handling Let's Encrypt SSL certificates and HTTP/2 terminating reverse proxy.
2. **Instance Isolation**:
   - Each domain runs as an independent container (`xmessenger-<domain-slug>`) with isolated data volumes.
3. **Centralized Management CLI**:
   - Manage all domains, SSL renewal, passwords, updates, and logs using `xmessenger` and `xupdate`.
