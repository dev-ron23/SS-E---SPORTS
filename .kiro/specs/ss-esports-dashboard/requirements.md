# Requirements Document

## Introduction

The SS E-Sports Tournament Dashboard is a live, bidirectional web dashboard that connects to the existing SS E-Sports Tournament Discord bot. It provides a premium, real-time interface for tournament administrators to monitor and control every aspect of a Free Fire tournament — from squad registration through match management to leaderboard rankings — without leaving the browser. The dashboard reads from and writes to the same SQLite database the bot uses, and communicates with the bot process over a local Socket.IO + REST bridge so that every action taken on the dashboard is reflected in Discord, and every action taken in Discord is reflected on the dashboard instantly.

This is a new feature layered on top of the already-built bot. It introduces a scoring/leaderboard system that does not currently exist in the bot, a local REST API the bot exposes for the dashboard to call, and a Next.js 14 frontend with an Apple Liquid Glass aesthetic.

---

## Glossary

- **Dashboard**: The Next.js 14 web application that provides the live tournament management interface.
- **Bot**: The existing SS E-Sports Tournament Discord bot (discord.js v14, better-sqlite3).
- **Bridge_Server**: The Express.js + Socket.IO server that runs in the same process as the Bot, exposing a REST API on port 3001 and emitting real-time events to connected Dashboard clients.
- **Socket_Client**: The Socket.IO client running inside the Dashboard frontend that receives real-time push events from the Bridge_Server.
- **Auth_Provider**: The Discord OAuth2 authentication provider used to verify that only authorized Discord server admins can access admin features.
- **Score_Record**: A database record storing kills, placement points, and total points for a squad in a specific match.
- **Leaderboard**: The ranked list of squads ordered by total tournament points (kills + placement).
- **Squad**: A registered team of 2–5 players identified by a squad ID in the format SSE-XXXX.
- **Group**: A collection of up to 12 squads assigned to the same match lobby.
- **Match**: A single game session for a group, identified by a room ID and password.
- **Action_Log**: A record of every admin or bot action stored in the `action_logs` table.
- **Tournament_Settings**: Key-value configuration stored in the `settings` table covering tournament name, prize pool, max slots, game mode, and registration status.
- **Admin**: A Discord user who holds an administrator role in the SS E-Sports Discord server and has been authenticated via Discord OAuth2.
- **Liquid_Glass_UI**: The Apple-inspired glassmorphism design system used throughout the Dashboard, characterized by frosted glass cards, neon accent colors, and Framer Motion animations.

---

## Requirements

### Requirement 1: Bridge Server — REST API

**User Story:** As an admin, I want the bot to expose a local REST API so that the dashboard can trigger bot actions that execute in Discord.

#### Acceptance Criteria

