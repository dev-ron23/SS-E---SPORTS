# Design Document: SS E-Sports Tournament Bot

## Overview

A professional, production-ready Discord Tournament Management Bot for **SS E – SPORTS**, built in Node.js with discord.js v14. The bot manages the full lifecycle of a Free Fire tournament: registration → group assignment → match management → winner declaration, with comprehensive DM notifications, slash commands, AutoMod, and data export.

---

## High-Level Design

### System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Discord Gateway                          │
│  (messageCreate, interactionCreate, guildMemberUpdate events)   │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                      Bot Core (index.js)                        │
│  - Event Router                                                 │
│  - Command Handler (slash + prefix)                             │
│  - Presence Manager (Streaming)                                 │
└──┬──────────────┬──────────────┬──────────────┬─────────────────┘
   │              │              │              │
┌──▼──────┐ ┌────▼──────┐ ┌────▼──────┐ ┌────▼──────────────────┐
│ Reg.    │ │ Group     │ │ Match     │ │ Mod / AutoMod          │
│ Handler │ │ Manager   │ │ Manager   │ │ System                 │
└──┬──────┘ └────┬──────┘ └────┬──────┘ └────┬───────────────────┘
   │              │              │              │
┌──▼──────────────▼──────────────▼──────────────▼──────────────────┐
│                        Database Layer (SQLite)                    │
│  squads | players | groups | matches | warnings | logs            │
└───────────────────────────────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                     DM Notification Engine                      │
│  - Embed Builder                                                │
│  - Action Logger (channel 1502222823672774706)                  │
└─────────────────────────────────────────────────────────────────┘
```

### Component Diagram

| Component | Responsibility |
|---|---|
| `index.js` | Entry point, client init, event binding, presence |
| `handlers/registration.js` | Parse registration messages, validate, assign roles |
| `handlers/groups.js` | Auto-group squads, create/manage group channels |
| `handlers/matches.js` | Room assignment, match start, winner declaration |
| `handlers/moderation.js` | Mute, warn, remove, clear, AutoMod |
| `commands/` | All slash command definitions and executors |
| `utils/embedBuilder.js` | Centralized embed factory (all branded embeds) |
| `utils/dmEngine.js` | DM dispatch with retry logic |
| `utils/parser.js` | Flexible registration message parser |
| `utils/logger.js` | Channel logger + terminal logger |
| `utils/exporter.js` | CSV/TXT export generator |
| `database/db.js` | SQLite wrapper (better-sqlite3) |
| `database/schema.sql` | Table definitions |

### Key Discord Channels & IDs

| Purpose | Channel ID |
|---|---|
| Registration input | `1502217324059431064` |
| Confirmed squads | `1502217351897288847` |
| Registered VC counter | `1502217617522425966` |
| Action logs | `1502222823672774706` |
| Group category | `1502223431645794355` |
| Registered role | `1502219695791538226` |

### Data Models

#### Squad
```
{
  squad_id: string,          // e.g. "SSE-0001"
  squad_no: number,          // sequential
  team_name: string,
  leader_id: string,         // Discord user ID
  player_ids: string[],      // 2-4 mandatory + 1 optional
  player_uids: object,       // { discord_id: game_uid }
  group_no: number | null,
  registration_msg_id: string,
  registration_channel_id: string,
  confirmed_msg_id: string,
  group_msg_id: string | null,
  registered_at: string,     // ISO timestamp
  status: "active" | "cancelled" | "edited",
  winner_position: number | null
}
```

#### Player
```
{
  discord_id: string,
  squad_id: string,
  game_uid: string | null,
  role: "leader" | "player",
  warnings: number,
  is_muted: boolean
}
```

#### Group
```
{
  group_no: number,
  channel_id: string,
  role_id: string,
  squad_ids: string[],       // max 12
  match_room_id: string | null,
  match_password: string | null,
  match_started_at: string | null
}
```

#### Match
```
{
  match_id: string,
  group_no: number,
  room_id: string,
  password: string,
  assigned_at: string,
  started_at: string | null,
  winner_squad_id: string | null
}
```

### Registration Flow (Sequence Diagram)

```
User → #registration-channel: sends message (any format)
Bot → parser.js: extract team_name, players, UIDs
  ├─ INVALID (missing team name or < 2 players)
  │   └─ react ❌ <a:animatedCross:1438443052170608793>
  ├─ DUPLICATE (player already in a squad)
  │   ├─ react ❌
  │   └─ send embed: "@USER already registered in Squad X"
  └─ VALID
      ├─ react ✅ <a:rga_tick1:1407368712402767952>
      ├─ assign role 1502219695791538226 to all players
      ├─ save to DB (squads + players tables)
      ├─ send confirmed embed → #confirmed-squads
      ├─ assign to group (auto-group logic)
      ├─ update VC counter
      └─ DM all players (registration success embed)
