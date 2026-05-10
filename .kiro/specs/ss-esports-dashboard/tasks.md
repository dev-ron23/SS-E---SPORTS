# Implementation Plan: SS E-Sports Tournament Dashboard

## Overview

This implementation plan covers the complete development of the SS E-Sports Tournament Dashboard, layered on top of the existing Discord bot. The implementation follows a strict bottom-up approach: database changes first, then the bridge server (emitter, Express app, all route modules), then bot handler updates and the new /update_score command, then the Next.js dashboard project setup, design system, real-time infrastructure, authentication, API client, all eight pages, and finally integration wiring. The stack is Node.js + better-sqlite3 + Socket.IO on the bot side, and Next.js 14 App Router + TypeScript + TailwindCSS + Framer Motion + shadcn/ui + socket.io-client + next-auth + fast-check on the dashboard side.

## Tasks

- [x] 1. Database layer — scores table and new db.js functions
  - [x] 1.1 Add scores table to database/schema.sql
    - Add `CREATE TABLE IF NOT EXISTS scores` with columns: id (INTEGER PK AUTOINCREMENT), squad_id (TEXT NOT NULL, FK to squads), match_id (TEXT, FK to matches), kills (INTEGER DEFAULT 0), placement_points (INTEGER DEFAULT 0), total_points (INTEGER GENERATED ALWAYS AS (kills + placement_points) VIRTUAL), recorded_at (TEXT NOT NULL)
    - _Requirements: 3.1_

  - [x] 1.2 Add score CRUD functions to database/db.js
    - Implement `insertScore({ squad_id, match_id, kills, placement_points, recorded_at })` — validates kills >= 0 and placement_points >= 0 before inserting, returns the full inserted record including computed total_points
    - Implement `getScoresBySquad(squadId)` — returns all ScoreRecord rows for a given squad_id
    - Implement `getAllScores()` — returns all rows from the scores table
    - Implement `getLeaderboard()` — executes the aggregation SQL (LEFT JOIN squads + scores, GROUP BY squad_id, ORDER BY total_points DESC then total_kills DESC), assigns 1-based rank in JavaScript, returns LeaderboardEntry[]
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.8_

  - [x] 1.3 Write property test for score non-negativity and round-trip persistence
    - **Property 1: Score Non-Negativity**
    - **Property 3: Score Round-Trip Persistence**
    - **Validates: Requirements 3.1, 3.2, 15.2, 15.5**
    - Use fast-check `fc.nat()` for kills and placement_points (guarantees >= 0), insert via `db.insertScore()`, fetch via `db.getScoresBySquad()`, assert kills, placement_points, and total_points all match; run with `{ numRuns: 100 }`

  - [x] 1.4 Write property test for leaderboard ordering
    - **Property 2: Leaderboard Ordering**
    - **Validates: Requirements 3.4, 3.5**
    - Use fast-check to generate arrays of `{ kills: fc.nat(), placement: fc.nat() }` (minLength 2, maxLength 20), insert N squads with those scores into an in-memory DB, call `db.getLeaderboard()`, assert for every adjacent pair A/B: if total_points(A) > total_points(B) then rank(A) < rank(B); if equal points then total_kills(A) >= total_kills(B); run with `{ numRuns: 100 }`

  - [x] 1.5 Write property test for leaderboard zero-score display
    - **Property 12: Leaderboard Zero-Score Display**
    - **Validates: Requirements 3.8**
    - Insert active squads with no score records, call `db.getLeaderboard()`, assert every entry has total_kills = 0, total_placement_points = 0, total_points = 0

