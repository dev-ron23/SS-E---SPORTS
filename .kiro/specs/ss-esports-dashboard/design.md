# Design Document: SS E-Sports Tournament Dashboard

## Overview

The SS E-Sports Tournament Dashboard is a live, bidirectional web application layered on top of the existing Discord bot. It gives tournament administrators a premium browser-based interface to monitor and control every aspect of a Free Fire tournament in real time — squad registration, group management, match operations, scoring, and moderation — without touching Discord slash commands.

The system introduces three new components that integrate with the existing bot process:

1. **Bridge Server** — an Express + Socket.IO server that runs inside the same Node.js process as the bot, sharing its SQLite database connection and exposing a REST API on port 3001 plus real-time push events over WebSocket.
2. **Dashboard Backend** — a Next.js 14 application with API routes that handle Discord OAuth2 authentication and proxy admin write operations to the Bridge Server (keeping the API key server-side).
3. **Dashboard Frontend** — Next.js 14 App Router pages with React, TailwindCSS, Framer Motion, and shadcn/ui, styled with an Apple Liquid Glass aesthetic.

The scoring and leaderboard system is entirely new: a `scores` table, a `/update_score` slash command, and a live-ranked leaderboard page.

### Key Design Decisions

- **Same-process bridge**: Running the bridge inside the bot process eliminates network overhead for DB reads and lets bot handlers call `emitter.emit()` directly after every state change, guaranteeing event completeness.
- **Next.js proxy route**: All bridge POST calls from the browser go through `/api/bridge/[...path]` in Next.js, which injects the `DASHBOARD_API_KEY` header server-side. The key is never sent to the browser.
- **SQLite WAL mode**: The existing database already uses WAL mode, which allows concurrent reads from the dashboard while the bot writes, without locking.
- **Socket.IO singleton on client**: A single Socket.IO client instance is shared across all pages via React context, preventing duplicate connections on navigation.
- **Optimistic UI with socket reconciliation**: Dashboard pages render immediately from REST fetch on load, then apply incremental socket events — no polling required.


---

## Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Endercloud VPS                              │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Node.js Process (ss-esports-bot)                        │   │
│  │                                                          │   │
│  │  ┌─────────────────┐    ┌──────────────────────────┐    │   │
│  │  │   Discord Bot    │    │     Bridge Server         │    │   │
│  │  │   (index.js)     │    │  Express + Socket.IO      │    │   │
│  │  │                  │───▶│  :3001                    │    │   │
│  │  │  handlers/       │    │                          │    │   │
│  │  │  registration.js │    │  emitter.emit(event,data)│    │   │
│  │  │  matches.js      │    │  after every DB write    │    │   │
│  │  │  moderation.js   │    │                          │    │   │
│  │  └────────┬─────────┘    └──────────┬───────────────┘    │   │
│  │           │                         │                     │   │
│  │           └──────────┬──────────────┘                     │   │
│  │                      ▼                                     │   │
│  │              ┌───────────────┐                            │   │
│  │              │  SQLite DB    │                            │   │
│  │              │ tournament.db │                            │   │
│  │              └───────────────┘                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Next.js 14 Process (ss-esports-dashboard)               │   │
│  │                                                          │   │
│  │  ┌─────────────────────┐  ┌──────────────────────────┐  │   │
│  │  │  App Router Pages   │  │  API Routes               │  │   │
│  │  │  (React + Tailwind) │  │  /api/auth/[...nextauth]  │  │   │
│  │  │                     │  │  /api/bridge/[...path]    │  │   │
│  │  │  Socket.IO client   │  │  (proxy + API key inject) │  │   │
│  │  │  (singleton)        │  └──────────────┬────────────┘  │   │
│  │  └─────────────────────┘                 │               │   │
│  └──────────────────────────────────────────┼───────────────┘   │
│                                             │ HTTP :3001        │
│                                             ▼                   │
│                                    Bridge Server REST API       │
└─────────────────────────────────────────────────────────────────┘

Browser
  │  HTTPS (Socket.IO WS + HTTP)
  ▼
Next.js Dashboard
```

### Data Flow: Bot Action → Dashboard Update

```
Discord Message
      │
      ▼
registration.js / matches.js / moderation.js
      │  (1) DB write (better-sqlite3, synchronous)
      ▼
SQLite tournament.db
      │  (2) emitter.emit('squad:registered', squad)
      ▼
bridge/emitter.js (Socket.IO singleton)
      │  (3) io.emit() to all connected clients
      ▼
Browser Socket.IO client
      │  (4) React state update
      ▼
Dashboard re-renders affected component
```

### Data Flow: Dashboard Action → Discord

```
Admin clicks button in browser
      │
      ▼
Next.js /api/bridge/[...path] (server-side)
      │  injects Authorization: Bearer DASHBOARD_API_KEY
      ▼
Bridge Server POST handler
      │  (1) validates API key
      │  (2) calls handler function directly (same process)
      ▼
handler (registration.js / matches.js / moderation.js)
      │  (3) DB write
      │  (4) Discord API call (DM, embed, role)
      │  (5) emitter.emit(event, data)
      ▼