```

### Group Assignment Flow

```
Squad registered (squad_no = N)
  group_no = Math.ceil(N / 12)
  
  if group channel "group-{group_no}" does NOT exist:
    create text channel under category 1502223431645794355
    create group role "Group {group_no}"
    set permissions: only group role can view
  
  add all squad players to group role
  post squad listing in group channel
  update group record in DB
```

### Embed Color Scheme

| Event | Color |
|---|---|
| Registration confirmed | `#00FF7F` (Spring Green) |
| Registration cancelled | `#FF0000` (Red) |
| Edit pending | `#FFA500` (Orange) |
| Edit confirmed | `#00BFFF` (Deep Sky Blue) |
| Match assigned | `#9B59B6` (Purple) |
| Winner declared | `#FFD700` (Gold) |
| Admin/broadcast | `#7289DA` (Discord Blurple) |
| Error/warning | `#FF4444` (Red) |
| Lock registration | `#8B00FF` (Violet/Purple) |

---

## Low-Level Design

### Registration Parser Algorithm

```javascript
/**
 * parseRegistration(content: string): ParseResult
 *
 * Preconditions:
 *   - content is a non-empty string
 *
 * Postconditions:
 *   - Returns { valid: false, reason } if:
 *       - No team name detected
 *       - Fewer than 2 player mentions found
 *   - Returns { valid: true, teamName, players, uids } if:
 *       - Team name extracted
 *       - 2-5 player mentions found
 *
 * Algorithm:
 *   1. Normalize content (trim, collapse whitespace)
 *   2. Extract team name via regex patterns:
 *      - /team\s*name\s*[:\-]\s*(.+?)(?=@|\n|uid|$)/i
 *      - /team\s*[:\-]\s*(.+?)(?=@|\n|uid|$)/i
 *   3. Extract all @mentions: /<@!?(\d+)>/g
 *   4. Extract UIDs: /uid\s*[:\-]\s*(\d+)/gi (paired with next mention)
 *   5. Deduplicate mentions (keep first occurrence)
 *   6. Validate: teamName exists AND mentions.length >= 2
 */
```

### Duplicate Detection Algorithm

```javascript
/**
 * checkDuplicate(playerIds: string[]): DuplicateResult
 *
 * For each playerId:
 *   query DB: SELECT squad_id FROM players WHERE discord_id = ? AND squad_status = 'active'
 *   if found → return { isDuplicate: true, playerId, existingSquadId }
 * return { isDuplicate: false }
 *
 * Correctness Property:
 *   ∀ player p: p appears in at most ONE active squad
 */
```

### Squad ID Generation

```javascript
/**
 * generateSquadId(squadNo: number): string
 * Returns "SSE-" + squadNo.toString().padStart(4, '0')
 * e.g. squad 1 → "SSE-0001", squad 42 → "SSE-0042"
 */
```

### Group Assignment Algorithm

```javascript
/**
 * assignToGroup(squadNo: number): number
 * Returns Math.ceil(squadNo / 12)
 *
 * Correctness Property:
 *   ∀ group g: |squads in g| ≤ 12
 *   ∀ squad s: s belongs to exactly one group
 */
```

### Core Function Signatures