1. THE Bridge_Server SHALL listen on port 3001 on localhost and accept HTTP requests from the Dashboard.
2. WHEN the Dashboard sends a POST request to `/api/lock-registration`, THE Bridge_Server SHALL set `registration_locked` to `1` in the `settings` table and post a lock embed to the Discord registration channel.
3. WHEN the Dashboard sends a POST request to `/api/unlock-registration`, THE Bridge_Server SHALL set `registration_locked` to `0` in the `settings` table and post an unlock embed to the Discord registration channel.
4. WHEN the Dashboard sends a POST request to `/api/cancel-squad` with a valid `squad_id`, THE Bridge_Server SHALL execute the same cancellation logic as the `/cancel_reg` slash command, including role removal, embed update, and DM notifications.
5. WHEN the Dashboard sends a POST request to `/api/edit-squad` with a valid `squad_id` and updated fields, THE Bridge_Server SHALL update the squad record in the database and post an edit-confirmed embed to the Discord confirmed-squads channel.
6. WHEN the Dashboard sends a POST request to `/api/broadcast` with a `message` string, THE Bridge_Server SHALL DM all active squad players using the existing DM engine.
7. WHEN the Dashboard sends a POST request to `/api/assign-match` with `group_no`, `room_id`, and `password`, THE Bridge_Server SHALL store the match credentials in the database and DM all players in that group.
8. WHEN the Dashboard sends a POST request to `/api/start-match` with a valid `group_no`, THE Bridge_Server SHALL record the match start timestamp and DM all group players.
9. WHEN the Dashboard sends a POST request to `/api/declare-winner` with `squad_id` and `position`, THE Bridge_Server SHALL update the squad winner position, update the match record, and post a winner embed to the group channel.
10. WHEN the Dashboard sends a POST request to `/api/warn-player` with `discord_id` and `reason`, THE Bridge_Server SHALL increment the player's warning count and DM the player.
11. WHEN the Dashboard sends a POST request to `/api/mute-player` with a valid `discord_id`, THE Bridge_Server SHALL apply a Discord timeout to the player and set `is_muted` to `1` in the database.
12. WHEN the Dashboard sends a POST request to `/api/unmute-player` with a valid `discord_id`, THE Bridge_Server SHALL remove the Discord timeout and set `is_muted` to `0` in the database.
13. WHEN the Dashboard sends a POST request to `/api/clear-reg-chat`, THE Bridge_Server SHALL bulk-delete messages in the registration channel.
14. IF a REST API request contains an invalid or missing required parameter, THEN THE Bridge_Server SHALL return HTTP 400 with a JSON error body describing the missing field.
15. IF a REST API request references a `squad_id` or `discord_id` that does not exist in the database, THEN THE Bridge_Server SHALL return HTTP 404 with a JSON error body.
16. THE Bridge_Server SHALL require a valid `Authorization` header containing a server-side API key on all POST endpoints to prevent unauthorized access from non-dashboard clients.

---

### Requirement 2: Bridge Server — Real-Time Event Emission

**User Story:** As an admin, I want the dashboard to update instantly when the bot processes any Discord event so that I always see the current tournament state without refreshing.

#### Acceptance Criteria

1. WHEN a squad is registered via Discord, THE Bridge_Server SHALL emit a `squad:registered` Socket.IO event containing the full squad object to all connected Dashboard clients.
2. WHEN a squad is cancelled via Discord or the dashboard, THE Bridge_Server SHALL emit a `squad:cancelled` Socket.IO event containing the `squad_id` to all connected Dashboard clients.
3. WHEN a squad is edited via Discord or the dashboard, THE Bridge_Server SHALL emit a `squad:updated` Socket.IO event containing the updated squad object to all connected Dashboard clients.
4. WHEN a match is assigned to a group, THE Bridge_Server SHALL emit a `match:assigned` Socket.IO event containing `group_no`, `room_id`, and `password` to all connected Dashboard clients.
5. WHEN a match is started for a group, THE Bridge_Server SHALL emit a `match:started` Socket.IO event containing `group_no` and `started_at` to all connected Dashboard clients.
6. WHEN a winner is declared, THE Bridge_Server SHALL emit a `match:winner` Socket.IO event containing `squad_id`, `team_name`, and `position` to all connected Dashboard clients.
7. WHEN a player is warned, THE Bridge_Server SHALL emit a `player:warned` Socket.IO event containing `discord_id`, `squad_id`, and `warnings` count to all connected Dashboard clients.
8. WHEN a player is muted, THE Bridge_Server SHALL emit a `player:muted` Socket.IO event containing `discord_id` and `is_muted` status to all connected Dashboard clients.
9. WHEN registration is locked or unlocked, THE Bridge_Server SHALL emit a `registration:status` Socket.IO event containing the new `locked` boolean to all connected Dashboard clients.
10. WHEN any admin action is logged, THE Bridge_Server SHALL emit an `audit:log` Socket.IO event containing the full action log entry to all connected Dashboard clients.
11. WHEN a score is updated via `/update_score` or the dashboard, THE Bridge_Server SHALL emit a `score:updated` Socket.IO event containing the updated Score_Record to all connected Dashboard clients.
12. THE Bridge_Server SHALL support at least 50 simultaneous Socket.IO connections without dropping events.

---

### Requirement 3: Scoring and Leaderboard System

**User Story:** As a tournament organizer, I want to record kill points and placement points per squad per match so that I can display a live leaderboard ranking all squads by total tournament points.