- [x] 2. Bridge server — emitter singleton and Express app
  - [x] 2.1 Create bridge/emitter.js — Socket.IO singleton
    - Implement `setIo(io)`, `emit(event, data)`, `getIo()` functions
    - `emit()` silently no-ops if io is not yet initialized (safe to call during bot startup)
    - Export all three functions
    - _Requirements: 2.1-2.12_

  - [x] 2.2 Create bridge/server.js — Express + Socket.IO server
    - Initialize Express app with cors (origin from DASHBOARD_ORIGIN env var) and express.json() middleware
    - Implement `apiKeyAuth` middleware that validates `Authorization: Bearer <DASHBOARD_API_KEY>` header, returns 401 if missing or invalid
    - Attach Socket.IO to the HTTP server
    - Call `emitter.setIo(io)` after Socket.IO is initialized
    - Register all route modules (squads, matches, scores, moderation, settings, broadcast, logs)
    - Implement `startBridgeServer(discordClient, guild)` that starts listening on process.env.PORT (default 3001) and returns `{ httpServer, io }`
    - Log startup port and DB path to terminal on initialization
    - _Requirements: 1.1, 1.16, 17.1, 17.2, 17.7, 18.3, 18.5_

  - [x] 2.3 Write property test for auth isolation
    - **Property 4: Auth Isolation — Unauthorized Requests Rejected**
    - **Validates: Requirements 1.16, 17.1, 17.2**
    - Use fast-check `fc.oneof(fc.constant(''), fc.constant('Bearer wrong-key'), fc.string())` for auth header, test against all POST endpoints, assert HTTP 401 and zero DB writes; run with `{ numRuns: 100 }`

- [x] 3. Bridge server — REST route modules
  - [x] 3.1 Create bridge/routes/squads.js
    - GET /api/squads — calls db.getAllSquads(), returns { success: true, data: Squad[] }
    - POST /api/cancel-squad — validates squad_id present and squad exists (404 if not), calls cancellation logic, emits squad:cancelled, returns { success: true }
    - POST /api/edit-squad — validates squad_id and at least one update field, calls db.updateSquad(), emits squad:updated, returns { success: true, data: updatedSquad }
    - _Requirements: 1.4, 1.5, 2.2, 2.3, 14.1_

  - [x] 3.2 Create bridge/routes/matches.js
    - GET /api/matches — returns all matches
    - GET /api/groups — returns all groups
    - POST /api/assign-match — validates group_no, room_id, password; calls matches.assignMatch(); emits match:assigned
    - POST /api/start-match — validates group_no; calls matches.startMatch(); emits match:started
    - POST /api/declare-winner — validates squad_id and position; calls matches.declareWinner(); emits match:winner
    - _Requirements: 1.7, 1.8, 1.9, 2.4, 2.5, 2.6, 14.1_

  - [x] 3.3 Create bridge/routes/scores.js
    - GET /api/scores — returns all score records with aggregated totals per squad
    - POST /api/update-score — validates squad_id exists, kills >= 0, placement >= 0; calls db.insertScore(); emits score:updated
    - _Requirements: 3.1, 3.2, 3.3, 2.11, 14.1_

  - [x] 3.4 Create bridge/routes/moderation.js
    - POST /api/warn-player — validates discord_id and reason; calls moderation.warnPlayer(); emits player:warned
    - POST /api/mute-player — validates discord_id; calls moderation.mutePlayer(); emits player:muted { is_muted: true }
    - POST /api/unmute-player — validates discord_id; calls moderation.unmutePlayer(); emits player:muted { is_muted: false }
    - _Requirements: 1.10, 1.11, 1.12, 2.7, 2.8_

  - [x] 3.5 Create bridge/routes/settings.js
    - GET /api/settings — returns all tournament settings as object
    - POST /api/update-settings — validates max_slots is positive integer if provided; calls db.setSetting() for each key; emits settings:updated
    - POST /api/lock-registration — sets registration_locked=1, posts lock embed to Discord; emits registration:status { locked: true }
    - POST /api/unlock-registration — sets registration_locked=0, posts unlock embed; emits registration:status { locked: false }
    - _Requirements: 1.2, 1.3, 2.9, 12.1-12.6, 16.1-16.4_

  - [x] 3.6 Create bridge/routes/broadcast.js
    - POST /api/broadcast — validates message is non-empty string; calls dmEngine.dmAllPlayers(); returns { success: true, data: { sent } }
    - POST /api/clear-reg-chat — calls moderation.clearRegChat(); returns { success: true, data: { deleted } }
    - _Requirements: 1.6, 1.13_

  - [x] 3.7 Create bridge/routes/logs.js
    - GET /api/logs — supports query params: limit (default 200), action, actor_id, target_id, from, to; returns filtered action logs
    - _Requirements: 11.1-11.6, 14.1_

  - [x] 3.8 Write property test for invalid parameter rejection
    - **Property 5: Invalid Parameter Rejection**
    - **Validates: Requirements 1.14**
    - Use fast-check to generate incomplete request bodies for each POST endpoint, assert HTTP 400 with { success: false, error: string }; run with { numRuns: 100 }

  - [x] 3.9 Write property test for non-existent resource rejection
    - **Property 6: Non-Existent Resource Rejection**
    - **Validates: Requirements 1.15**
    - Use fast-check to generate random squad_id and discord_id strings that don't exist in DB, test cancel-squad, edit-squad, declare-winner, warn-player, mute-player, assert HTTP 404; run with { numRuns: 100 }

  - [x] 3.10 Write property test for GET endpoint response envelope
    - **Property 10: GET Endpoint Response Envelope**
    - **Validates: Requirements 14.1, 14.3**
    - Test all 6 GET endpoints, assert { success: true, data: defined and not null }; run with { numRuns: 100 }

  - [x] 3.11 Write property test for settings validation
    - **Property 11: Settings Validation — max_slots**
    - **Validates: Requirements 16.3, 16.4**
    - Use fast-check to generate non-positive-integer max_slots values (negative ints, floats, strings), assert HTTP 400; run with { numRuns: 100 }

  - [x] 3.12 Write property test for squad cancellation consistency
    - **Property 7: Squad Cancellation Consistency**
    - **Validates: Requirements 1.4, 2.2**
    - Insert random active squads, call POST /api/cancel-squad, assert squad not in getAllActiveSquads() and squad:cancelled event emitted; run with { numRuns: 100 }

  - [x] 3.13 Write property test for squad edit persistence
    - **Property 8: Squad Edit Persistence**
    - **Validates: Requirements 1.5, 2.3**
    - Insert squad, call POST /api/edit-squad with random valid updates, assert DB reflects exactly the provided updates and squad:updated event emitted; run with { numRuns: 100 }