```javascript
// registration.js
async function handleRegistrationMessage(message)
async function validateRegistration(parsed, guildId)
async function confirmRegistration(message, parsed, guild)
async function rejectRegistration(message, reason)

// groups.js
async function assignSquadToGroup(squad, guild)
async function getOrCreateGroupChannel(groupNo, guild)
async function updateGroupListing(groupNo, guild)
async function removeSquadFromGroup(squadId, guild)

// matches.js
async function assignMatch(groupNo, roomId, password, guild)
async function startMatch(groupNo, guild)
async function declareWinner(squadId, position, guild)

// moderation.js
async function mutePlayer(userId, guild, moderator)
async function unmutePlayer(userId, guild, moderator)
async function warnPlayer(userId, reason, guild, moderator)
async function removeFromGroup(userId, groupNo, guild, moderator)
async function clearRegChat(guild, moderator)

// embedBuilder.js
function buildRegistrationConfirmedEmbed(squad, jumpUrl)
function buildRegistrationCancelledEmbed(squad)
function buildEditPreviewEmbed(oldSquad, newData)
function buildMatchAssignedEmbed(groupNo, roomId, password)
function buildWinnerEmbed(squad, position)
function buildBroadcastEmbed(message, adminTag)
function buildDMEmbed(message, adminTag)
function buildLockRegistrationEmbed()
function buildPlayerInfoEmbed(player, squad)
function buildLeaderInfoEmbed(leader, squad)
function buildDuplicateEmbed(userId, existingSquadId, teamName)
function buildWarnEmbed(userId, reason, warnCount)
function buildMuteEmbed(userId, moderator)

// dmEngine.js
async function dmUser(userId, embed, client)
async function dmAllPlayers(embed, client)
async function dmSquadPlayers(squadId, embed, client)

// logger.js
async function logAction(client, action, details, moderator)
function terminalLog(level, message, data)

// exporter.js
function exportToCSV(squads)
function exportToTXT(squads)
```

### Slash Command Definitions

```javascript
// All commands registered via REST API on $sync

const commands = [
  {
    name: 'cancel_reg',
    description: 'Cancel a squad registration',
    options: [{ name: 'squad_id', type: STRING, required: true }]
  },
  {
    name: 'edit_reg',
    description: 'Edit a squad registration',
    options: [
      { name: 'previous_team_name', type: STRING, required: true },
      { name: 'new_team_name', type: STRING, required: true },
      { name: 'leader', type: USER, required: true },
      { name: 'new_format', type: STRING, required: true }
    ]
  },
  {
    name: 'add_squad',
    description: 'Manually add a squad',
    options: [
      { name: 'team_name', type: STRING, required: true },
      { name: 'leader', type: USER, required: true },
      { name: 'format', type: STRING, required: true }
    ]
  },
  {
    name: 'check_player',
    description: 'Check player registration details',
    options: [{ name: 'user', type: USER, required: true }]
  },
  {
    name: 'check_leader',
    description: 'Check leader squad details',
    options: [{ name: 'leader', type: USER, required: true }]
  },
  {
    name: 'export_squad',
    description: 'Export all squad data (CSV + TXT)'
  },
  {
    name: 'broadcast',
    description: 'DM all registered players',
    options: [{ name: 'message', type: STRING, required: true }]
  },
  {
    name: 'dm',
    description: 'DM a specific player from HQ',
    options: [
      { name: 'user', type: USER, required: true },
      { name: 'description', type: STRING, required: true }
    ]
  },
  {
    name: 'winner',
    description: 'Declare winner for a group',
    options: [
      { name: 'format', type: STRING, required: true },
      { name: 'channel', type: CHANNEL, required: true }
    ]
  },
  {
    name: 'assign_match',
    description: 'Assign match room to a group',
    options: [
      { name: 'group_no', type: INTEGER, required: true },
      { name: 'room_id', type: STRING, required: true },
      { name: 'room_password', type: STRING, required: true }
    ]
  },
  {
    name: 'start_match',
    description: 'Start match for a group',
    options: [{ name: 'group_no', type: INTEGER, required: true }]
  },
  {
    name: 'lock_reg',
    description: 'Lock registrations and post closure message'
  },
  {
    name: 'mute_player',
    description: 'Mute a player',
    options: [
      { name: 'user', type: USER, required: true },
      { name: 'reason', type: STRING, required: false }
    ]
  },
  {
    name: 'unmute_player',
    description: 'Unmute a player',
    options: [{ name: 'user', type: USER, required: true }]
  },
  {
    name: 'warn_player',
    description: 'Warn a player',
    options: [
      { name: 'user', type: USER, required: true },
      { name: 'reason', type: STRING, required: true }
    ]
  },
  {
    name: 'clear_reg_chat',
    description: 'Clear the registration channel'
  },
  {
    name: 'remove_from_group',
    description: 'Remove a player from a group',
    options: [
      { name: 'user', type: USER, required: true },
      { name: 'group_no', type: INTEGER, required: true }
    ]
  }
]
```

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS squads (
  squad_id TEXT PRIMARY KEY,
  squad_no INTEGER UNIQUE NOT NULL,
  team_name TEXT NOT NULL,
  leader_id TEXT NOT NULL,
  player_ids TEXT NOT NULL,        -- JSON array
  player_uids TEXT DEFAULT '{}',   -- JSON object
  group_no INTEGER,
  registration_msg_id TEXT,
  registration_channel_id TEXT,
  confirmed_msg_id TEXT,
  group_msg_id TEXT,
  registered_at TEXT NOT NULL,
  status TEXT DEFAULT 'active',    -- active | cancelled | edited
  winner_position INTEGER
);

