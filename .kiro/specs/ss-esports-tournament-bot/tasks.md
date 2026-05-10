# Implementation Plan: SS E-Sports Tournament Bot

## Overview

This implementation plan covers the complete development of a production-ready Discord Tournament Management Bot for SS E-SPORTS. The bot is built in Node.js using discord.js v14 and better-sqlite3, managing the full tournament lifecycle from registration through winner declaration. The implementation follows a bottom-up approach: core utilities → database layer → handlers → commands → integration.

## Tasks

- [x] 1. Set up project structure and dependencies
  - Initialize Node.js project with package.json
  - Install dependencies: discord.js@^14.14.1, better-sqlite3@^9.4.3, dotenv@^16.4.5, @discordjs/rest@^2.3.0, discord-api-types@^0.37.83
  - Create directory structure: database/, handlers/, commands/, utils/
  - Create .env file with BOT_TOKEN, CLIENT_ID, GUILD_ID placeholders
  - Create .gitignore to exclude node_modules, .env, and *.db files
  - _Requirements: 26.1_

- [x] 2. Implement database layer and schema
  - [x] 2.1 Create database schema (database/schema.sql)
    - Define squads table with all fields (squad_id PK, squad_no UNIQUE, team_name, leader_id, player_ids JSON, player_uids JSON, group_no, registration_msg_id, registration_channel_id, confirmed_msg_id, group_msg_id, registered_at, status, winner_position)
    - Define players table with composite PK (discord_id, squad_id) and FK to squads
    - Define groups_table with group_no PK and squad_ids JSON array
    - Define matches table with match_id PK
    - Define action_logs table with auto-increment id
    - Define settings table with key-value pairs
    - _Requirements: 26.1, 26.3, 26.4, 26.5_

  - [x] 2.2 Create database wrapper (database/db.js)
    - Initialize better-sqlite3 connection
    - Execute schema.sql on startup if tables don't exist
    - Export prepared statement functions for all CRUD operations
    - Implement transaction support for multi-table operations
    - _Requirements: 26.1, 26.2_

  - [x] 2.3 Write property test for database persistence
    - **Property 9: Squad Persistence Round-Trip**
    - **Validates: Requirements 3.3, 3.4**
    - Test: Insert squad → query by squad_id → verify all fields match

  - [x] 2.4 Write property test for database uniqueness constraints
    - **Property 41: Database Uniqueness Constraints**
    - **Validates: Requirements 26.4, 26.5**
    - Test: Attempt duplicate squad_id → verify rejection
    - Test: Attempt duplicate squad_no → verify rejection
    - Test: Attempt duplicate (discord_id, squad_id) → verify rejection