- [x] 4. Bot handler updates — emit Socket.IO events
  - [x] 4.1 Update handlers/registration.js to emit events
    - After confirmRegistration DB write: call emitter.emit('squad:registered', squad)
    - After cancellation DB write: call emitter.emit('squad:cancelled', { squad_id })
    - After edit confirmation DB write: call emitter.emit('squad:updated', updatedSquad)
    - After registration lock/unlock: call emitter.emit('registration:status', { locked })
    - _Requirements: 2.1, 2.2, 2.3, 2.9_

  - [x] 4.2 Update handlers/matches.js to emit events
    - After assignMatch DB write: call emitter.emit('match:assigned', { group_no, room_id, password })
    - After startMatch DB write: call emitter.emit('match:started', { group_no, started_at })
    - After declareWinner DB write: call emitter.emit('match:winner', { squad_id, team_name, position })
    - _Requirements: 2.4, 2.5, 2.6_

  - [x] 4.3 Update handlers/moderation.js to emit events
    - After warnPlayer DB write: call emitter.emit('player:warned', { discord_id, squad_id, warnings })
    - After mutePlayer DB write: call emitter.emit('player:muted', { discord_id, is_muted: true })
    - After unmutePlayer DB write: call emitter.emit('player:muted', { discord_id, is_muted: false })
    - _Requirements: 2.7, 2.8_

  - [x] 4.4 Update utils/logger.js to emit audit log events
    - After insertActionLog DB write: call emitter.emit('audit:log', logEntry)
    - _Requirements: 2.10_

  - [x] 4.5 Write property test for socket event completeness
    - **Property 9: Socket Event Completeness**
    - **Validates: Requirements 2.1-2.11**
    - For each state-changing operation (register, cancel, edit, assign match, start match, declare winner, warn, mute, unmute, score update), verify the corresponding Socket.IO event is emitted with correct payload in the same tick as the DB write; run with { numRuns: 100 }

- [x] 5. New /update_score bot command
  - [x] 5.1 Create commands/update_score.js
    - SlashCommandBuilder with options: squad_id (STRING required), kills (INTEGER required), placement (INTEGER required)
    - Validate kills >= 0 and placement >= 0, reply ephemeral error if invalid
    - Validate squad exists in DB, reply ephemeral error if not found
    - Call db.insertScore({ squad_id, kills, placement_points: placement, recorded_at })
    - Call emitter.emit('score:updated', scoreRecord)
    - Reply ephemeral embed confirming squad name, kills, placement points, total points
    - _Requirements: 15.1-15.6, 3.9_

  - [x] 5.2 Register /update_score in index.js command loader
    - The command file will be auto-loaded by the existing commands/ directory scanner in index.js
    - Run $sync to register with Discord REST API
    - _Requirements: 15.1_