All connected Dashboard clients receive socket event
```

### File Structure

```
ss-esports-bot/
├── bridge/
│   ├── server.js              # Express + Socket.IO server, started by index.js
│   ├── emitter.js             # Socket.IO singleton (io instance)
│   └── routes/
│       ├── squads.js          # POST /api/cancel-squad, /api/edit-squad
│       ├── matches.js         # POST /api/assign-match, /api/start-match, /api/declare-winner
│       ├── scores.js          # POST /api/update-score, GET /api/scores
│       ├── moderation.js      # POST /api/warn-player, /api/mute-player, /api/unmute-player
│       ├── settings.js        # GET+POST /api/settings, /api/lock-registration, /api/unlock-registration
│       ├── broadcast.js       # POST /api/broadcast, /api/clear-reg-chat
│       └── logs.js            # GET /api/logs
├── index.js                   # Updated: starts bridge server after bot login
├── handlers/
│   ├── registration.js        # Updated: calls emitter.emit after state changes
│   ├── matches.js             # Updated: calls emitter.emit after state changes
│   ├── moderation.js          # Updated: calls emitter.emit after state changes
│   └── groups.js              # Updated: calls emitter.emit after state changes
├── database/
│   ├── db.js                  # Updated: adds score CRUD functions
│   └── schema.sql             # Updated: adds scores table
└── commands/
    └── update_score.js        # New: /update_score slash command

ss-esports-dashboard/
├── app/
│   ├── layout.tsx             # Root layout: sidebar, socket provider, auth check
│   ├── page.tsx               # Home / Overview
│   ├── squads/
│   │   └── page.tsx           # Squads list + detail panel
│   ├── groups/
│   │   └── page.tsx           # Groups grid
│   ├── matches/
│   │   └── page.tsx           # Match Center
│   ├── leaderboard/
│   │   └── page.tsx           # Live leaderboard + score entry
│   ├── admin/
│   │   └── page.tsx           # Admin panel
│   ├── logs/
│   │   └── page.tsx           # Audit logs
│   ├── settings/
│   │   └── page.tsx           # Tournament settings
│   ├── login/
│   │   └── page.tsx           # Discord OAuth2 login
│   ├── denied/
│   │   └── page.tsx           # Access denied
│   └── api/
│       ├── auth/
│       │   └── [...nextauth]/
│       │       └── route.ts   # NextAuth Discord provider
│       └── bridge/
│           └── [...path]/
│               └── route.ts   # Proxy to bridge server
├── components/
│   ├── ui/                    # shadcn/ui primitives
│   ├── glass/
│   │   ├── GlassCard.tsx
│   │   ├── GlassButton.tsx
│   │   └── GlassBadge.tsx
│   ├── live/
│   │   ├── LiveBadge.tsx
│   │   ├── SocketProvider.tsx
│   │   └── useSocket.ts
│   ├── charts/
│   │   └── LeaderboardChart.tsx
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── TopBar.tsx
│   │   └── MobileTabBar.tsx
│   └── shared/
│       ├── AnimatedCounter.tsx
│       ├── SkeletonCard.tsx
│       ├── ToastNotification.tsx
│       ├── ConfirmDialog.tsx
│       └── ErrorState.tsx
├── lib/
│   ├── socket.ts              # Socket.IO client singleton
│   ├── api.ts                 # Bridge API client (calls /api/bridge/*)
│   └── auth.ts                # NextAuth config
├── types/
│   └── index.ts               # Shared TypeScript types
└── styles/
    └── globals.css            # Tailwind base + glass CSS variables
```

---

## Components and Interfaces

### Bridge Server (`bridge/server.js`)

The bridge server is an Express application with Socket.IO attached to the same HTTP server. It is started by `index.js` after the Discord client logs in, sharing the same process and SQLite connection.

```javascript
// bridge/server.js — public interface
function startBridgeServer(discordClient, guild) -> { httpServer, io }
// Starts Express on process.env.PORT (default 3001)
// Attaches Socket.IO to the HTTP server
// Registers all route modules
// Returns the server instances for graceful shutdown
```

**Middleware stack (applied in order):**
1. `cors({ origin: process.env.DASHBOARD_ORIGIN })` — restricts to dashboard origin
2. `express.json()` — parses JSON request bodies
3. `apiKeyAuth` — validates `Authorization: Bearer <DASHBOARD_API_KEY>` on all POST/PUT routes

**API key middleware:**
```javascript
function apiKeyAuth(req, res, next)
// Reads Authorization header
// Compares to process.env.DASHBOARD_API_KEY
// Returns 401 if missing or invalid
// Calls next() if valid
```

### Bridge Emitter (`bridge/emitter.js`)

A singleton that holds the Socket.IO `io` instance. Bot handlers import this and call `emitter.emit()` after every state change.

```javascript
// bridge/emitter.js
let _io = null;

function setIo(io: SocketIOServer): void
// Called once by server.js after Socket.IO is initialized

function emit(event: string, data: unknown): void
// Calls io.emit(event, data) if io is initialized
// Silently no-ops if io is not yet set (bot startup before bridge)

function getIo(): SocketIOServer | null
```

### REST Route Modules

#### `bridge/routes/squads.js`

```javascript
// GET /api/squads
// Returns: { success: true, data: Squad[] }
// Calls: db.getAllSquads()

// POST /api/cancel-squad
// Body: { squad_id: string }
// Calls: registration.cancelSquad(squad_id, guild, client)
// Emits: squad:cancelled
// Returns: { success: true } | 400 | 404