CREATE TABLE IF NOT EXISTS players (
  discord_id TEXT NOT NULL,
  squad_id TEXT NOT NULL,
  game_uid TEXT,
  role TEXT DEFAULT 'player',      -- leader | player
  warnings INTEGER DEFAULT 0,
  is_muted INTEGER DEFAULT 0,
  PRIMARY KEY (discord_id, squad_id),
  FOREIGN KEY (squad_id) REFERENCES squads(squad_id)
);

CREATE TABLE IF NOT EXISTS groups_table (
  group_no INTEGER PRIMARY KEY,
  channel_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  squad_ids TEXT DEFAULT '[]',     -- JSON array
  match_room_id TEXT,
  match_password TEXT,
  match_started_at TEXT
);

CREATE TABLE IF NOT EXISTS matches (
  match_id TEXT PRIMARY KEY,
  group_no INTEGER NOT NULL,
  room_id TEXT NOT NULL,
  password TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  started_at TEXT,
  winner_squad_id TEXT
);

CREATE TABLE IF NOT EXISTS action_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  actor_id TEXT,
  target_id TEXT,
  details TEXT,
  timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
-- settings: registration_locked (0/1), squad_counter (N)
```

### Edit Registration Flow (with UI Buttons)

```
Admin: /edit_reg previous_team_name new_team_name @leader new_format
  │
  ├─ Parse new_format (same parser as registration)
  ├─ Build editPreviewEmbed (old vs new data)
  ├─ DM admin: embed + [✅ Confirm] [❌ Reject] buttons
  │
  ├─ Admin clicks ✅ Confirm:
  │   ├─ Update DB (squad + players)
  │   ├─ Edit confirmed squads channel message
  │   ├─ Edit group channel listing
  │   ├─ DM leader: "Your registration has been updated"
  │   └─ Log action
  │
  └─ Admin clicks ❌ Reject:
      ├─ DM admin: "Edit rejected, no changes made"
      └─ Log action
```

### AutoMod Rules

| Trigger | Action |
|---|---|
| Spam (5+ messages in 3s) | Auto-mute 10 min + warn |
| Mention spam (3+ mentions) | Delete message + warn |
| Caps spam (>70% caps, >10 chars) | Delete + warn |
| Repeated registration attempts | React ❌ + warn |
| 3 warnings accumulated | Auto-kick from group |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Registration Message Round-Trip

*For any* valid squad data structure (team name, 2-5 player IDs, optional UIDs), formatting it into a registration message string and then parsing that message SHALL produce an equivalent squad data structure with the same team name, player IDs, and UIDs.

**Validates: Requirements 1.1, 1.2**

### Property 2: Mention Deduplication

*For any* registration message containing duplicate player mentions, the Parser SHALL produce a player list containing each unique player ID exactly once, preserving the first occurrence.

**Validates: Requirements 1.5**

### Property 3: Invalid Registration Rejection — Missing Team Name

*For any* message that does not contain a detectable team name pattern, the Parser SHALL return an invalid result.

**Validates: Requirements 1.6**

### Property 4: Invalid Registration Rejection — Insufficient Players

*For any* message containing fewer than 2 distinct player mentions, the Parser SHALL return an invalid result.

**Validates: Requirements 1.7**

### Property 5: Duplicate Player Detection

*For any* set of player IDs submitted in a registration, if any player ID already exists in an active squad in the DB, the duplicate detection SHALL identify that player and their existing squad ID.

**Validates: Requirements 2.1**

### Property 6: Invalid Registration Isolation

*For any* invalid registration message (missing team name or fewer than 2 players), the Registration_Handler SHALL perform no DB writes and no role assignments.

**Validates: Requirements 2.4**

### Property 7: Registration Lock Enforcement

*For any* registration message received while the `registration_locked` flag is set to `1` in the DB, the Registration_Handler SHALL reject the message without processing it.

**Validates: Requirements 2.5**

### Property 8: Registered Role Assignment

*For any* confirmed registration, all player IDs in the squad SHALL be assigned the Registered_Role.

**Validates: Requirements 3.2**

### Property 9: Squad Persistence Round-Trip

*For any* confirmed registration, querying the DB for the squad ID SHALL return a squad record containing the exact team name, leader ID, player IDs, player UIDs, and status `active` that were submitted.

**Validates: Requirements 3.3, 3.4**

### Property 10: Embed Color Consistency

*For any* embed generated by the Embed_Builder, the embed color SHALL match the specified color for that event type (e.g., `#00FF7F` for registration confirmed, `#FF0000` for cancelled, `#FFD700` for winner).