#### Acceptance Criteria

1. THE Bridge_Server SHALL expose a `scores` table in the database with columns: `id` (auto-increment PK), `squad_id` (FK to squads), `match_id` (FK to matches), `kills` (integer ≥ 0), `placement_points` (integer ≥ 0), `total_points` (integer, computed as `kills + placement_points`), and `recorded_at` (ISO timestamp).
2. WHEN the `/update_score` slash command is invoked with `squad_id`, `kills`, and `placement`, THE Bot SHALL insert or update a Score_Record for that squad and match in the `scores` table.
3. WHEN the `/update_score` command is invoked with a `kills` value less than 0 or a `placement` value less than 0, THE Bot SHALL reject the command and reply with an error message.
4. THE Leaderboard SHALL rank squads by the sum of all their `total_points` values across all matches, in descending order.
5. WHEN two squads have equal total points, THE Leaderboard SHALL rank the squad with more total kills higher.
6. THE Dashboard SHALL display the Leaderboard with squad rank, squad ID, team name, total kills, total placement points, and total points for each squad.
7. WHEN a Score_Record is inserted or updated, THE Bridge_Server SHALL emit a `score:updated` Socket.IO event so the Dashboard Leaderboard updates without a page refresh.
8. WHERE a squad has no Score_Records, THE Leaderboard SHALL display that squad with 0 kills, 0 placement points, and 0 total points.
9. THE Bot SHALL add a `/update_score` slash command with required options: `squad_id` (string), `kills` (integer), `placement` (integer).
10. WHEN the `/update_score` command is invoked with a `squad_id` that does not exist in the database, THE Bot SHALL reject the command and reply with an error message.

---

### Requirement 4: Discord OAuth2 Authentication

**User Story:** As a server admin, I want to log into the dashboard using my Discord account so that only authorized admins can access admin features.

#### Acceptance Criteria

1. THE Dashboard SHALL provide a Discord OAuth2 login flow using the `identify` and `guilds` scopes.
2. WHEN a user completes the OAuth2 flow, THE Auth_Provider SHALL verify that the user holds an administrator role in the SS E-Sports Discord server before granting admin access.
3. IF a user does not hold an administrator role in the SS E-Sports Discord server, THEN THE Dashboard SHALL display an "Access Denied" page and deny access to all admin features.
4. THE Dashboard SHALL store the authenticated session in a secure, HTTP-only cookie with a maximum age of 24 hours.
5. WHEN a session expires, THE Dashboard SHALL redirect the user to the login page.
6. THE Dashboard SHALL expose a `/api/auth/logout` endpoint that clears the session cookie and redirects to the login page.
7. WHILE a user is not authenticated, THE Dashboard SHALL display only the login page and redirect all other routes to the login page.
8. THE Auth_Provider SHALL use the Discord OAuth2 callback URL configured in the Discord developer portal and stored in the server environment variables.

---

### Requirement 5: Dashboard — Home / Overview Page

**User Story:** As an admin, I want a home page that shows the current tournament status at a glance so that I can quickly assess the state of the tournament.

#### Acceptance Criteria

1. THE Dashboard SHALL display a tournament status card showing the tournament name, current registration status (open/locked), total active squad count, and total group count.
2. WHEN the active squad count changes, THE Dashboard SHALL update the squad count display within 1 second without a page refresh.
3. THE Dashboard SHALL display a live activity feed showing the 20 most recent Action_Log entries, with each entry showing the action type, actor, target, and timestamp.
4. WHEN a new Action_Log entry is emitted via Socket.IO, THE Dashboard SHALL prepend it to the activity feed without a page refresh.
5. THE Dashboard SHALL display animated counters for: total registered squads, total active matches, total groups, and total players.
6. WHEN any counter value changes, THE Dashboard SHALL animate the counter from the old value to the new value using a smooth number transition.
7. THE Dashboard SHALL display a pulsing "LIVE" badge when the Socket.IO connection is active, and a "DISCONNECTED" badge with a warning color when the connection is lost.
8. WHEN the Socket.IO connection is lost, THE Dashboard SHALL automatically attempt to reconnect every 5 seconds.