// POST /api/edit-squad
// Body: { squad_id: string, team_name?: string, leader_id?: string, player_ids?: string[] }
// Calls: db.updateSquad(squad_id, updates), posts edit embed
// Emits: squad:updated
// Returns: { success: true, data: Squad } | 400 | 404
```

#### `bridge/routes/matches.js`

```javascript
// GET /api/matches
// Returns: { success: true, data: Match[] }

// GET /api/groups
// Returns: { success: true, data: Group[] }

// POST /api/assign-match
// Body: { group_no: number, room_id: string, password: string }
// Calls: matches.assignMatch(groupNo, roomId, password, guild, client)
// Emits: match:assigned
// Returns: { success: true } | 400

// POST /api/start-match
// Body: { group_no: number }
// Calls: matches.startMatch(groupNo, guild, client)
// Emits: match:started
// Returns: { success: true } | 400

// POST /api/declare-winner
// Body: { squad_id: string, position: number }
// Calls: matches.declareWinner(squadId, position, guild, client)
// Emits: match:winner
// Returns: { success: true } | 400 | 404
```

#### `bridge/routes/scores.js`

```javascript
// GET /api/scores
// Returns: { success: true, data: ScoreRecord[] }
// Includes aggregated totals per squad

// POST /api/update-score
// Body: { squad_id: string, kills: number, placement: number, match_id?: string }
// Validates: kills >= 0, placement >= 0, squad exists
// Calls: db.insertScore(record)
// Emits: score:updated
// Returns: { success: true, data: ScoreRecord } | 400 | 404
```

#### `bridge/routes/moderation.js`

```javascript
// POST /api/warn-player
// Body: { discord_id: string, reason: string }
// Calls: moderation.warnPlayer(userId, reason, guild, 'Dashboard', client)
// Emits: player:warned
// Returns: { success: true, data: { warnings: number } } | 400 | 404

// POST /api/mute-player
// Body: { discord_id: string }
// Calls: moderation.mutePlayer(userId, guild, 'Dashboard', client)
// Emits: player:muted { discord_id, is_muted: true }
// Returns: { success: true } | 400 | 404

// POST /api/unmute-player
// Body: { discord_id: string }
// Calls: moderation.unmutePlayer(userId, guild, 'Dashboard', client)
// Emits: player:muted { discord_id, is_muted: false }
// Returns: { success: true } | 400 | 404
```

#### `bridge/routes/settings.js`

```javascript
// GET /api/settings
// Returns: { success: true, data: { tournament_name, prize_pool, max_slots, game_mode, registration_locked } }

// POST /api/update-settings
// Body: { tournament_name?: string, prize_pool?: string, max_slots?: number, game_mode?: string }
// Validates: max_slots is positive integer if provided
// Calls: db.setSetting() for each provided key
// Emits: settings:updated
// Returns: { success: true } | 400

// POST /api/lock-registration
// Calls: db.setSetting('registration_locked', '1'), posts lock embed to Discord
// Emits: registration:status { locked: true }
// Returns: { success: true }

// POST /api/unlock-registration
// Calls: db.setSetting('registration_locked', '0'), posts unlock embed to Discord
// Emits: registration:status { locked: false }
// Returns: { success: true }
```

#### `bridge/routes/broadcast.js`

```javascript
// POST /api/broadcast
// Body: { message: string }
// Validates: message is non-empty string
// Calls: dmEngine.dmAllActivePlayers(message, client)
// Returns: { success: true, data: { sent: number } } | 400

// POST /api/clear-reg-chat
// Calls: moderation.clearRegChat(guild, 'Dashboard', client)
// Returns: { success: true, data: { deleted: number } }
```

#### `bridge/routes/logs.js`

```javascript
// GET /api/logs
// Query params: limit? (default 200), action?, actor_id?, target_id?, from?, to?
// Returns: { success: true, data: ActionLog[] }
```

### Next.js Proxy Route (`app/api/bridge/[...path]/route.ts`)

```typescript
// Handles GET, POST, PUT for all /api/bridge/* paths
// Strips /api/bridge prefix, forwards to NEXT_PUBLIC_BRIDGE_URL
// Injects Authorization: Bearer BRIDGE_API_KEY (server env var)
// Streams response body back to browser
// Never exposes BRIDGE_API_KEY to client bundle

async function GET(req: Request, { params }: { params: { path: string[] } }): Promise<Response>
async function POST(req: Request, { params }: { params: { path: string[] } }): Promise<Response>
```

### NextAuth Configuration (`lib/auth.ts`)

```typescript
// Discord OAuth2 provider
// Scopes: identify, guilds, guilds.members.read
// Callbacks:
//   signIn: fetches guild member, checks for Administrator permission
//   jwt: stores discord access token + admin status
//   session: exposes { user: { id, name, image, isAdmin } }
// Session strategy: jwt, maxAge: 86400 (24 hours)
// Pages: signIn: '/login', error: '/denied'
```

### Socket.IO Client (`lib/socket.ts`)

```typescript
// Singleton Socket.IO client
// Connects to process.env.NEXT_PUBLIC_BRIDGE_URL
// Reconnection: enabled, delay: 5000ms
// Exported as: socket (Socket instance)

export const socket: Socket
export function connectSocket(): void
export function disconnectSocket(): void
```

### Socket Provider (`components/live/SocketProvider.tsx`)

```typescript
// React context provider wrapping the entire app
// Manages connection state: 'connected' | 'disconnected' | 'reconnecting'
// Exposes: useSocketStatus() hook
// On mount: calls connectSocket()
// On unmount: calls disconnectSocket()
// Listens to: connect, disconnect, connect_error events