- [x] 3. Implement core utility modules
  - [x] 3.1 Create registration parser (utils/parser.js)
    - Implement parseRegistration(content) function
    - Extract team name using regex patterns (team name:, team:, etc.)
    - Extract all @mentions using /<@!?(\d+)>/g
    - Extract UIDs using /uid\s*[:\-]\s*(\d+)/gi and pair with mentions
    - Deduplicate mentions (keep first occurrence)
    - Return { valid, teamName, players, uids, reason }
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

  - [x] 3.2 Write property test for parser round-trip
    - **Property 1: Registration Message Round-Trip**
    - **Validates: Requirements 1.1, 1.2**
    - Test: Generate valid registration message → parse → verify data matches

  - [x] 3.3 Write property test for mention deduplication
    - **Property 2: Mention Deduplication**
    - **Validates: Requirements 1.5**
    - Test: Message with duplicate mentions → parse → verify unique players only

  - [x] 3.4 Write property test for invalid registration rejection (missing team name)
    - **Property 3: Invalid Registration Rejection — Missing Team Name**
    - **Validates: Requirements 1.6**
    - Test: Message without team name → parse → verify invalid result

  - [x] 3.5 Write property test for invalid registration rejection (insufficient players)
    - **Property 4: Invalid Registration Rejection — Insufficient Players**
    - **Validates: Requirements 1.7**
    - Test: Message with <2 players → parse → verify invalid result

  - [x] 3.6 Create embed builder (utils/embedBuilder.js)
    - Implement buildRegistrationConfirmedEmbed(squad, jumpUrl) with color #00FF7F
    - Implement buildRegistrationCancelledEmbed(squad) with color #FF0000
    - Implement buildEditPreviewEmbed(oldSquad, newData) with color #FFA500
    - Implement buildEditConfirmedEmbed(squad) with color #00BFFF
    - Implement buildMatchAssignedEmbed(groupNo, roomId, password) with color #9B59B6
    - Implement buildWinnerEmbed(squad, position) with color #FFD700
    - Implement buildBroadcastEmbed(message, adminTag) with color #7289DA
    - Implement buildDMEmbed(message, adminTag) with color #7289DA
    - Implement buildLockRegistrationEmbed() with color #8B00FF
    - Implement buildPlayerInfoEmbed(player, squad)
    - Implement buildLeaderInfoEmbed(leader, squad)
    - Implement buildDuplicateEmbed(userId, existingSquadId, teamName) with color #FF4444
    - Implement buildWarnEmbed(userId, reason, warnCount) with color #FF4444
    - Implement buildMuteEmbed(userId, moderator)
    - _Requirements: 3.5, 27.1, 27.2, 27.3, 27.4, 27.5, 27.6, 27.7, 27.8, 27.9_

  - [x] 3.7 Write property test for embed color consistency
    - **Property 10: Embed Color Consistency**
    - **Validates: Requirements 3.5, 27.1-27.9**
    - Test: Generate each embed type → verify color matches specification

  - [x] 3.8 Create DM engine (utils/dmEngine.js)
    - Implement dmUser(userId, embed, client) with 3-retry logic
    - Implement dmAllPlayers(embed, client) to DM all active squad players
    - Implement dmSquadPlayers(squadId, embed, client) to DM specific squad
    - Log failures to terminal after retries exhausted
    - _Requirements: 20.1, 20.2, 20.3, 20.4_

  - [x] 3.9 Write property test for DM retry behavior
    - **Property 38: DM Retry Behavior**
    - **Validates: Requirements 20.2, 20.3**
    - Test: Mock DM failure → verify 3 retry attempts → verify failure logged

  - [x] 3.10 Create action logger (utils/logger.js)
    - Implement logAction(client, action, details, moderator) to post embed to channel 1502222823672774706
    - Implement terminalLog(level, message, data) for console logging
    - Handle channel post failures gracefully
    - _Requirements: 21.1, 21.2, 21.3, 21.4_

  - [x] 3.11 Write property test for action log completeness
    - **Property 39: Action Log Completeness**
    - **Validates: Requirements 21.1, 21.2**
    - Test: Perform admin action → verify log entry contains action type, actor ID, target ID, description, timestamp

  - [x] 3.12 Create data exporter (utils/exporter.js)
    - Implement exportToCSV(squads) to generate CSV with all squad fields
    - Implement exportToTXT(squads) to generate human-readable TXT
    - Include only active squads in exports
    - _Requirements: 9.1, 9.2, 9.4_

  - [x] 3.13 Write property test for export completeness
    - **Property 25: Export Completeness**
    - **Validates: Requirements 9.1, 9.2, 9.4**
    - Test: Create N active squads + M cancelled → export → verify CSV/TXT contain exactly N squads with all fields