---

### Requirement 6: Dashboard — Squads Page

**User Story:** As an admin, I want to view and manage all registered squads in a searchable, filterable list so that I can quickly find and act on any squad.

#### Acceptance Criteria

1. THE Dashboard SHALL display all squads in a paginated list with 20 squads per page, showing squad ID, team name, leader Discord tag, player count, group number, registration timestamp, and status.
2. THE Dashboard SHALL provide a search input that filters the squad list by team name or squad ID in real time as the admin types, with results updating within 200ms of the last keystroke.
3. THE Dashboard SHALL provide filter controls to show squads by status (all, active, cancelled) and by group number.
4. WHEN a `squad:registered` Socket.IO event is received, THE Dashboard SHALL add the new squad to the list without a page refresh.
5. WHEN a `squad:cancelled` Socket.IO event is received, THE Dashboard SHALL update the squad's status indicator in the list without a page refresh.
6. THE Dashboard SHALL display a group badge on each squad row using a distinct color per group number.
7. WHEN an admin clicks a squad row, THE Dashboard SHALL display a squad detail panel showing all player Discord IDs, game UIDs, warning counts, mute status, and the original registration message link.
8. THE Dashboard SHALL provide a "Cancel Squad" button in the squad detail panel that sends a POST to `/api/cancel-squad` and shows a confirmation dialog before executing.
9. THE Dashboard SHALL provide an "Edit Squad" form in the squad detail panel that allows editing team name, leader, and player list, and sends a POST to `/api/edit-squad` on submission.
10. IF the "Cancel Squad" or "Edit Squad" action returns an error from the Bridge_Server, THEN THE Dashboard SHALL display an inline error message without closing the detail panel.

---

### Requirement 7: Dashboard — Groups Page

**User Story:** As an admin, I want to see all groups with their squads and match status so that I can manage group-level operations from one view.

#### Acceptance Criteria

1. THE Dashboard SHALL display one card per group, showing the group number, list of squad names in that group, match room ID (if assigned), match status (pending / room assigned / in progress / completed), and match start time (if started).
2. WHEN a `match:assigned` Socket.IO event is received, THE Dashboard SHALL update the corresponding group card to show the room ID and password without a page refresh.
3. WHEN a `match:started` Socket.IO event is received, THE Dashboard SHALL update the corresponding group card to show "In Progress" status and the start timestamp without a page refresh.
4. WHEN a `match:winner` Socket.IO event is received, THE Dashboard SHALL update the corresponding group card to show the winning squad name and position without a page refresh.
5. THE Dashboard SHALL display the squad count per group and visually indicate when a group is full (12 squads).
6. WHEN a `squad:registered` or `squad:cancelled` event is received, THE Dashboard SHALL update the affected group card's squad list without a page refresh.

---

### Requirement 8: Dashboard — Match Center Page

**User Story:** As an admin, I want a dedicated match management page where I can assign rooms, start matches, and declare winners for any group from the dashboard.

#### Acceptance Criteria

1. THE Dashboard SHALL display a list of all groups with their current match state, allowing the admin to select any group to manage.
2. THE Dashboard SHALL provide an "Assign Room" form for each group with inputs for room ID and password, and a submit button that sends a POST to `/api/assign-match`.
3. THE Dashboard SHALL provide a "Start Match" button for each group that has an assigned room, which sends a POST to `/api/start-match` and requires a confirmation click.
4. THE Dashboard SHALL provide a "Declare Winner" form for each group with a squad selector and position input, which sends a POST to `/api/declare-winner`.
5. WHEN a match action succeeds, THE Dashboard SHALL display a success toast notification and update the group's match state card in real time.
6. IF a match action fails, THEN THE Dashboard SHALL display an error toast notification with the error message from the Bridge_Server.
7. THE Dashboard SHALL display a live timer for each group whose match has started, counting up from the `match_started_at` timestamp.
8. WHEN a `match:winner` Socket.IO event is received, THE Dashboard SHALL stop the live timer for that group and display the winner's name and position.

---

### Requirement 9: Dashboard — Leaderboard Page