- [x] 6. Update index.js to start bridge server
  - [x] 6.1 Import and start bridge server after Discord client login
    - After client.login() resolves and 'ready' event fires, call startBridgeServer(client, guild)
    - Store returned { httpServer, io } for graceful shutdown
    - Add SIGTERM/SIGINT handlers: io.close(), httpServer.close(), db.closeDb(), client.destroy()
    - _Requirements: 18.1, 18.6_

- [x] 7. Checkpoint — Bridge server and bot updates complete
  - Run all existing bot tests plus new bridge/PBT tests
  - Verify bridge server starts on port 3001
  - Verify Socket.IO events emit correctly
  - Ensure all tests pass, ask the user if questions arise

- [x] 8. Dashboard project setup
  - [x] 8.1 Initialize Next.js 14 project
    - Create ss-esports-dashboard/ directory with `npx create-next-app@latest ss-esports-dashboard --typescript --tailwind --eslint --app --src-dir=false --import-alias='@/*'`
    - _Requirements: 18.2_

  - [x] 8.2 Install dashboard dependencies
    - Install: socket.io-client, next-auth, framer-motion, @shadcn/ui, recharts, fast-check
    - Install shadcn/ui components: button, card, dialog, input, badge, toast, skeleton, dropdown-menu, table, tabs
    - _Requirements: 13.1-13.10_

  - [x] 8.3 Configure Tailwind and global CSS
    - Add Orbitron and Inter fonts via next/font
    - Define CSS variables: --glass-bg, --glass-border, --glass-blur, --neon-blue, --neon-purple, --neon-green, --base-bg
    - Set base background to #0a0a0f in globals.css
    - Add glass card utility classes and pulse animation keyframes
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.6_

  - [x] 8.4 Create environment configuration
    - Create .env.local with: NEXT_PUBLIC_BRIDGE_URL, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI, NEXTAUTH_SECRET, BRIDGE_API_KEY (server-side only)
    - Create .env.example with placeholder values
    - _Requirements: 18.4_

- [x] 9. Design system — Liquid Glass components
  - [x] 9.1 Create components/glass/GlassCard.tsx
    - Props: children, className?, glow? ('blue'|'purple'|'green'|'none'), animate? (boolean)
    - Apply: backdrop-filter blur(20px), rgba(255,255,255,0.05) background, 1px rgba(255,255,255,0.1) border, 16px border-radius
    - Glow variants: blue = box-shadow 0 0 20px rgba(0,212,255,0.3), purple = rgba(139,92,246,0.3), green = rgba(0,255,127,0.3)
    - When animate=true: Framer Motion fade + slide-up entry animation
    - _Requirements: 13.2, 13.5, 13.7_

  - [x] 9.2 Create components/glass/GlassButton.tsx
    - Variants: primary (neon blue), secondary (purple), danger (red), ghost
    - Hover: brightness increase + subtle glow
    - Active: scale(0.97) press effect via Framer Motion
    - _Requirements: 13.2, 13.5_

  - [x] 9.3 Create components/glass/GlassBadge.tsx
    - Variants: active (green), pending (amber), live (blue pulsing), cancelled (red), group (hue-rotated per group number)
    - _Requirements: 13.2, 13.6_

  - [x] 9.4 Create components/shared/AnimatedCounter.tsx
    - Props: value (number), duration? (ms, default 600), className?
    - Use Framer Motion useMotionValue + animate to roll from previous to new value
    - _Requirements: 13.5, 5.5, 5.6_

  - [x] 9.5 Create components/shared/SkeletonCard.tsx
    - Props: rows? (default 3), height? (default 'h-32')
    - CSS shimmer animation: background gradient sweep left-to-right
    - _Requirements: 13.9_

  - [x] 9.6 Create components/shared/ToastNotification.tsx and useToast hook
    - Toast interface: { id, type: 'success'|'error'|'info', message, duration? }
    - Framer Motion AnimatePresence for slide-in from right, fade-out
    - Fixed bottom-right positioning, auto-dismiss after duration (default 4000ms)
    - _Requirements: 8.5, 8.6, 10.5, 10.6_

  - [x] 9.7 Create components/shared/ConfirmDialog.tsx
    - Props: open, title, description, onConfirm, onCancel, destructive?
    - shadcn/ui Dialog base with Framer Motion scale + fade animation
    - Destructive=true: red confirm button
    - _Requirements: 6.8, 8.3, 10.8_

  - [x] 9.8 Create components/shared/ErrorState.tsx
    - Props: message, onRetry
    - Glass card with red glow, error icon, retry button
    - _Requirements: 14.4_

  - [x] 9.9 Create components/layout/Sidebar.tsx
    - Navigation links: Overview, Squads, Groups, Matches, Leaderboard, Admin, Logs, Settings
    - Active state: neon blue left border + text glow
    - Bottom: admin avatar (from session), logout button
    - Collapses to MobileTabBar on screens < 768px
    - _Requirements: 13.8_

  - [x] 9.10 Create components/layout/TopBar.tsx
    - Shows tournament name (from settings), LiveBadge, admin avatar
    - _Requirements: 5.7_

  - [x] 9.11 Create components/layout/MobileTabBar.tsx
    - Bottom tab bar for mobile (< 768px)
    - Icons + labels for all 8 pages
    - _Requirements: 13.8_