- [x] 4. Checkpoint - Ensure all utility tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement registration handler
  - [x] 5.1 Create registration handler (handlers/registration.js)
    - Implement handleRegistrationMessage(message) to process messages in channel 1502217324059431064
    - Call parser.parseRegistration(message.content)
    - Implement validateRegistration(parsed, guildId) to check duplicates
    - Implement checkDuplicate(playerIds) to query DB for existing active squad memberships
    - React with ❌ <a:animatedCross:1438443052170608793> for invalid/duplicate
    - React with ✅ <a:rga_tick1:1407368712402767952> for valid
    - _Requirements: 1.1-1.8, 2.1-2.4_

  - [x] 5.2 Write property test for duplicate player detection
    - **Property 5: Duplicate Player Detection**
    - **Validates: Requirements 2.1**
    - Test: Register squad A with player P → attempt register squad B with player P → verify duplicate detected

  - [x] 5.3 Write property test for registration uniqueness
    - **Property 18: Registration Uniqueness**
    - **Validates: Requirements 2.1**
    - Test: After any sequence of registrations → verify each player in at most one active squad

  - [x] 5.4 Write property test for invalid registration isolation
    - **Property 6: Invalid Registration Isolation**
    - **Validates: Requirements 2.4**
    - Test: Submit invalid registration → verify no DB writes, no role assignments

  - [x] 5.5 Implement confirmRegistration(message, parsed, guild)
    - Generate squad ID using generateSquadId(squadNo) format SSE-XXXX
    - Assign role 1502219695791538226 to all players
    - Insert squad record into DB with status 'active'
    - Insert player records into DB
    - Post confirmed embed to channel 1502217351897288847
    - Call assignSquadToGroup(squad, guild)
    - Update VC counter channel 1502217617522425966
    - DM all players with registration success embed
    - _Requirements: 3.1-3.8_

  - [x] 5.6 Write property test for registered role assignment
    - **Property 8: Registered Role Assignment**
    - **Validates: Requirements 3.2**
    - Test: Confirm registration → verify all player IDs have Registered_Role

  - [x] 5.7 Write property test for squad ID format
    - **Property 12: Squad ID Format**
    - **Validates: Requirements 3.8**
    - Test: Generate squad IDs for N=1,42,999 → verify format SSE-0001, SSE-0042, SSE-0999

  - [x] 5.8 Write property test for VC counter accuracy
    - **Property 11: VC Counter Accuracy**
    - **Validates: Requirements 3.7, 23.1**
    - Test: Register N squads → verify VC counter shows N → cancel 1 → verify shows N-1

  - [x] 5.9 Implement registration lock enforcement
    - Check DB settings for registration_locked flag
    - Reject all registrations when locked
    - _Requirements: 2.5, 13.3_

  - [x] 5.10 Write property test for registration lock enforcement
    - **Property 7: Registration Lock Enforcement**
    - **Validates: Requirements 2.5**
    - Test: Set registration_locked=1 → submit registration → verify rejected without processing

  - [x] 5.11 Write property test for confirmed squad embed content
    - **Property 40: Confirmed Squad Embed Content**
    - **Validates: Requirements 24.1**
    - Test: Confirm squad → verify embed contains squad ID, team name, leader mention, player mentions, jump URL

- [x] 6. Implement group manager
  - [x] 6.1 Create group manager (handlers/groups.js)
    - Implement assignSquadToGroup(squad, guild) using formula Math.ceil(squad_no / 12)
    - Implement getOrCreateGroupChannel(groupNo, guild) to create channel under category 1502223431645794355
    - Create group role "Group {groupNo}" with view-only permissions
    - Assign group role to all squad players
    - Update DB with group assignment
    - _Requirements: 4.1-4.6_

  - [x] 6.2 Write property test for group assignment formula
    - **Property 13: Group Assignment Formula**
    - **Validates: Requirements 4.1**
    - Test: Squad numbers 1-12 → group 1, 13-24 → group 2, etc.

  - [x] 6.3 Write property test for group role assignment
    - **Property 14: Group Role Assignment**
    - **Validates: Requirements 4.4**
    - Test: Assign squad to group → verify all player IDs have group role

  - [x] 6.4 Write property test for group persistence
    - **Property 15: Group Persistence**
    - **Validates: Requirements 4.6**
    - Test: Assign squad to group → query DB → verify group_no matches

  - [x] 6.5 Write property test for group capacity invariant
    - **Property 16: Group Capacity Invariant**
    - **Validates: Requirements 4.7**
    - Test: Register 25 squads → verify group 1 has 12, group 2 has 12, group 3 has 1

  - [x] 6.6 Write property test for group membership uniqueness
    - **Property 17: Group Membership Uniqueness**
    - **Validates: Requirements 4.8**
    - Test: After any registrations → verify each active squad in exactly one group

  - [x] 6.7 Implement updateGroupListing(groupNo, guild)
    - Post or edit squad listing embed in group channel
    - Store group_msg_id in DB
    - _Requirements: 4.5_

  - [x] 6.8 Implement removeSquadFromGroup(squadId, guild)
    - Remove squad from group listing
    - Revoke group role from all squad players
    - Update DB
    - _Requirements: 5.4, 5.5_