**User Story:** As an admin, I want a live leaderboard showing all squads ranked by total tournament points so that I can track standings and share results.

#### Acceptance Criteria

1. THE Dashboard SHALL display the Leaderboard as a ranked table with columns: rank, squad ID, team name, total kills, total placement points, and total points.
2. THE Dashboard SHALL highlight the top 3 squads with distinct visual treatments: gold for rank 1, silver for rank 2, bronze for rank 3.
3. WHEN a `score:updated` Socket.IO event is received, THE Dashboard SHALL re-sort and re-render the Leaderboard without a page refresh, animating rows that change rank position.
4. THE Dashboard SHALL provide a per-squad score entry form accessible from the Leaderboard page, with inputs for squad ID, kills, and placement points, that sends a POST to `/api/update-score`.
5. IF the score entry form is submitted with a kills or placement value less than 0, THEN THE Dashboard SHALL display a validation error and prevent submission.
6. THE Dashboard SHALL display each squad's per-match score breakdown in an expandable row, showing kills, placement points, and total points per match.
7. THE Dashboard SHALL display the total number of squads on the leaderboard and the timestamp of the last score update.

---

### Requirement 10: Dashboard — Admin Panel Page

**User Story:** As an admin, I want a centralized admin panel where I can perform all tournament control actions without using Discord slash commands.

#### Acceptance Criteria

1. THE Dashboard SHALL provide a "Lock Registration" button that sends a POST to `/api/lock-registration` and updates the registration status indicator on the Overview page.
2. THE Dashboard SHALL provide an "Unlock Registration" button that sends a POST to `/api/unlock-registration` and updates the registration status indicator on the Overview page.
3. WHEN the registration status changes via Socket.IO, THE Dashboard SHALL update the Lock/Unlock button state to reflect the current status without a page refresh.
4. THE Dashboard SHALL provide a "Broadcast Message" form with a text input and send button that posts to `/api/broadcast`.
5. THE Dashboard SHALL provide a player moderation section with search-by-Discord-ID, showing the player's squad, warning count, and mute status, with "Warn", "Mute", and "Unmute" action buttons.
6. WHEN an admin clicks "Warn", THE Dashboard SHALL display a reason input dialog before sending a POST to `/api/warn-player`.
7. WHEN an admin clicks "Mute" or "Unmute", THE Dashboard SHALL send a POST to `/api/mute-player` or `/api/unmute-player` respectively, with a confirmation dialog.
8. THE Dashboard SHALL provide a "Clear Registration Chat" button that sends a POST to `/api/clear-reg-chat` and requires a confirmation dialog before executing.
9. IF any admin panel action returns an error, THEN THE Dashboard SHALL display an inline error message adjacent to the triggering control.
10. THE Dashboard SHALL display the current tournament settings (name, prize pool, max slots, game mode) and provide an "Edit Settings" form that sends a POST to `/api/update-settings`.

---

### Requirement 11: Dashboard — Audit Logs Page

**User Story:** As an admin, I want a searchable, filterable audit log so that I can review every action taken in the tournament.

#### Acceptance Criteria

1. THE Dashboard SHALL display all Action_Log entries in a paginated table with 50 entries per page, showing action type, actor Discord ID, target ID, details, and timestamp.
2. THE Dashboard SHALL provide a search input that filters log entries by action type, actor ID, or target ID in real time.
3. THE Dashboard SHALL provide a date-range filter that limits displayed entries to a specified start and end date.
4. THE Dashboard SHALL provide an action-type filter dropdown populated with all distinct action types present in the `action_logs` table.
5. WHEN an `audit:log` Socket.IO event is received, THE Dashboard SHALL prepend the new entry to the log table if the current filter matches, without a page refresh.
6. THE Dashboard SHALL display timestamps in the admin's local timezone, converted from the UTC ISO timestamps stored in the database.

---

### Requirement 12: Dashboard — Settings Page

**User Story:** As an admin, I want a settings page where I can configure tournament-wide parameters so that the bot and dashboard reflect the correct tournament context.

#### Acceptance Criteria