- [x] 10. Socket.IO client and real-time infrastructure
  - [x] 10.1 Create lib/socket.ts — Socket.IO client singleton
    - Connect to NEXT_PUBLIC_BRIDGE_URL
    - Reconnection: enabled, delay 5000ms, attempts Infinity
    - Export: socket instance, connectSocket(), disconnectSocket()
    - _Requirements: 5.8, 2.12_

  - [x] 10.2 Create components/live/SocketProvider.tsx
    - React context with status: 'connected'|'disconnected'|'reconnecting'
    - On mount: connectSocket(); on unmount: disconnectSocket()
    - Listen to connect, disconnect, connect_error events
    - Export: SocketProvider component, useSocketStatus() hook
    - _Requirements: 5.7, 5.8_

  - [x] 10.3 Create components/live/LiveBadge.tsx
    - Reads useSocketStatus()
    - Connected: pulsing green dot + "LIVE" text with CSS keyframe glow
    - Disconnected: static red dot + "DISCONNECTED"
    - Reconnecting: amber dot + "RECONNECTING..."
    - _Requirements: 5.7, 13.6_

- [x] 11. Authentication — Discord OAuth2
  - [x] 11.1 Create lib/auth.ts — NextAuth configuration
    - Discord OAuth2 provider with scopes: identify, guilds, guilds.members.read
    - signIn callback: fetch guild member, check for Administrator permission in GUILD_ID, deny if not admin
    - jwt callback: store discord access token + isAdmin flag
    - session callback: expose { user: { id, name, image, isAdmin } }
    - Session strategy: jwt, maxAge: 86400
    - Pages: signIn: '/login', error: '/denied'
    - _Requirements: 4.1-4.8_

  - [x] 11.2 Create app/api/auth/[...nextauth]/route.ts
    - Export GET and POST handlers from NextAuth
    - _Requirements: 4.1_

  - [x] 11.3 Create app/login/page.tsx
    - Liquid Glass card centered on dark background
    - Discord OAuth2 login button with Discord logo
    - Framer Motion fade-in animation
    - _Requirements: 4.1, 13.1-13.5_

  - [x] 11.4 Create app/denied/page.tsx
    - Access denied page for non-admin users
    - Shows user's Discord avatar and "You don't have admin access" message
    - _Requirements: 4.3_

  - [x] 11.5 Create middleware.ts — route protection
    - Protect all routes except /login and /denied
    - Redirect unauthenticated users to /login
    - _Requirements: 4.7_