**Validates: Requirements 3.5, 27.1, 27.2, 27.3, 27.4, 27.5, 27.6, 27.7, 27.8, 27.9**

### Property 11: VC Counter Accuracy

*For any* state of the DB, the VC_Counter_Channel name SHALL display a count equal to the number of squads with status `active` in the DB.

**Validates: Requirements 3.7, 23.1**

### Property 12: Squad ID Format

*For any* squad number N, the generated squad ID SHALL be the string `"SSE-"` concatenated with N zero-padded to 4 digits (e.g., squad 1 → `"SSE-0001"`, squad 42 → `"SSE-0042"`).

**Validates: Requirements 3.8**

### Property 13: Group Assignment Formula

*For any* squad number N, the assigned group number SHALL be `Math.ceil(N / 12)`.

**Validates: Requirements 4.1**

### Property 14: Group Role Assignment

*For any* squad assigned to a group, all player IDs in the squad SHALL be assigned the group role corresponding to that group number.

**Validates: Requirements 4.4**

### Property 15: Group Persistence

*For any* squad assigned to a group, querying the DB for the squad ID SHALL return a record with the correct group number.

**Validates: Requirements 4.6**

### Property 16: Group Capacity Invariant

*For any* sequence of squad registrations and cancellations, no group SHALL ever contain more than 12 active squads.

**Validates: Requirements 4.7**

### Property 17: Group Membership Uniqueness

*For any* active squad in the DB, that squad SHALL belong to exactly one group.

**Validates: Requirements 4.8**

### Property 18: Registration Uniqueness

*For any* player ID, that player SHALL appear in at most one squad with status `active` in the DB.

**Validates: Requirements 2.1 (implicit)**

### Property 19: Cancellation Status Update

*For any* valid squad ID, invoking cancellation SHALL update the squad's status to `cancelled` in the DB.

**Validates: Requirements 5.1**

### Property 20: Cancellation Role Removal

*For any* cancelled squad, no player ID in that squad SHALL retain the Registered_Role or the group role after cancellation completes.

**Validates: Requirements 5.2**

### Property 21: Edit Confirmation Persistence

*For any* edit operation that is confirmed, querying the DB for the squad ID SHALL return a record reflecting the new team name, leader ID, and player IDs.

**Validates: Requirements 6.4**

### Property 22: Edit Rejection Isolation

*For any* edit operation that is rejected, the squad record in the DB SHALL remain unchanged from its state before the edit was initiated.

**Validates: Requirements 6.9**

### Property 23: Player Lookup Accuracy

*For any* player ID that exists in the `players` table, invoking `/check_player` SHALL return the player's squad ID, game UID, warning count, and mute status.

**Validates: Requirements 8.1, 8.2**

### Property 24: Leader Lookup Accuracy

*For any* leader ID that exists as a leader in the `squads` table, invoking `/check_leader` SHALL return the squad ID, team name, all player IDs, and group number.

**Validates: Requirements 8.4, 8.5**

### Property 25: Export Completeness

*For any* state of the DB, the CSV and TXT exports SHALL contain exactly the set of squads with status `active`, with all fields (squad ID, squad number, team name, leader ID, player IDs, player UIDs, group number, registration timestamp) populated for each squad.

**Validates: Requirements 9.1, 9.2, 9.4**

### Property 26: Match Assignment Persistence

*For any* valid group number, invoking `/assign_match` with a room ID and password SHALL update the group record in the DB with those values.

**Validates: Requirements 10.1**

### Property 27: Match Start Timestamp

*For any* group with an assigned match, invoking `/start_match` SHALL record a non-null `match_started_at` timestamp in the DB for that group.

**Validates: Requirements 11.1**

### Property 28: Winner Declaration Persistence

*For any* valid squad ID and position, invoking `/winner` SHALL update the squad record in the DB with the winner position.

**Validates: Requirements 12.2**

### Property 29: Registration Lock State