1. THE Dashboard SHALL display a settings form with fields for: tournament name (text), prize pool (text), max squad slots (integer), and game mode (text).
2. WHEN the admin submits the settings form, THE Dashboard SHALL send a POST to `/api/update-settings` with the updated values.
3. WHEN the Bridge_Server receives a POST to `/api/update-settings`, THE Bridge_Server SHALL update the corresponding keys in the `settings` table and emit a `settings:updated` Socket.IO event.
4. WHEN a `settings:updated` Socket.IO event is received, THE Dashboard SHALL update the displayed settings values without a page refresh.
5. IF the max squad slots field is set to a value less than the current active squad count, THEN THE Dashboard SHALL display a validation warning before allowing submission.
6. THE Dashboard SHALL display the current values of all settings fields on page load, fetched from the Bridge_Server's `/api/settings` GET endpoint.

---

### Requirement 13: Dashboard — Liquid Glass UI/UX

**User Story:** As a tournament organizer, I want the dashboard to look and feel like a premium esports platform so that it reflects the professional quality of the SS E-Sports brand.

#### Acceptance Criteria

1. THE Dashboard SHALL use a base background color of `#0a0a0f` for all pages.
2. THE Dashboard SHALL render all content cards using glassmorphism styling: `backdrop-filter: blur(20px)`, semi-transparent background (`rgba(255,255,255,0.05)` to `rgba(255,255,255,0.1)`), and a 1px border with `rgba(255,255,255,0.1)`.
3. THE Dashboard SHALL use neon accent colors: electric blue (`#00d4ff`) for primary actions, purple (`#8b5cf6`) for secondary elements, and green (`#00ff7f`) for success states.
4. THE Dashboard SHALL use the Orbitron font for all headings and the Inter font for all body text.
5. THE Dashboard SHALL apply Framer Motion animations to all state changes: card entry (fade + slide up), counter updates (number roll), row additions (slide in from left), and modal open/close (scale + fade).
6. THE Dashboard SHALL display a pulsing animated "LIVE" badge using a CSS keyframe animation with a green glow effect when the Socket.IO connection is active.
7. THE Dashboard SHALL apply a glowing border effect (`box-shadow: 0 0 20px rgba(0,212,255,0.3)`) to cards representing active matches.
8. THE Dashboard SHALL be fully responsive, with a mobile-first layout that collapses the sidebar navigation into a bottom tab bar on screens narrower than 768px.
9. THE Dashboard SHALL display loading skeleton screens (animated shimmer placeholders) while data is being fetched on initial page load.
10. THE Dashboard SHALL use smooth page transitions between routes using Framer Motion's `AnimatePresence` component.

---

### Requirement 14: Dashboard — Data Fetching and Initial State

**User Story:** As an admin, I want the dashboard to load the current tournament state on first visit so that I see accurate data immediately, not just after the next bot event.

#### Acceptance Criteria

1. THE Bridge_Server SHALL expose GET endpoints for all data collections: `/api/squads`, `/api/groups`, `/api/matches`, `/api/scores`, `/api/logs`, and `/api/settings`.
2. WHEN the Dashboard loads any page, THE Dashboard SHALL fetch the current state from the corresponding Bridge_Server GET endpoint before rendering data.
3. THE Bridge_Server SHALL return all GET endpoint responses as JSON with a consistent envelope: `{ success: true, data: [...] }`.
4. IF a GET endpoint request fails, THEN THE Dashboard SHALL display an error state card with a "Retry" button instead of an empty list.
5. THE Bridge_Server SHALL support CORS for requests originating from the Dashboard's configured origin.
6. THE Bridge_Server SHALL respond to all GET requests within 500ms under normal load (single SQLite database, no external calls).

---

### Requirement 15: Bot — New `/update_score` Command Integration

**User Story:** As a tournament admin, I want to update squad scores via a Discord slash command so that scores can be entered directly from Discord as well as from the dashboard.

#### Acceptance Criteria

