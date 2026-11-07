# Graph Report - XMessenger  (2026-11-07)

## Corpus Check
- Corpus is ~14,942 words - fits in a single context window. You may not need a graph.

## Summary
- 250 nodes · 454 edges · 14 communities (10 shown, 4 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Client UI & Admin Dashboard
- Backend Server & Crypto Core
- Client Dev Dependencies
- Database & Authentication Libs
- Client TypeScript Config
- Root Workspace Configuration
- Server TypeScript Config
- Client Runtime Dependencies
- i18n & RTL Localization
- Server Package Dependencies
- Message Bubble & TTL Engine
- Linux Automated Installer

## God Nodes (most connected - your core abstractions)
1. `useAuthStore` - 19 edges
2. `compilerOptions` - 16 edges
3. `react` - 13 edges
4. `lucide-react` - 12 edges
5. `react-i18next` - 12 edges
6. `compilerOptions` - 12 edges
7. `useChatStore` - 10 edges
8. `getSocket()` - 9 edges
9. `getSettingValue()` - 8 edges
10. `AdminUserItem` - 7 edges

## Surprising Connections (you probably didn't know these)
- `App()` --calls--> `useAuthStore`  [EXTRACTED]
  client/src/App.tsx → client/src/stores/authStore.ts
- `Props` --references--> `AdminUserItem`  [EXTRACTED]
  client/src/components/admin/AdminSidebar.tsx → client/src/services/api.ts
- `AuthModal()` --calls--> `useAuthStore`  [EXTRACTED]
  client/src/components/auth/AuthModal.tsx → client/src/stores/authStore.ts
- `Props` --references--> `Message`  [EXTRACTED]
  client/src/components/common/MessageItem.tsx → client/src/services/api.ts
- `ThemeToggle()` --calls--> `useAuthStore`  [EXTRACTED]
  client/src/components/common/ThemeToggle.tsx → client/src/stores/authStore.ts

## Import Cycles
- None detected.

## Communities (14 total, 4 thin omitted)

### Community 0 - "Client UI & Admin Dashboard"
Cohesion: 0.11
Nodes (29): App(), AdminDashboard(), Props, AdminSidebar(), Props, AuthModal(), PendingApprovalScreen(), Props (+21 more)

### Community 1 - "Backend Server & Crypto Core"
Cohesion: 0.11
Nodes (35): bcryptjs, cors, dotenv, express, socket.io, uuid, config, db (+27 more)

### Community 2 - "Client Dev Dependencies"
Cohesion: 0.06
Nodes (30): devDependencies, autoprefixer, postcss, tailwindcss, @types/node, @types/react, @types/react-dom, typescript (+22 more)

### Community 3 - "Database & Authentication Libs"
Cohesion: 0.07
Nodes (28): better-sqlite3, jsonwebtoken, tsx, @types/bcryptjs, @types/better-sqlite3, @types/cors, @types/express, @types/jsonwebtoken (+20 more)

### Community 4 - "Client TypeScript Config"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+9 more)

### Community 5 - "Root Workspace Configuration"
Cohesion: 0.13
Nodes (14): author, description, keywords, license, name, private, scripts, build (+6 more)

### Community 6 - "Server TypeScript Config"
Cohesion: 0.14
Nodes (13): compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, outDir, resolveJsonModule (+5 more)

### Community 7 - "Client Runtime Dependencies"
Cohesion: 0.20
Nodes (10): dependencies, clsx, i18next, lucide-react, react, react-dom, react-i18next, socket.io-client (+2 more)

### Community 8 - "i18n & RTL Localization"
Cohesion: 0.24
Nodes (5): LanguageToggle(), resources, setAppLanguage(), i18next, react-dom

### Community 9 - "Server Package Dependencies"
Cohesion: 0.20
Nodes (10): dependencies, bcryptjs, better-sqlite3, cors, dotenv, express, jsonwebtoken, socket.io (+2 more)

## Knowledge Gaps
- **119 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+114 more)
  These have ≤1 connection - possible missing edges. (Counts symbols only; 137 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Client UI & Admin Dashboard` to `i18n & RTL Localization`, `Client Dev Dependencies`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _119 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Client UI & Admin Dashboard` be split into smaller, more focused modules?**
  _Cohesion score 0.10505050505050505 - nodes in this community are weakly interconnected._
- **Why does `react-i18next` connect `Client UI & Admin Dashboard` to `i18n & RTL Localization`, `Client Dev Dependencies`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Should `Backend Server & Crypto Core` be split into smaller, more focused modules?**
  _Cohesion score 0.1126530612244898 - nodes in this community are weakly interconnected._
- **Why does `dependencies` connect `Client Runtime Dependencies` to `Client Dev Dependencies`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Should `Client Dev Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._