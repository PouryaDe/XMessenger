# Security Rules & Standards for XMessenger

## 1. Cryptography Standards
- **At-Rest Message Encryption**: All message text stored in the database must be encrypted using **AES-256-GCM** with a cryptographically secure random initialization vector (IV) per record and authentication tag. Raw message text must never hit persistent storage unencrypted.
- **Password Hashing**: Passwords must be hashed using strong adaptive hashing (Argon2id or bcrypt with cost >= 12).
- **Transport Security**: All production traffic must pass through TLS 1.3/1.2 (HTTPS and WSS).

## 2. Hub-and-Spoke Isolation
- **Strict Peer Isolation**: A regular user must NEVER be able to query, list, search, or send messages to another regular user. The backend API and WebSocket handlers must strictly validate that any message from a user has `recipientId = admin.id` and vice-versa.
- Any request attempting to fetch messages for other user IDs must return `403 Forbidden` and be dropped.

## 3. Disappearing Messages (TTL) & Zero Residual Footprint
- Messages have an expiration timestamp (`expiresAt`).
- A background TTL worker must perform periodic **hard deletes** (`DELETE FROM messages WHERE expires_at <= CURRENT_TIMESTAMP`) rather than soft deletes.
- Immediate two-way deletion ("Delete for everyone") must execute a hard delete from the database and dispatch a WebSocket purge event to connected peers.
- SQLite database should run in WAL mode with secure vacuuming or truncation where appropriate.

## 4. Input Sanitization & Anti-Abuse
- Strictly sanitize all client-rendered text against XSS using DOMPurify before rendering HTML or markdown.
- Implement rate limiting on sensitive routes (`/api/auth/login`, `/api/auth/register`, `/api/auth/refresh`).
- No sensitive user payloads or decrypted message content shall ever be written to application logs.