1. THE Bot SHALL register a `/update_score` slash command with options: `squad_id` (string, required), `kills` (integer, required), `placement` (integer, required).
2. WHEN `/update_score` is invoked with valid parameters, THE Bot SHALL insert or update the Score_Record for the given squad and match in the `scores` table.
3. WHEN `/update_score` is invoked, THE Bot SHALL reply with an ephemeral embed confirming the squad name, kills, placement points, and total points recorded.
4. WHEN `/update_score` is invoked, THE Bridge_Server SHALL emit a `score:updated` Socket.IO event so the Dashboard Leaderboard updates in real time.
5. WHEN `/update_score` is invoked with a `kills` value less than 0 or a `placement` value less than 0, THE Bot SHALL reply with an ephemeral error embed and make no database changes.
6. WHEN `/update_score` is invoked with a `squad_id` that does not exist in the `squads` table, THE Bot SHALL reply with an ephemeral error embed and make no database changes.

---

### Requirement 16: Tournament Settings Persistence

**User Story:** As a tournament organizer, I want tournament-wide settings like name, prize pool, and max slots to be stored in the database so that both the bot and dashboard can read and display them consistently.

#### Acceptance Criteria

1. THE Bridge_Server SHALL store the following settings keys in the `settings` table: `tournament_name`, `prize_pool`, `max_slots`, `game_mode`, and `registration_locked`.
2. WHEN the Bridge_Server starts, THE Bridge_Server SHALL initialize any missing settings keys with default values: `tournament_name` = `"SS E-Sports Tournament"`, `prize_pool` = `"TBD"`, `max_slots` = `"48"`, `game_mode` = `"Battle Royale"`.
3. WHEN the Dashboard sends a POST to `/api/update-settings`, THE Bridge_Server SHALL validate that `max_slots` is a positive integer before writing to the database.
4. IF `max_slots` is set to a non-integer or negative value, THEN THE Bridge_Server SHALL return HTTP 400 with a descriptive error message.
5. THE Bot SHALL read `tournament_name` from the `settings` table and include it in the footer of all embeds it generates.

---

### Requirement 17: Security and Access Control

**User Story:** As a system operator, I want the dashboard and bridge server to be secured so that only authorized admins can perform write operations.

#### Acceptance Criteria

1. THE Bridge_Server SHALL validate the `Authorization` header on all POST and PUT endpoints against a server-side API key stored in an environment variable (`DASHBOARD_API_KEY`).
2. IF the `Authorization` header is missing or does not match `DASHBOARD_API_KEY`, THEN THE Bridge_Server SHALL return HTTP 401 and make no database changes.
3. THE Dashboard SHALL store the API key in a server-side Next.js API route and never expose it to the browser client.
4. THE Auth_Provider SHALL use HTTPS for all OAuth2 redirect URIs in production.
5. THE Dashboard SHALL sanitize all user-supplied text inputs (broadcast message, team name, reason) before sending them to the Bridge_Server to prevent injection.
6. THE Bridge_Server SHALL use parameterized queries for all database operations to prevent SQL injection.
7. THE Bridge_Server SHALL set CORS to allow only the Dashboard's configured origin, rejecting requests from other origins.

---

### Requirement 18: Deployment and Environment Configuration

**User Story:** As a system operator, I want the dashboard and bridge server to run on the same Endercloud VPS as the bot so that I don't need to manage multiple hosting environments.

#### Acceptance Criteria

1. THE Bridge_Server SHALL be started as part of the same Node.js process as the Bot, sharing the same SQLite database connection.
2. THE Dashboard frontend SHALL be buildable as a static Next.js export or served via `next start` on the same VPS.
3. THE Bridge_Server SHALL read its configuration from environment variables: `PORT` (default 3001), `DASHBOARD_ORIGIN` (the Dashboard's URL), `DASHBOARD_API_KEY`, and `DB_PATH`.
4. THE Dashboard SHALL read its configuration from environment variables: `NEXT_PUBLIC_BRIDGE_URL` (the Bridge_Server URL), `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`, and `NEXTAUTH_SECRET`.
5. THE Bridge_Server SHALL log its startup port and connected database path to the terminal on initialization.
6. WHEN the Bot process exits, THE Bridge_Server SHALL close all Socket.IO connections gracefully before the process terminates.