interface SocketContextValue {
  status: 'connected' | 'disconnected' | 'reconnecting'
}

export function SocketProvider({ children }: { children: React.ReactNode }): JSX.Element
export function useSocketStatus(): SocketContextValue
```

### Key Frontend Components

#### `components/glass/GlassCard.tsx`
```typescript
interface GlassCardProps {
  children: React.ReactNode
  className?: string
  glow?: 'blue' | 'purple' | 'green' | 'none'  // neon glow variant
  animate?: boolean  // Framer Motion entry animation
}
// backdrop-filter: blur(20px)
// background: rgba(255,255,255,0.05)
// border: 1px solid rgba(255,255,255,0.1)
// border-radius: 16px
// glow='blue': box-shadow: 0 0 20px rgba(0,212,255,0.3)
```

#### `components/live/LiveBadge.tsx`
```typescript
// Reads useSocketStatus()
// Connected: pulsing green dot + "LIVE" text, CSS keyframe glow animation
// Disconnected: static red dot + "DISCONNECTED" text
// Reconnecting: amber dot + "RECONNECTING..." text
```

#### `components/shared/AnimatedCounter.tsx`
```typescript
interface AnimatedCounterProps {
  value: number
  duration?: number  // animation duration ms, default 600
  className?: string
}
// Uses Framer Motion useMotionValue + useTransform
// Animates from previous value to new value on prop change
```

#### `components/shared/SkeletonCard.tsx`
```typescript
interface SkeletonCardProps {
  rows?: number   // number of shimmer rows, default 3
  height?: string // card height, default 'h-32'
}
// CSS shimmer animation: background gradient sweep
// Used during initial data fetch on all pages
```

#### `components/shared/ToastNotification.tsx`
```typescript
interface Toast {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
  duration?: number  // ms, default 4000
}
// Framer Motion AnimatePresence for slide-in/out
// Positioned: fixed bottom-right
// Auto-dismisses after duration
```

#### `components/shared/ConfirmDialog.tsx`
```typescript
interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  onConfirm: () => void
  onCancel: () => void
  destructive?: boolean  // red confirm button
}
// shadcn/ui Dialog base
// Framer Motion scale + fade animation
```

#### `components/layout/Sidebar.tsx`
```typescript
// Navigation links with active glow indicator
// Links: Overview, Squads, Groups, Matches, Leaderboard, Admin, Logs, Settings
// Active state: neon blue left border + text glow
// Bottom: admin avatar + logout button
// Collapses to MobileTabBar on screens < 768px
```

#### Squad-specific components

```typescript
// SquadRow.tsx
interface SquadRowProps {
  squad: Squad
  onSelect: (squad: Squad) => void
  isSelected: boolean
}
// Expandable row with glass hover effect
// Group badge: distinct color per group number (hue rotation)
// Status indicator: green dot (active), red dot (cancelled)

// SquadDetailPanel.tsx
interface SquadDetailPanelProps {
  squad: Squad
  players: Player[]
  onClose: () => void
}
// Slide-in panel from right
// Shows: all player Discord IDs, game UIDs, warning counts, mute status
// Actions: Cancel Squad (with ConfirmDialog), Edit Squad (inline form)
```

#### Match-specific components

```typescript
// GroupCard.tsx
interface GroupCardProps {
  group: Group
  match: Match | null
  squads: Squad[]
}
// GlassCard with glow='blue' when match is in progress
// Status badge: pending | room-assigned | in-progress | completed
// Shows: squad list, room ID (if assigned), start time (if started), winner (if declared)

// MatchTimer.tsx
interface MatchTimerProps {
  startedAt: string  // ISO timestamp
  stopped?: boolean
}
// useEffect + setInterval(1000) counting up from startedAt
// Displays: HH:MM:SS
// Stops when stopped=true

// LeaderboardRow.tsx
interface LeaderboardRowProps {
  rank: number
  squad: Squad
  totalKills: number
  totalPlacement: number
  totalPoints: number
  scores: ScoreRecord[]  // for expandable breakdown
}
// Rank 1: gold text + gold glow
// Rank 2: silver text + silver glow
// Rank 3: bronze text + bronze glow
// Framer Motion layout animation on rank change
// Expandable: per-match score breakdown
```

---

## Data Models

### TypeScript Types (`types/index.ts`)

```typescript
// Mirrors the SQLite schema with JSON fields deserialized

export interface Squad {
  squad_id: string           // e.g. "SSE-0001"
  squad_no: number
  team_name: string
  leader_id: string          // Discord user ID
  player_ids: string[]       // deserialized from JSON
  player_uids: Record<string, string>  // { discord_id: game_uid }
  group_no: number | null
  registration_msg_id: string | null
  registration_channel_id: string | null
  confirmed_msg_id: string | null
  group_msg_id: string | null
  registered_at: string      // ISO timestamp
  status: 'active' | 'cancelled' | 'edited'
  winner_position: number | null
}

export interface Player {
  discord_id: string
  squad_id: string
  game_uid: string | null
  role: 'leader' | 'player'
  warnings: number
  is_muted: 0 | 1
}