- [x] 7. Implement match manager
  - [x] 7.1 Create match manager (handlers/matches.js)
    - Implement assignMatch(groupNo, roomId, password, guild) to store match credentials in DB
    - Build match-assigned embed and DM all group players
    - Log action
    - _Requirements: 10.1-10.4_

  - [x] 7.2 Write property test for match assignment persistence
    - **Property 26: Match Assignment Persistence**
    - **Validates: Requirements 10.1**
    - Test: Assign match to group → query DB → verify room ID and password stored

  - [x] 7.3 Implement startMatch(groupNo, guild)
    - Record match_started_at timestamp in DB
    - DM all group players with match-start notification
    - Log action
    - _Requirements: 11.1-11.3_

  - [x] 7.4 Write property test for match start timestamp
    - **Property 27: Match Start Timestamp**
    - **Validates: Requirements 11.1**
    - Test: Start match → query DB → verify match_started_at is non-null

  - [x] 7.5 Implement declareWinner(squadId, position, guild)
    - Update squad record with winner_position
    - Update match record with winner_squad_id
    - Build winner embed and post to group channel
    - DM winning squad players
    - Log action
    - _Requirements: 12.1-12.6_

  - [x] 7.6 Write property test for winner declaration persistence
    - **Property 28: Winner Declaration Persistence**
    - **Validates: Requirements 12.2**
    - Test: Declare winner → query DB → verify winner_position stored

- [x] 8. Implement moderation handler
  - [x] 8.1 Create moderation handler (handlers/moderation.js)
    - Implement mutePlayer(userId, guild, moderator) to apply timeout/permission override
    - Update DB is_muted flag to 1
    - DM player with mute notification
    - Log action
    - _Requirements: 15.1-15.4_

  - [x] 8.2 Write property test for mute flag persistence
    - **Property 31: Mute Flag Persistence**
    - **Validates: Requirements 15.2, 15.6**
    - Test: Mute player → verify is_muted=1 → unmute → verify is_muted=0

  - [x] 8.3 Implement unmutePlayer(userId, guild, moderator)
    - Restore messaging permissions
    - Update DB is_muted flag to 0
    - Log action
    - _Requirements: 15.5-15.7_

  - [x] 8.4 Implement warnPlayer(userId, reason, guild, moderator)
    - Increment warnings count in DB
    - DM player with warn embed
    - Log action
    - If warnings >= 3, auto-remove from group
    - _Requirements: 16.1-16.5_

  - [x] 8.5 Write property test for warning accumulation and auto-removal
    - **Property 32: Warning Accumulation and Auto-Removal**
    - **Validates: Requirements 16.1, 16.4**
    - Test: Warn player 3 times → verify auto-removed from group after 3rd warning

  - [x] 8.6 Implement removeFromGroup(userId, groupNo, guild, moderator)
    - Revoke group role
    - Update DB
    - Log action
    - _Requirements: 17.1-17.3_

  - [x] 8.7 Write property test for group removal persistence
    - **Property 33: Group Removal Persistence**
    - **Validates: Requirements 17.2**
    - Test: Remove player from group → query DB → verify player no longer in group

  - [x] 8.8 Implement clearRegChat(guild, moderator)
    - Bulk delete messages in channel 1502217324059431064
    - Log action with message count
    - _Requirements: 18.1-18.3_

  - [x] 8.9 Implement AutoMod rules
    - Detect spam (5+ messages in 3s) → auto-mute 10 min + warn
    - Detect mention spam (3+ mentions) → delete + warn
    - Detect caps spam (>70% caps, >10 chars) → delete + warn
    - Detect repeated registration → react ❌ + warn
    - Log all AutoMod actions
    - _Requirements: 19.1-19.5_

  - [x] 8.10 Write property test for AutoMod spam detection
    - **Property 34: AutoMod Spam Detection**
    - **Validates: Requirements 19.1**
    - Test: Send 5 messages in 3s → verify auto-muted + warning incremented

  - [x] 8.11 Write property test for AutoMod mention spam detection
    - **Property 35: AutoMod Mention Spam Detection**
    - **Validates: Requirements 19.2**
    - Test: Send message with 3+ mentions → verify deleted + warning incremented

  - [x] 8.12 Write property test for AutoMod caps spam detection
    - **Property 36: AutoMod Caps Spam Detection**
    - **Validates: Requirements 19.3**
    - Test: Send message >70% caps, >10 chars → verify deleted + warning incremented

  - [x] 8.13 Write property test for AutoMod repeated registration detection
    - **Property 37: AutoMod Repeated Registration Detection**
    - **Validates: Requirements 19.4**
    - Test: Register squad → attempt register again → verify ❌ reaction + warning incremented