- [x] 12. API client and Next.js proxy route
  - [x] 12.1 Create app/api/bridge/[...path]/route.ts — proxy to bridge server
    - Handle GET and POST for all /api/bridge/* paths
    - Strip /api/bridge prefix, forward to NEXT_PUBLIC_BRIDGE_URL
    - Inject Authorization: Bearer BRIDGE_API_KEY header (server-side env var, never exposed to browser)
    - Stream response body back to browser
    - _Requirements: 17.3, 1.16_

  - [x] 12.2 Create lib/api.ts — bridge API client
    - `bridgeGet<T>(path)` — fetches /api/bridge/{path}, returns ApiResponse<T> | ApiError
    - `bridgePost<T>(path, body)` — posts to /api/bridge/{path}, returns ApiResponse<T> | ApiError
    - On network error: returns { success: false, error: 'Network error' }
    - On 401: triggers session refresh
    - _Requirements: 14.2, 14.4_

  - [x] 12.3 Create types/index.ts — shared TypeScript types
    - Define all interfaces: Squad, Player, Group, Match, ScoreRecord, ActionLog, TournamentSettings, LeaderboardEntry, SocketEvents, ApiResponse, ApiError
    - _Requirements: All_

- [x] 13. Dashboard pages
  - [x] 13.1 Create app/layout.tsx — root layout
    - Wrap with SessionProvider, SocketProvider
    - Include Sidebar, TopBar
    - Framer Motion AnimatePresence for page transitions
    - _Requirements: 13.10_

  - [x] 13.2 Create app/page.tsx — Home / Overview page
    - Fetch /api/bridge/settings and /api/bridge/logs on load, show SkeletonCard while loading
    - Tournament status GlassCard: name, registration status badge, squad count, group count
    - AnimatedCounter cards: total squads, active matches, total groups, total players
    - Live activity feed: 20 most recent logs, prepend new entries on audit:log socket event
    - Socket.IO listeners: squad:registered, squad:cancelled, registration:status → update counters
    - _Requirements: 5.1-5.8_

  - [x] 13.3 Create app/squads/page.tsx — Squads page
    - Fetch /api/bridge/squads on load, show SkeletonCard while loading
    - Paginated list (20 per page) with search input (debounced 200ms) and status/group filters
    - SquadRow component: squad ID, team name, leader mention, player count, group badge, status dot
    - SquadDetailPanel: slide-in from right, shows all players with UIDs/warnings/mute, Cancel and Edit actions with ConfirmDialog
    - Socket.IO listeners: squad:registered (prepend), squad:cancelled (update status), squad:updated (update row)
    - _Requirements: 6.1-6.10_

  - [x] 13.4 Create app/groups/page.tsx — Groups page
    - Fetch /api/bridge/groups and /api/bridge/squads on load
    - Grid of GroupCard components, one per group
    - GroupCard: group number, squad list, match status badge, room ID (if assigned), start time (if started), winner (if declared)
    - Glow='blue' on cards with active matches
    - Socket.IO listeners: match:assigned, match:started, match:winner, squad:registered, squad:cancelled → update affected group card
    - _Requirements: 7.1-7.6_

  - [x] 13.5 Create app/matches/page.tsx — Match Center page
    - Fetch /api/bridge/groups on load
    - List of groups with current match state
    - Per-group: Assign Room form (room_id + password inputs + submit), Start Match button (with confirm), Declare Winner form (squad selector + position input)
    - MatchTimer component: counts up from match_started_at, stops on winner declared
    - Success/error ToastNotification on all actions
    - Socket.IO listeners: match:assigned, match:started, match:winner → update group state
    - _Requirements: 8.1-8.8_

  - [x] 13.6 Create app/leaderboard/page.tsx — Leaderboard page
    - Fetch /api/bridge/scores on load (includes aggregated leaderboard data)
    - Ranked table: rank, squad ID, team name, total kills, total placement, total points
    - Top 3: gold/silver/bronze visual treatment with glow
    - Framer Motion layout animation on rank changes when score:updated received
    - Expandable rows: per-match score breakdown
    - Score entry form: squad_id input, kills input, placement input, submit → POST /api/bridge/update-score
    - Client-side validation: kills and placement >= 0
    - Socket.IO listener: score:updated → re-sort and re-render leaderboard
    - _Requirements: 9.1-9.7_

  - [x] 13.7 Create app/admin/page.tsx — Admin Panel page
    - Lock/Unlock Registration buttons with current status indicator
    - Broadcast Message form: textarea + send button → POST /api/bridge/broadcast
    - Player moderation section: search by Discord ID, show squad/warnings/mute status, Warn/Mute/Unmute buttons
    - Warn: reason input dialog before POST /api/bridge/warn-player
    - Mute/Unmute: confirmation dialog before POST
    - Clear Registration Chat button with confirmation dialog
    - Edit Tournament Settings form: name, prize pool, max slots, game mode → POST /api/bridge/update-settings
    - Socket.IO listener: registration:status → update lock/unlock button state
    - _Requirements: 10.1-10.10_

  - [x] 13.8 Create app/logs/page.tsx — Audit Logs page
    - Fetch /api/bridge/logs on load (limit 200)
    - Paginated table (50 per page): action type, actor ID, target ID, details, timestamp (local timezone)
    - Search input: filters by action type, actor ID, or target ID in real time
    - Date range filter: from/to date pickers
    - Action type filter dropdown: populated from distinct action types in loaded data
    - Socket.IO listener: audit:log → prepend to table if current filter matches
    - _Requirements: 11.1-11.6_

  - [x] 13.9 Create app/settings/page.tsx — Settings page
    - Fetch /api/bridge/settings on load
    - Form: tournament name, prize pool, max slots (integer), game mode
    - Client-side validation: max_slots must be positive integer, warn if less than current active squad count
    - Submit → POST /api/bridge/update-settings
    - Socket.IO listener: settings:updated → update displayed values
    - _Requirements: 12.1-12.6_

- [x] 14. Checkpoint — All dashboard pages complete
  - Verify all pages load with skeleton states
  - Verify Socket.IO connection shows LIVE badge
  - Verify bidirectional sync: bot action → dashboard update, dashboard action → Discord
  - Ensure all tests pass, ask the user if questions arise

- [x] 15. Integration and final wiring
  - [x] 15.1 Wire bridge server startup into bot index.js
    - Import startBridgeServer from bridge/server.js
    - Call after 'ready' event fires, pass client and guild
    - Add graceful shutdown handlers (SIGTERM, SIGINT)
    - _Requirements: 18.1, 18.6_

  - [x] 15.2 Initialize tournament settings defaults on bridge server start
    - On startup, check settings table for missing keys and insert defaults: tournament_name, prize_pool, max_slots, game_mode
    - _Requirements: 16.1, 16.2_

  - [x] 15.3 Write integration test for bidirectional sync — registration flow
    - Test: bot registers squad → squad:registered event emitted → dashboard GET /api/squads returns new squad
    - Test: dashboard POST /api/cancel-squad → squad:cancelled event emitted → squad status = 'cancelled' in DB

  - [x] 15.4 Write integration test for bidirectional sync — match flow
    - Test: dashboard POST /api/assign-match → match:assigned event emitted → DB updated → dashboard GET /api/groups returns room_id
    - Test: dashboard POST /api/start-match → match:started event emitted → DB match_started_at non-null
    - Test: dashboard POST /api/declare-winner → match:winner event emitted → squad winner_position stored

  - [x] 15.5 Write integration test for scoring and leaderboard
    - Test: POST /api/update-score → score:updated event emitted → GET /api/scores returns updated leaderboard
    - Test: multiple squads with scores → leaderboard ordering correct

  - [x] 15.6 Write integration test for Socket.IO concurrent connections
    - Test: 50 clients connect → one event emitted → all 50 receive it
    - _Requirements: 2.12_

- [x] 16. Final checkpoint — All tests pass
  - Run full bot test suite (node --test in ss-esports-bot/)
  - Run dashboard test suite (npm test in ss-esports-dashboard/)
  - Verify all property tests pass (fast-check, 100 runs each)
  - Verify bridge server starts and Socket.IO connects
  - Ensure all tests pass, ask the user if questions arise

## Notes

- Tasks marked with `*` are optional property-based tests — implement if time allows, they validate universal correctness
- The bridge server runs in the same Node.js process as the bot — no separate deployment needed
- The dashboard is a separate Next.js project in ss-esports-dashboard/ directory
- Both projects share the same SQLite database file via the DB_PATH environment variable
- The BRIDGE_API_KEY is only ever present in server-side Next.js API routes — never in the browser bundle
- Socket.IO events are emitted synchronously after every DB write in the bot handlers
- All dashboard pages use optimistic UI: render from REST fetch on load, then apply incremental socket events
- The Liquid Glass design system is defined once in components/glass/ and reused across all pages
- Framer Motion AnimatePresence handles all page transitions and component mount/unmount animations

