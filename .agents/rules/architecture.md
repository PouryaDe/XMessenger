# Architecture Contract

## Hub-and-Spoke Messenger Design
1. **Roles**:
   - `ADMIN`: Special role. Can view all conversations, approve/reject/ban users, toggle registration settings, change global message TTL, and broadcast or reply to any user.
   - `USER`: Regular user. Can only view their own single thread with the ADMIN.
2. **Registration Modes**:
   - `OPEN`: User can immediately start chatting with admin after registration.
   - `MANUAL_APPROVAL`: Registered user is in `PENDING` state until an admin manually approves them from the admin panel. While pending, user sees a friendly pending verification screen and cannot send messages.
   - `DISABLED`: New registrations are rejected with an appropriate error message.
3. **i18n & Bidirectionality**:
   - Languages: Persian (`fa`) and English (`en`).
   - HTML document must reflect `dir="rtl"` and `lang="fa"` or `dir="ltr"` and `lang="en"`.
   - Vazirmatn font loaded for Persian typography.
   - All components must use directional Tailwind classes (`rtl:` / `ltr:` or logical flex/margin properties) to guarantee flawless alignment.