export interface Group {
  group_no: number
  channel_id: string
  role_id: string
  squad_ids: string[]        // deserialized from JSON
  match_room_id: string | null
  match_password: string | null
  match_started_at: string | null
}

export interface Match {
  match_id: string
  group_no: number
  room_id: string
  password: string
  assigned_at: string        // ISO timestamp
  started_at: string | null
  winner_squad_id: string | null
}

export interface ScoreRecord {
  id: number
  squad_id: string
  match_id: string | null
  kills: number              // >= 0
  placement_points: number   // >= 0
  total_points: number       // kills + placement_points (virtual/computed)
  recorded_at: string        // ISO timestamp
}

export interface ActionLog {
  id: number
  action: string
  actor_id: string | null
  target_id: string | null
  details: string | null
  timestamp: string          // ISO timestamp
}

export interface TournamentSettings {
  tournament_name: string
  prize_pool: string
  max_slots: number
  game_mode: string
  registration_locked: boolean
}

// Leaderboard entry (aggregated from scores)
export interface LeaderboardEntry {
  squad_id: string
  team_name: string
  rank: number
  total_kills: number
  total_placement_points: number
  total_points: number
  scores: ScoreRecord[]      // per-match breakdown
}

// Socket.IO event payloads
export interface SocketEvents {
  'squad:registered': { squad: Squad }
  'squad:cancelled': { squad_id: string }
  'squad:updated': { squad: Squad }
  'match:assigned': { group_no: number; room_id: string; password: string }
  'match:started': { group_no: number; started_at: string }
  'match:winner': { squad_id: string; team_name: string; position: number }
  'player:warned': { discord_id: string; squad_id: string; warnings: number }
  'player:muted': { discord_id: string; is_muted: boolean }
  'registration:status': { locked: boolean }
  'audit:log': ActionLog
  'score:updated': ScoreRecord
  'settings:updated': TournamentSettings
}

// API response envelope
export interface ApiResponse<T> {
  success: true
  data: T
}

export interface ApiError {
  success: false
  error: string
  field?: string  // for 400 validation errors
}
```

### Database Schema Changes

Add to `ss-esports-bot/database/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  squad_id TEXT NOT NULL,
  match_id TEXT,
  kills INTEGER DEFAULT 0,
  placement_points INTEGER DEFAULT 0,
  total_points INTEGER GENERATED ALWAYS AS (kills + placement_points) VIRTUAL,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (squad_id) REFERENCES squads(squad_id),
  FOREIGN KEY (match_id) REFERENCES matches(match_id)
);
```

### New DB Functions (`database/db.js`)

```javascript
// Insert a score record
// Validates: kills >= 0, placement_points >= 0
function insertScore({ squad_id, match_id, kills, placement_points, recorded_at })
  -> { id, squad_id, match_id, kills, placement_points, total_points, recorded_at }

// Get all scores for a squad
function getScoresBySquad(squadId) -> ScoreRecord[]

// Get all scores (for leaderboard)
function getAllScores() -> ScoreRecord[]

// Get aggregated leaderboard data
// Returns squads sorted by total_points DESC, then total_kills DESC
function getLeaderboard() -> LeaderboardEntry[]
```

### Leaderboard Computation

The leaderboard is computed in `db.getLeaderboard()` using a SQL query:

```sql
SELECT
  s.squad_id,
  s.team_name,
  COALESCE(SUM(sc.kills), 0) AS total_kills,
  COALESCE(SUM(sc.placement_points), 0) AS total_placement_points,
  COALESCE(SUM(sc.total_points), 0) AS total_points