- [x] 9. Checkpoint - Ensure all handler tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement slash commands
  - [x] 10.1 Create /cancel_reg command (commands/cancel_reg.js)
    - Update squad status to 'cancelled' in DB
    - Remove Registered_Role and group role from all players
    - Edit confirmed embed to show cancellation
    - Remove from group listing
    - DM all players
    - Log action
    - _Requirements: 5.1-5.8_

  - [x] 10.2 Write property test for cancellation status update
    - **Property 19: Cancellation Status Update**
    - **Validates: Requirements 5.1**
    - Test: Cancel squad → query DB → verify status='cancelled'

  - [x] 10.3 Write property test for cancellation role removal
    - **Property 20: Cancellation Role Removal**
    - **Validates: Requirements 5.2**
    - Test: Cancel squad → verify no player has Registered_Role or group role

  - [x] 10.4 Create /edit_reg command (commands/edit_reg.js)
    - Parse new_format using parser
    - Build edit-preview embed
    - DM admin with ✅ Confirm and ❌ Reject buttons
    - On confirm: update DB, edit confirmed embed, edit group listing, DM leader, log
    - On reject: DM admin, log
    - _Requirements: 6.1-6.11_

  - [x] 10.5 Write property test for edit confirmation persistence
    - **Property 21: Edit Confirmation Persistence**
    - **Validates: Requirements 6.4**
    - Test: Edit squad + confirm → query DB → verify new data persisted

  - [x] 10.6 Write property test for edit rejection isolation
    - **Property 22: Edit Rejection Isolation**
    - **Validates: Requirements 6.9**
    - Test: Edit squad + reject → query DB → verify data unchanged

  - [x] 10.7 Create /add_squad command (commands/add_squad.js)
    - Parse format using parser
    - Follow same confirmation flow as automatic registration
    - _Requirements: 7.1-7.5_

  - [x] 10.8 Create /check_player command (commands/check_player.js)
    - Query DB for player record
    - Build player-info embed
    - Reply ephemeral
    - _Requirements: 8.1-8.3_

  - [x] 10.9 Write property test for player lookup accuracy
    - **Property 23: Player Lookup Accuracy**
    - **Validates: Requirements 8.1, 8.2**
    - Test: Register player → check_player → verify returns correct squad ID, UID, warnings, mute status

  - [x] 10.10 Create /check_leader command (commands/check_leader.js)
    - Query DB for squad led by user
    - Build leader-info embed
    - Reply ephemeral
    - _Requirements: 8.4-8.6_

  - [x] 10.11 Write property test for leader lookup accuracy
    - **Property 24: Leader Lookup Accuracy**
    - **Validates: Requirements 8.4, 8.5**
    - Test: Register squad with leader L → check_leader L → verify returns squad ID, team name, players, group

  - [x] 10.12 Create /export_squad command (commands/export_squad.js)
    - Query all active squads from DB
    - Generate CSV using exporter.exportToCSV(squads)
    - Generate TXT using exporter.exportToTXT(squads)
    - Attach both files to response
    - _Requirements: 9.1-9.4_

  - [x] 10.13 Create /broadcast command (commands/broadcast.js)
    - Build broadcast embed
    - Call dmEngine.dmAllPlayers(embed, client)
    - Reply with confirmation count
    - _Requirements: 14.1, 14.3, 14.5_

  - [x] 10.14 Write property test for broadcast reach
    - **Property 30: Broadcast Reach**
    - **Validates: Requirements 14.1**
    - Test: Register N squads → broadcast → verify DM attempt to all N*players_per_squad players

  - [x] 10.15 Create /dm command (commands/dm.js)
    - Build DM embed
    - Call dmEngine.dmUser(userId, embed, client)
    - Reply with confirmation
    - _Requirements: 14.2, 14.4, 14.5_

  - [x] 10.16 Create /winner command (commands/winner.js)
    - Parse format to extract squad and position
    - Call matchManager.declareWinner(squadId, position, guild)
    - _Requirements: 12.1-12.6_

  - [x] 10.17 Create /assign_match command (commands/assign_match.js)
    - Call matchManager.assignMatch(groupNo, roomId, password, guild)
    - _Requirements: 10.1-10.5_

  - [x] 10.18 Create /start_match command (commands/start_match.js)
    - Call matchManager.startMatch(groupNo, guild)
    - _Requirements: 11.1-11.4_

  - [x] 10.19 Create /lock_reg command (commands/lock_reg.js)
    - Set registration_locked=1 in DB settings
    - Post lock embed to registration channel
    - Log action
    - _Requirements: 13.1-13.4_

  - [x] 10.20 Write property test for registration lock state
    - **Property 29: Registration Lock State**
    - **Validates: Requirements 13.1**
    - Test: Invoke /lock_reg → query DB → verify registration_locked=1

  - [x] 10.21 Create /mute_player command (commands/mute_player.js)
    - Call moderation.mutePlayer(userId, guild, moderator)
    - _Requirements: 15.1-15.4_

  - [x] 10.22 Create /unmute_player command (commands/unmute_player.js)
    - Call moderation.unmutePlayer(userId, guild, moderator)
    - _Requirements: 15.5-15.7_

  - [x] 10.23 Create /warn_player command (commands/warn_player.js)
    - Call moderation.warnPlayer(userId, reason, guild, moderator)
    - _Requirements: 16.1-16.5_

  - [x] 10.24 Create /clear_reg_chat command (commands/clear_reg_chat.js)
    - Call moderation.clearRegChat(guild, moderator)
    - _Requirements: 18.1-18.3_

  - [x] 10.25 Create /remove_from_group command (commands/remove_from_group.js)
    - Call moderation.removeFromGroup(userId, groupNo, guild, moderator)
    - _Requirements: 17.1-17.4_

