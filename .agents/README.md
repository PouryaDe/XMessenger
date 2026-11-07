# .agents Directory Specification

This directory holds the agentic configurations, architectural decisions, coding guidelines, and automation workflows for **XMessenger**.

## Structure
- `rules/`
  - `ui-ux-design-system.md`: Full design system specification based on the warm cream, rounded-card, floating-pill concept UI.
  - `security.md`: Hard security rules, cryptographic standards (AES-256-GCM, Argon2id, JWT), zero persistence of expired messages, sanitization.
  - `architecture.md`: Hub-and-Spoke one-way communication contract, single admin role, user isolation rules.
- `workflows/`
  - `deploy.md`: Deployment instructions, Docker Compose specifications, and automated SSL/Let's Encrypt renewal.
  - `development.md`: Local development, testing, and migration flows.