FROM squads s
LEFT JOIN scores sc ON s.squad_id = sc.squad_id
WHERE s.status = 'active'
GROUP BY s.squad_id, s.team_name
ORDER BY total_points DESC, total_kills DESC
```

Rank is assigned in JavaScript as the 1-based index of the result array (ties in both total_points and total_kills share the same rank).

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Score Non-Negativity

*For any* score record inserted into the `scores` table — whether via the `/update_score` slash command or the `/api/update-score` bridge endpoint — both `kills` and `placement_points` SHALL be greater than or equal to zero, and `total_points` SHALL equal `kills + placement_points`.

**Validates: Requirements 3.2, 3.3, 15.5**

---

### Property 2: Leaderboard Ordering

*For any* set of active squads with associated score records, the leaderboard returned by `db.getLeaderboard()` SHALL be sorted such that for any two entries A and B: if `total_points(A) > total_points(B)` then `rank(A) < rank(B)`, and if `total_points(A) == total_points(B)` and `total_kills(A) > total_kills(B)` then `rank(A) < rank(B)`.

**Validates: Requirements 3.4, 3.5**

---

### Property 3: Score Round-Trip Persistence

*For any* valid score record `{ squad_id, kills, placement_points }` inserted via `db.insertScore()`, querying `db.getScoresBySquad(squad_id)` SHALL return a record containing the same `kills`, `placement_points`, and `total_points = kills + placement_points`.

**Validates: Requirements 3.1, 3.2, 15.2**

---

### Property 4: Auth Isolation — Unauthorized Requests Rejected

*For any* POST or PUT endpoint on the Bridge Server, a request with a missing, empty, or incorrect `Authorization` header SHALL always receive HTTP 401 and SHALL result in zero database writes and zero Socket.IO events emitted.

**Validates: Requirements 1.16, 17.1, 17.2**

---

### Property 5: Invalid Parameter Rejection

*For any* POST endpoint on the Bridge Server, a request body that is missing one or more required fields SHALL always receive HTTP 400 with a JSON error body containing a description of the missing field. No database writes or Socket.IO events SHALL occur.

**Validates: Requirements 1.14**

---

### Property 6: Non-Existent Resource Rejection

*For any* POST endpoint on the Bridge Server that accepts a `squad_id` or `discord_id`, a request referencing an ID that does not exist in the database SHALL always receive HTTP 404 with a JSON error body. No database writes or Socket.IO events SHALL occur.

**Validates: Requirements 1.15**

---

### Property 7: Squad Cancellation Consistency

*For any* active squad, calling the cancel-squad operation (via bridge POST or bot command) SHALL result in: the squad's `status` being `'cancelled'` in the database, the squad no longer appearing in `db.getAllActiveSquads()`, and a `squad:cancelled` Socket.IO event being emitted with the correct `squad_id`.

**Validates: Requirements 1.4, 2.2**

---

### Property 8: Squad Edit Persistence

*For any* active squad and any valid set of updated fields `{ team_name?, leader_id?, player_ids? }`, calling the edit-squad operation SHALL result in: the database record reflecting exactly the provided updates, all other fields remaining unchanged, and a `squad:updated` Socket.IO event being emitted with the updated squad object.

**Validates: Requirements 1.5, 2.3**

---

### Property 9: Socket Event Completeness

*For any* state-changing operation performed by the bot handlers (registration, cancellation, edit, match assignment, match start, winner declaration, warn, mute, unmute, score update, settings update), a corresponding Socket.IO event SHALL be emitted with a payload that accurately reflects the new state. The event SHALL be emitted in the same synchronous tick as the database write (no async gap).

**Validates: Requirements 2.1–2.11**

---

### Property 10: GET Endpoint Response Envelope

*For any* GET endpoint on the Bridge Server (`/api/squads`, `/api/groups`, `/api/matches`, `/api/scores`, `/api/logs`, `/api/settings`), the response SHALL always be a JSON object with the shape `{ success: true, data: Array | Object }`. The `data` field SHALL never be `null` or `undefined` — it SHALL be an empty array `[]` when no records exist.

**Validates: Requirements 14.1, 14.3**

---

### Property 11: Settings Validation — max_slots

*For any* POST to `/api/update-settings` where `max_slots` is provided, if `max_slots` is not a positive integer (i.e., it is negative, zero, a float, or a non-numeric string), the Bridge Server SHALL return HTTP 400 and make no database changes.

**Validates: Requirements 16.3, 16.4**

---

### Property 12: Leaderboard Zero-Score Display

*For any* active squad with no associated score records, the leaderboard entry for that squad SHALL display `total_kills = 0`, `total_placement_points = 0`, and `total_points = 0`.

**Validates: Requirements 3.8**

---

### Property Reflection

After reviewing all 12 properties:

- Properties 1 and 3 both address score correctness. Property 3 (round-trip) subsumes the persistence aspect of Property 1, but Property 1 adds the non-negativity invariant and the `total_points = kills + placement_points` computed column check. They are complementary, not redundant — Property 1 tests the constraint, Property 3 tests the persistence. Both are retained.
- Properties 4, 5, and 6 address different failure modes of the same security/validation layer (missing auth, missing params, missing resource). They are distinct and non-redundant.
- Properties 7 and 8 both address squad mutation operations but test different operations (cancel vs. edit) with different expected outcomes. Both are retained.
- Property 9 (event completeness) is a meta-property that covers all socket events. It does not make Properties 7 and 8 redundant because those properties also verify the DB state change, not just the event emission.
- Properties 10 and 11 address different aspects of the API (response format vs. input validation). Both are retained.
- Property 12 is an edge case of the leaderboard that is not covered by Property 2 (which assumes squads have scores). It is retained.

No redundancies identified. All 12 properties provide unique validation value.

---

## Error Handling

### Bridge Server Error Responses

All error responses follow a consistent JSON envelope:

```json
{ "success": false, "error": "Human-readable description", "field": "optional_field_name" }
```

| Condition | HTTP Status | Example |
|---|---|---|
| Missing required field | 400 | `{ "error": "Missing required field: squad_id", "field": "squad_id" }` |
| Invalid field value | 400 | `{ "error": "kills must be a non-negative integer" }` |
| Resource not found | 404 | `{ "error": "Squad SSE-9999 not found" }` |
| Missing/invalid API key | 401 | `{ "error": "Unauthorized" }` |
| Internal server error | 500 | `{ "error": "Internal server error" }` |

### Bridge Server — Handler Errors

Bot handler functions (registration, matches, moderation) can throw or reject. The bridge route handlers wrap all handler calls in try/catch:

```javascript
try {
  await handler.someAction(...)
  emitter.emit(event, data)
  res.json({ success: true })
} catch (err) {
  logger.terminalLog('ERROR', `Bridge route error: ${err.message}`)
  res.status(500).json({ success: false, error: 'Internal server error' })
}
```

Discord API failures (DM delivery, role assignment) are non-fatal — the bot handlers already log and continue. The bridge route still returns 200 if the DB write succeeded.

### Dashboard — API Error Handling

The `lib/api.ts` client wraps all fetch calls:

```typescript
async function bridgePost<T>(path: string, body: unknown): Promise<ApiResponse<T> | ApiError>
// On network error: returns { success: false, error: 'Network error' }
// On non-2xx: parses JSON error body, returns ApiError
// On 401: triggers session refresh / redirect to login
```

Pages handle errors at the component level:
- **Initial load failure**: renders `<ErrorState message="..." onRetry={...} />` instead of the data list
- **Action failure**: shows a `ToastNotification` with `type='error'` and the error message
- **Form validation failure**: shows inline error text adjacent to the invalid field, does not close the form

### Dashboard — Socket.IO Reconnection

```typescript
// lib/socket.ts reconnection config
{
  reconnection: true,
  reconnectionDelay: 5000,      // 5 seconds between attempts
  reconnectionAttempts: Infinity // keep trying
}
```

The `SocketProvider` updates its status to `'reconnecting'` on disconnect, which causes `LiveBadge` to show the amber reconnecting state. All pages continue to function with stale data during disconnection; they reconcile when the connection is restored via a full re-fetch triggered by the `connect` event.

### Bot — `/update_score` Command Errors

```javascript
// commands/update_score.js error cases
if (kills < 0 || placement < 0) {
  return interaction.reply({ embeds: [buildErrorEmbed('Kills and placement must be ≥ 0')], ephemeral: true })
}
const squad = db.getSquadById(squadId)
if (!squad) {
  return interaction.reply({ embeds: [buildErrorEmbed(`Squad ${squadId} not found`)], ephemeral: true })
}
```

All error replies are ephemeral (visible only to the invoking admin).

### Graceful Shutdown

When the bot process receives SIGTERM or SIGINT:

```javascript
// index.js shutdown handler
process.on('SIGTERM', async () => {
  io.close()           // close all Socket.IO connections
  httpServer.close()   // stop accepting new HTTP connections
  db.closeDb()         // close SQLite connection
  await client.destroy() // disconnect Discord client
  process.exit(0)
})
```

---

## Testing Strategy

### Overview

The testing strategy uses a dual approach: example-based unit/integration tests for specific behaviors and edge cases, and property-based tests for universal correctness properties. The existing bot test suite (Jest + better-sqlite3 in-memory) is extended to cover the new bridge server and scoring system.

### Property-Based Testing

**Library**: [fast-check](https://github.com/dubzzz/fast-check) (JavaScript/TypeScript, integrates with Jest)

**Configuration**: Minimum 100 runs per property test (`{ numRuns: 100 }`).

**Tag format**: Each property test is tagged with a comment:
```javascript
// Feature: ss-esports-dashboard, Property N: <property_text>
```

#### Property Test Implementations

**Property 1 & 3 — Score Non-Negativity and Round-Trip**
```javascript
// Feature: ss-esports-dashboard, Property 1: Score Non-Negativity
// Feature: ss-esports-dashboard, Property 3: Score Round-Trip Persistence
it('score records preserve kills, placement, and total_points', () => {
  fc.assert(fc.property(
    fc.nat(),                    // kills >= 0
    fc.nat(),                    // placement_points >= 0
    fc.string({ minLength: 1 }), // squad_id (pre-inserted)
    (kills, placement, squadId) => {
      // pre-insert squad in in-memory DB
      const record = db.insertScore({ squad_id: squadId, kills, placement_points: placement, recorded_at: new Date().toISOString() })
      const fetched = db.getScoresBySquad(squadId).find(s => s.id === record.id)
      expect(fetched.kills).toBe(kills)
      expect(fetched.placement_points).toBe(placement)
      expect(fetched.total_points).toBe(kills + placement)
    }
  ), { numRuns: 100 })
})
```

**Property 2 — Leaderboard Ordering**
```javascript
// Feature: ss-esports-dashboard, Property 2: Leaderboard Ordering
it('leaderboard is always sorted by total_points DESC then total_kills DESC', () => {
  fc.assert(fc.property(
    fc.array(fc.record({ kills: fc.nat(), placement: fc.nat() }), { minLength: 2, maxLength: 20 }),
    (scoreInputs) => {
      // insert N squads with given scores into in-memory DB
      // call db.getLeaderboard()
      const leaderboard = db.getLeaderboard()
      for (let i = 0; i < leaderboard.length - 1; i++) {
        const a = leaderboard[i], b = leaderboard[i + 1]
        if (a.total_points === b.total_points) {
          expect(a.total_kills).toBeGreaterThanOrEqual(b.total_kills)
        } else {
          expect(a.total_points).toBeGreaterThan(b.total_points)
        }
      }
    }
  ), { numRuns: 100 })
})
```

**Property 4 — Auth Isolation**
```javascript
// Feature: ss-esports-dashboard, Property 4: Auth Isolation
it('all POST endpoints return 401 for any invalid Authorization header', () => {
  fc.assert(fc.property(
    fc.oneof(fc.constant(''), fc.constant('Bearer wrong-key'), fc.string()),
    fc.constantFrom('/api/cancel-squad', '/api/assign-match', '/api/warn-player', '/api/update-score', '/api/update-settings'),
    async (authHeader, endpoint) => {
      const res = await request(app).post(endpoint).set('Authorization', authHeader).send({})
      expect(res.status).toBe(401)
    }
  ), { numRuns: 100 })
})
```

**Property 5 — Invalid Parameter Rejection**
```javascript
// Feature: ss-esports-dashboard, Property 5: Invalid Parameter Rejection
it('POST endpoints return 400 for any request missing required fields', () => {
  fc.assert(fc.property(
    fc.record({ squad_id: fc.option(fc.string()), group_no: fc.option(fc.integer()) }),
    async (incompleteBody) => {
      // Test /api/assign-match which requires group_no, room_id, password
      const res = await request(app)
        .post('/api/assign-match')
        .set('Authorization', `Bearer ${VALID_KEY}`)
        .send(incompleteBody)
      if (!incompleteBody.group_no || !incompleteBody.room_id || !incompleteBody.password) {
        expect(res.status).toBe(400)
        expect(res.body.success).toBe(false)
        expect(res.body.error).toBeTruthy()
      }
    }
  ), { numRuns: 100 })
})
```

**Property 7 — Squad Cancellation Consistency**
```javascript
// Feature: ss-esports-dashboard, Property 7: Squad Cancellation Consistency
it('cancelling any active squad removes it from active squads and emits event', () => {
  fc.assert(fc.property(
    fc.string({ minLength: 4, maxLength: 8 }), // team name
    async (teamName) => {
      const squad = insertTestSquad(teamName)
      const emittedEvents = []
      emitter.on('squad:cancelled', (data) => emittedEvents.push(data))
      await request(app).post('/api/cancel-squad').set('Authorization', `Bearer ${VALID_KEY}`).send({ squad_id: squad.squad_id })
      const active = db.getAllActiveSquads()
      expect(active.find(s => s.squad_id === squad.squad_id)).toBeUndefined()
      expect(emittedEvents).toContainEqual({ squad_id: squad.squad_id })
    }
  ), { numRuns: 100 })
})
```

**Property 9 — Socket Event Completeness**
```javascript
// Feature: ss-esports-dashboard, Property 9: Socket Event Completeness
// Tested per-operation: for each state-changing operation, verify the corresponding event is emitted
// Combined with Properties 7 and 8 for squad operations
// Separate tests for match, score, settings operations
```

**Property 10 — GET Endpoint Response Envelope**
```javascript
// Feature: ss-esports-dashboard, Property 10: GET Endpoint Response Envelope
it('all GET endpoints return { success: true, data: Array } envelope', () => {
  fc.assert(fc.property(
    fc.constantFrom('/api/squads', '/api/groups', '/api/matches', '/api/scores', '/api/logs', '/api/settings'),
    async (endpoint) => {
      const res = await request(app).get(endpoint)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toBeDefined()
      expect(res.body.data).not.toBeNull()
    }
  ), { numRuns: 100 })
})
```

**Property 11 — Settings Validation**
```javascript
// Feature: ss-esports-dashboard, Property 11: Settings Validation — max_slots
it('update-settings rejects any non-positive-integer max_slots', () => {
  fc.assert(fc.property(
    fc.oneof(fc.integer({ max: 0 }), fc.float(), fc.string()),
    async (invalidMaxSlots) => {
      const res = await request(app)
        .post('/api/update-settings')
        .set('Authorization', `Bearer ${VALID_KEY}`)
        .send({ max_slots: invalidMaxSlots })
      expect(res.status).toBe(400)
    }
  ), { numRuns: 100 })
})
```

### Unit Tests (Example-Based)

Located in `bridge/routes/*.test.js` and `commands/update_score.test.js`:

- **Lock/unlock registration**: POST → DB setting changes, Discord embed posted
- **Broadcast**: POST with message → dmAllActivePlayers called with correct message
- **Assign/start match / declare winner**: POST → handler called, DB updated, event emitted
- **Warn/mute/unmute player**: POST → moderation handler called, DB updated
- **Clear reg chat**: POST → clearRegChat called
- **`/update_score` command**: valid input → score inserted, ephemeral confirm embed; negative kills → rejected; unknown squad → rejected
- **Settings defaults**: bridge server startup → missing settings keys initialized with defaults
- **Leaderboard zero-score**: squad with no scores → appears with all zeros (Property 12)

### Integration Tests

- **Discord OAuth2 flow**: mock Discord API, verify admin role check, session creation
- **Socket.IO concurrent connections**: 50 clients connect, one event emitted, all 50 receive it
- **Bridge server startup**: verify port 3001 is listening, DB path logged
- **CORS**: request from non-dashboard origin → rejected; from dashboard origin → accepted
- **Graceful shutdown**: SIGTERM → Socket.IO connections closed, DB closed

### Frontend Tests

- **Component snapshot tests**: GlassCard, LiveBadge, AnimatedCounter, SkeletonCard, LeaderboardRow (top 3 gold/silver/bronze treatment)
- **SquadRow search filter**: typing in search input filters list within 200ms
- **Score entry form validation**: negative kills/placement → validation error shown, submit prevented
- **MatchTimer**: starts counting from `started_at`, stops when `stopped=true`
- **SocketProvider**: disconnect event → status changes to 'disconnected'; reconnect → status changes to 'connected'

### Test Infrastructure

- **In-memory SQLite**: all bridge route tests use `db.initDb(':memory:')` for isolation
- **Supertest**: HTTP assertions against the Express app without starting a real server
- **Socket.IO mock**: `socket.io-mock` or manual event emitter for frontend socket tests
- **MSW (Mock Service Worker)**: mock bridge API responses in frontend component tests
- **fast-check**: property-based testing, minimum 100 runs per property