- [x] 11. Implement bot core and event handlers
  - [x] 11.1 Create bot entry point (index.js)
    - Initialize discord.js Client with required intents (Guilds, GuildMembers, GuildMessages, MessageContent, DirectMessages)
    - Load environment variables from .env
    - Set streaming presence on ready event
    - Bind messageCreate event to registration handler for channel 1502217324059431064
    - Bind interactionCreate event to command router
    - Load all command modules from commands/ directory
    - Initialize database on startup
    - _Requirements: 25.1, 25.2_

  - [x] 11.2 Create command sync utility (sync.js)
    - Implement $sync prefix command handler
    - Register all slash commands via @discordjs/rest
    - Reply with confirmation or error
    - _Requirements: 22.1-22.3_

  - [x] 11.3 Wire registration handler to messageCreate event
    - Filter messages to channel 1502217324059431064
    - Call handlers/registration.handleRegistrationMessage(message)
    - _Requirements: 1.1_

  - [x] 11.4 Wire slash commands to interactionCreate event
    - Route interaction.commandName to corresponding command module
    - Handle command errors gracefully
    - _Requirements: All slash command requirements_

- [x] 12. Integration and final wiring
  - [x] 12.1 Connect all components
    - Ensure registration handler calls group manager
    - Ensure group manager updates VC counter
    - Ensure all commands call appropriate handlers
    - Ensure all handlers call logger and DM engine
    - _Requirements: All integration requirements_

  - [x] 12.2 Write integration tests for registration flow
    - Test: Post registration message → verify confirmed embed → verify group assignment → verify DM sent → verify VC counter updated

  - [x] 12.3 Write integration tests for cancellation flow
    - Test: Cancel squad → verify embed edited → verify roles removed → verify group listing updated → verify DM sent

  - [x] 12.4 Write integration tests for edit flow
    - Test: Edit squad + confirm → verify DB updated → verify embeds updated → verify DM sent

  - [x] 12.5 Write integration tests for match flow
    - Test: Assign match → start match → declare winner → verify all DB updates and DMs

- [x] 13. Final checkpoint - Ensure all tests pass
  - Run all unit tests, property tests, and integration tests
  - Verify all 27 requirements covered
  - Verify all 41 correctness properties validated
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties from the design document
- Integration tests validate end-to-end flows
- The implementation uses JavaScript (Node.js) with discord.js v14 and better-sqlite3
- All Discord channel IDs, role IDs, and emoji IDs are hardcoded as specified in the design
- The bot uses a single SQLite database file for all persistence
- All embeds use the specified color scheme for consistency
- The DM engine includes retry logic to handle delivery failures gracefully
- AutoMod rules are enforced automatically without manual intervention