*For any* invocation of `/lock_reg`, the DB settings table SHALL contain a record with key `registration_locked` and value `1`.

**Validates: Requirements 13.1**

### Property 30: Broadcast Reach

*For any* invocation of `/broadcast`, the DM_Engine SHALL attempt to send the broadcast message to every player ID in every squad with status `active`.

**Validates: Requirements 14.1**

### Property 31: Mute Flag Persistence

*For any* player ID, invoking `/mute_player` SHALL set the player's `is_muted` flag to `1` in the DB, and invoking `/unmute_player` SHALL set it to `0`.

**Validates: Requirements 15.2, 15.6**

### Property 32: Warning Accumulation and Auto-Removal

*For any* player ID, each invocation of `/warn_player` SHALL increment the player's warning count by 1, and when the warning count reaches 3, the player SHALL be automatically removed from their group (group role revoked and DB updated).

**Validates: Requirements 16.1, 16.4**

### Property 33: Group Removal Persistence

*For any* player ID and group number, invoking `/remove_from_group` SHALL update the DB so that the player is no longer associated with that group.

**Validates: Requirements 17.2**

### Property 34: AutoMod Spam Detection

*For any* user who sends 5 or more messages within a 3-second window, the AutoMod SHALL automatically mute the user and increment their warning count by 1.

**Validates: Requirements 19.1**

### Property 35: AutoMod Mention Spam Detection

*For any* message containing 3 or more user mentions, the AutoMod SHALL delete the message and increment the sender's warning count by 1.

**Validates: Requirements 19.2**

### Property 36: AutoMod Caps Spam Detection

*For any* message longer than 10 characters where more than 70% of characters are uppercase, the AutoMod SHALL delete the message and increment the sender's warning count by 1.

**Validates: Requirements 19.3**

### Property 37: AutoMod Repeated Registration Detection

*For any* user who attempts to register again after already being in an active squad, the AutoMod SHALL react with ❌ and increment the user's warning count by 1.

**Validates: Requirements 19.4**

### Property 38: DM Retry Behavior

*For any* DM that fails to deliver, the DM_Engine SHALL retry delivery up to 3 times before logging the failure and continuing.

**Validates: Requirements 20.2, 20.3**

### Property 39: Action Log Completeness

*For any* admin or moderation action performed by the bot, the Logger SHALL create a log entry containing the action type, actor ID, target ID (if applicable), description, and UTC timestamp.

**Validates: Requirements 21.1, 21.2**

### Property 40: Confirmed Squad Embed Content

*For any* confirmed squad, the embed posted in the Confirmed_Squads_Channel SHALL contain the squad ID, team name, leader mention, all player mentions, and a hyperlink to the original registration message.

**Validates: Requirements 24.1**

### Property 41: Database Uniqueness Constraints

*For any* state of the DB, all `squad_id` values in the `squads` table SHALL be unique, all `squad_no` values SHALL be unique, and all `(discord_id, squad_id)` pairs in the `players` table SHALL be unique.

**Validates: Requirements 26.4, 26.5**

---

## File Structure

```
ss-esports-bot/
├── index.js                    # Entry point
├── package.json
├── .env                        # BOT_TOKEN, CLIENT_ID, GUILD_ID
├── database/
│   ├── db.js                   # better-sqlite3 wrapper
│   └── schema.sql
├── handlers/
│   ├── registration.js
│   ├── groups.js
│   ├── matches.js
│   └── moderation.js
├── commands/
│   ├── cancel_reg.js
│   ├── edit_reg.js
│   ├── add_squad.js
│   ├── check_player.js
│   ├── check_leader.js
│   ├── export_squad.js
│   ├── broadcast.js
│   ├── dm.js
│   ├── winner.js
│   ├── assign_match.js
│   ├── start_match.js
│   ├── lock_reg.js
│   ├── mute_player.js
│   ├── unmute_player.js
│   ├── warn_player.js
│   ├── clear_reg_chat.js
│   └── remove_from_group.js
├── utils/
│   ├── embedBuilder.js
│   ├── dmEngine.js
│   ├── parser.js
│   ├── logger.js
│   └── exporter.js
└── sync.js                     # $sync command handler
```

---

## Dependencies

```json
{
  "dependencies": {
    "discord.js": "^14.14.1",
    "better-sqlite3": "^9.4.3",
    "dotenv": "^16.4.5",
    "@discordjs/rest": "^2.3.0",
    "discord-api-types": "^0.37.83"
  }
}
```
