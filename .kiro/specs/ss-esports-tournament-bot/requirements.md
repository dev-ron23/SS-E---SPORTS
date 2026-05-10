# Requirements Document

## Introduction

The SS E-Sports Tournament Bot is a production-ready Discord bot for managing the full lifecycle of a Free Fire tournament on the **SS E – SPORTS** Discord server. It covers player registration, duplicate detection, role assignment, automatic group formation, match room management, winner declaration, moderation, DM notifications, data export, and comprehensive action logging. The bot is built in Node.js using discord.js v14 and persists all state in a local SQLite database via better-sqlite3.

---

## Glossary

- **Bot**: The SS E-Sports Tournament Bot Discord application.
- **Registration_Handler**: The component that processes incoming registration messages in the registration channel.
- **Parser**: The `utils/parser.js` module that extracts team name, player mentions, and game UIDs from free-form text.
- **DB**: The SQLite database managed by `database/db.js` using better-sqlite3.
- **Squad**: A registered team consisting of 2–5 players (2–4 mandatory + 1 optional) identified by a unique `SSE-XXXX` ID.
- **Leader**: The Discord user designated as the squad's team leader.
- **Player**: Any Discord user who is a member of a registered squad.
- **Group**: A collection of up to 12 squads assigned to a dedicated Discord text channel and role.
- **Group_Manager**: The `handlers/groups.js` component that creates and manages group channels and roles.
- **Match_Manager**: The `handlers/matches.js` component that handles room assignment, match start, and winner declaration.
- **Mod_System**: The `handlers/moderation.js` component that handles muting, warning, removal, and AutoMod enforcement.
- **AutoMod**: The automated moderation subsystem that detects and acts on spam, mention abuse, and caps abuse.
- **DM_Engine**: The `utils/dmEngine.js` module that dispatches Discord DMs with retry logic.
- **Embed_Builder**: The `utils/embedBuilder.js` module that constructs all branded Discord embeds.
- **Logger**: The `utils/logger.js` module that writes action records to the designated log channel and terminal.
- **Exporter**: The `utils/exporter.js` module that generates CSV and TXT exports of squad data.
- **Action_Log_Channel**: Discord channel `1502222823672774706` where all moderation and admin actions are recorded.
- **Registration_Channel**: Discord channel `1502217324059431064` where players post registration messages.
- **Confirmed_Squads_Channel**: Discord channel `1502217351897288847` where confirmed squad embeds are posted.
- **VC_Counter_Channel**: Discord voice channel `1502217617522425966` whose name displays the current active squad count.
- **Group_Category**: Discord category `1502223431645794355` under which group channels are created.
- **Registered_Role**: Discord role `1502219695791538226` assigned to all players in active squads.
- **Slash_Command**: A Discord application command registered via the REST API and invoked with `/`.
- **Sync_Command**: The `$sync` prefix command that registers all slash commands with the Discord REST API.

---

## Requirements

### Requirement 1: Registration Message Parsing

**User Story:** As a tournament participant, I want to register my squad by posting a message in the registration channel, so that my team is enrolled in the tournament without needing a specific rigid format.

#### Acceptance Criteria

1. WHEN a message is posted in the Registration_Channel, THE Parser SHALL extract the team name, all player Discord mentions, and any game UIDs present in the message content.
2. WHEN the Parser processes a registration message, THE Parser SHALL accept team name prefixes in the forms `Team Name:`, `Team:`, or equivalent case-insensitive variants followed by a separator.
3. WHEN the Parser processes a registration message, THE Parser SHALL extract all `<@USER_ID>` and `<@!USER_ID>` mention formats as player references.
4. WHEN the Parser processes a registration message, THE Parser SHALL extract game UIDs appearing in the form `UID: <number>` or `UID- <number>` (case-insensitive) and associate each UID with the nearest preceding player mention.
5. WHEN the Parser encounters duplicate mentions in a single message, THE Parser SHALL deduplicate them and retain only the first occurrence.
6. IF the Parser cannot extract a team name from the message, THEN THE Registration_Handler SHALL treat the message as invalid.
7. IF the Parser extracts fewer than 2 distinct player mentions from the message, THEN THE Registration_Handler SHALL treat the message as invalid.
8. WHEN a registration message contains between 2 and 5 distinct player mentions, THE Parser SHALL accept all of them as valid squad members.

---

### Requirement 2: Registration Validation and Duplicate Detection

**User Story:** As a tournament organizer, I want the bot to automatically reject duplicate registrations, so that each player can only belong to one active squad at a time.

#### Acceptance Criteria

1. WHEN a valid registration is parsed, THE Registration_Handler SHALL query the DB to check whether any of the mentioned players already belong to an active squad.
2. IF any player in the registration already belongs to an active squad, THEN THE Registration_Handler SHALL react to the registration message with the ❌ animated emoji `<a:animatedCross:1438443052170608793>`.
3. IF any player in the registration already belongs to an active squad, THEN THE Registration_Handler SHALL send a branded embed in the Registration_Channel identifying the duplicate player and their existing squad ID.
4. IF the registration message is invalid (missing team name or fewer than 2 players), THEN THE Registration_Handler SHALL react to the message with the ❌ animated emoji and take no further action.
5. WHILE registration is locked, THE Registration_Handler SHALL reject all new registration messages without processing them.

---

### Requirement 3: Squad Confirmation and Persistence

**User Story:** As a tournament participant, I want my squad to be confirmed and saved when my registration is valid, so that my team is officially enrolled and visible to everyone.

#### Acceptance Criteria

1. WHEN a registration passes validation and duplicate checks, THE Registration_Handler SHALL react to the registration message with the ✅ animated emoji `<a:rga_tick1:1407368712402767952>`.
2. WHEN a registration is confirmed, THE Registration_Handler SHALL assign the Registered_Role to every player mentioned in the registration.
3. WHEN a registration is confirmed, THE DB SHALL persist a new squad record with a unique `SSE-XXXX` squad ID, sequential squad number, team name, leader ID, player IDs, player UIDs, registration timestamp, and status `active`.
4. WHEN a registration is confirmed, THE DB SHALL persist a player record for each squad member containing their Discord ID, squad ID, game UID (if provided), and role (`leader` or `player`).
5. WHEN a registration is confirmed, THE Embed_Builder SHALL construct a registration-confirmed embed using color `#00FF7F` and THE Registration_Handler SHALL post it to the Confirmed_Squads_Channel.
6. WHEN a registration is confirmed, THE DM_Engine SHALL send a registration-success DM embed to every player in the squad.
7. WHEN a registration is confirmed, THE Registration_Handler SHALL update the VC_Counter_Channel name to reflect the current total count of active squads.
8. THE DB SHALL generate squad IDs in the format `SSE-` followed by the squad number zero-padded to four digits (e.g., `SSE-0001`, `SSE-0042`).

---

### Requirement 4: Automatic Group Assignment

**User Story:** As a tournament organizer, I want squads to be automatically distributed into groups of up to 12, so that match scheduling is organized without manual effort.

#### Acceptance Criteria

1. WHEN a squad is confirmed, THE Group_Manager SHALL assign it to a group number calculated as `Math.ceil(squad_no / 12)`.
2. WHEN a squad is assigned to a group whose channel does not yet exist, THE Group_Manager SHALL create a new text channel named `group-{group_no}` under the Group_Category.
3. WHEN a new group channel is created, THE Group_Manager SHALL create a corresponding Discord role named `Group {group_no}` and configure the channel so only that role can view it.
4. WHEN a squad is assigned to a group, THE Group_Manager SHALL assign the group role to all players in that squad.
5. WHEN a squad is assigned to a group, THE Group_Manager SHALL post or update the squad listing embed in the group channel.
6. WHEN a squad is assigned to a group, THE DB SHALL update the squad record with the assigned group number and the group channel message ID.
7. THE Group_Manager SHALL ensure no group contains more than 12 squads at any time.
8. THE Group_Manager SHALL ensure every active squad belongs to exactly one group.

---

### Requirement 5: Registration Cancellation

**User Story:** As a tournament organizer, I want to cancel a squad's registration using a slash command, so that withdrawn teams are cleanly removed from all tournament records and channels.

#### Acceptance Criteria

1. WHEN an admin invokes `/cancel_reg` with a valid `squad_id`, THE Bot SHALL update the squad's status to `cancelled` in the DB.
2. WHEN a registration is cancelled, THE Bot SHALL remove the Registered_Role from all players in the cancelled squad.
3. WHEN a registration is cancelled, THE Bot SHALL edit the squad's embed in the Confirmed_Squads_Channel to display a cancellation notice using color `#FF0000`.
4. WHEN a registration is cancelled, THE Bot SHALL remove the squad's listing from its group channel and update the group listing.
5. WHEN a registration is cancelled, THE Bot SHALL remove the group role from all players in the cancelled squad.
6. WHEN a registration is cancelled, THE DM_Engine SHALL send a cancellation DM embed to every player in the cancelled squad.
7. WHEN a registration is cancelled, THE Logger SHALL record the cancellation action to the Action_Log_Channel.
8. IF `/cancel_reg` is invoked with a `squad_id` that does not exist in the DB, THEN THE Bot SHALL respond with an ephemeral error message.

---

### Requirement 6: Edit Registration

**User Story:** As a tournament organizer, I want to edit an existing squad's registration details via a slash command with a confirmation step, so that corrections can be made safely with admin approval.

#### Acceptance Criteria

1. WHEN an admin invokes `/edit_reg` with `previous_team_name`, `new_team_name`, `leader`, and `new_format`, THE Bot SHALL parse the `new_format` string using the same Parser used for registration messages.
2. WHEN `/edit_reg` is invoked, THE Embed_Builder SHALL construct an edit-preview embed using color `#FFA500` showing the old and new squad data side by side.
3. WHEN `/edit_reg` is invoked, THE DM_Engine SHALL send the edit-preview embed to the invoking admin with a ✅ Confirm button and a ❌ Reject button.
4. WHEN the admin clicks the ✅ Confirm button, THE Bot SHALL update the squad and player records in the DB with the new data.
5. WHEN the admin clicks the ✅ Confirm button, THE Bot SHALL edit the squad's embed in the Confirmed_Squads_Channel to reflect the updated data using color `#00BFFF`.
6. WHEN the admin clicks the ✅ Confirm button, THE Bot SHALL edit the squad's listing in the group channel to reflect the updated data.
7. WHEN the admin clicks the ✅ Confirm button, THE DM_Engine SHALL send a registration-updated DM to the squad leader.
8. WHEN the admin clicks the ✅ Confirm button, THE Logger SHALL record the edit action to the Action_Log_Channel.
9. WHEN the admin clicks the ❌ Reject button, THE Bot SHALL send a DM to the admin confirming that no changes were made.
10. WHEN the admin clicks the ❌ Reject button, THE Logger SHALL record the rejection action to the Action_Log_Channel.
11. IF `/edit_reg` is invoked with a `previous_team_name` that does not match any active squad, THEN THE Bot SHALL respond with an ephemeral error message.

---

### Requirement 7: Manual Squad Addition

**User Story:** As a tournament organizer, I want to manually add a squad via a slash command, so that teams registered outside the normal flow can still be enrolled.

#### Acceptance Criteria

1. WHEN an admin invokes `/add_squad` with `team_name`, `leader`, and `format`, THE Bot SHALL parse the `format` string using the Parser.
2. WHEN `/add_squad` produces a valid parse result, THE Bot SHALL create a new squad record in the DB following the same confirmation flow as an automatic registration.
3. WHEN `/add_squad` creates a squad, THE Bot SHALL post a confirmed embed to the Confirmed_Squads_Channel and assign the Registered_Role to all players.
4. WHEN `/add_squad` creates a squad, THE Group_Manager SHALL assign the squad to the appropriate group.
5. IF the `format` string in `/add_squad` fails validation (fewer than 2 players), THEN THE Bot SHALL respond with an ephemeral error message describing the issue.

---

### Requirement 8: Player and Leader Lookup

**User Story:** As a tournament organizer, I want to look up a player's or leader's registration details via slash commands, so that I can quickly verify participation status.

#### Acceptance Criteria

1. WHEN an admin invokes `/check_player` with a `user`, THE Bot SHALL query the DB for the player's squad membership, game UID, warning count, and mute status.
2. WHEN `/check_player` finds a record, THE Embed_Builder SHALL construct a player-info embed and THE Bot SHALL reply with it (ephemeral).
3. IF `/check_player` finds no record for the specified user, THEN THE Bot SHALL reply with an ephemeral message stating the player is not registered.
4. WHEN an admin invokes `/check_leader` with a `leader`, THE Bot SHALL query the DB for the squad led by that user, including all squad members and group assignment.
5. WHEN `/check_leader` finds a record, THE Embed_Builder SHALL construct a leader-info embed and THE Bot SHALL reply with it (ephemeral).
6. IF `/check_leader` finds no squad led by the specified user, THEN THE Bot SHALL reply with an ephemeral message stating no squad was found.

---

### Requirement 9: Data Export

**User Story:** As a tournament organizer, I want to export all squad data as CSV and TXT files, so that I can use the data in external tools or share it with stakeholders.

#### Acceptance Criteria

1. WHEN an admin invokes `/export_squad`, THE Exporter SHALL generate a CSV file containing all active squads with all fields populated (squad ID, squad number, team name, leader ID, player IDs, player UIDs, group number, registration timestamp).
2. WHEN an admin invokes `/export_squad`, THE Exporter SHALL generate a TXT file containing the same squad data in a human-readable format.
3. WHEN `/export_squad` completes, THE Bot SHALL attach both the CSV file and the TXT file to the command response.
4. THE Exporter SHALL include exactly all active squads and no cancelled squads in the export output.

---

### Requirement 10: Match Room Assignment

**User Story:** As a tournament organizer, I want to assign a match room ID and password to a group, so that players in that group receive their match credentials automatically.

#### Acceptance Criteria

1. WHEN an admin invokes `/assign_match` with `group_no`, `room_id`, and `room_password`, THE Match_Manager SHALL store the room ID and password against the group record in the DB.
2. WHEN a match is assigned, THE Embed_Builder SHALL construct a match-assigned embed using color `#9B59B6` containing the room ID and password.
3. WHEN a match is assigned, THE DM_Engine SHALL send the match-assigned embed to every player in the specified group.
4. WHEN a match is assigned, THE Logger SHALL record the assignment action to the Action_Log_Channel.
5. IF `/assign_match` is invoked with a `group_no` that does not exist in the DB, THEN THE Bot SHALL respond with an ephemeral error message.

---

### Requirement 11: Match Start

**User Story:** As a tournament organizer, I want to officially start a match for a group, so that players are notified and the match timestamp is recorded.

#### Acceptance Criteria

1. WHEN an admin invokes `/start_match` with a `group_no`, THE Match_Manager SHALL record the match start timestamp in the DB for that group.
2. WHEN a match is started, THE DM_Engine SHALL send a match-start notification DM to every player in the specified group.
3. WHEN a match is started, THE Logger SHALL record the start action to the Action_Log_Channel.
4. IF `/start_match` is invoked for a group that has no assigned room, THEN THE Bot SHALL respond with an ephemeral error message.

---

### Requirement 12: Winner Declaration

**User Story:** As a tournament organizer, I want to declare the winner of a group match, so that results are recorded and the winning squad is publicly recognized.

#### Acceptance Criteria

1. WHEN an admin invokes `/winner` with a `format` string and a `channel`, THE Match_Manager SHALL parse the format to identify the winning squad and their placement position.
2. WHEN a winner is declared, THE DB SHALL update the squad record with the winner position and update the match record with the winning squad ID.
3. WHEN a winner is declared, THE Embed_Builder SHALL construct a winner embed using color `#FFD700`.
4. WHEN a winner is declared, THE Bot SHALL post the winner embed in the specified group channel.
5. WHEN a winner is declared, THE DM_Engine SHALL send a winner-notification DM to all players in the winning squad.
6. WHEN a winner is declared, THE Logger SHALL record the declaration action to the Action_Log_Channel.

---

### Requirement 13: Registration Lock

**User Story:** As a tournament organizer, I want to lock registrations when the tournament roster is full, so that no new squads can be added after the cutoff.

#### Acceptance Criteria

1. WHEN an admin invokes `/lock_reg`, THE Bot SHALL set the `registration_locked` flag to `1` in the DB settings table.
2. WHEN `/lock_reg` is invoked, THE Embed_Builder SHALL construct a lock-registration embed using color `#8B00FF` and THE Bot SHALL post it in the Registration_Channel.
3. WHILE registration is locked, THE Registration_Handler SHALL reject all new registration messages and react with ❌.
4. WHEN `/lock_reg` is invoked, THE Logger SHALL record the lock action to the Action_Log_Channel.

---

### Requirement 14: Broadcast and Direct Message Commands

**User Story:** As a tournament organizer, I want to send announcements to all registered players or to a specific player via DM, so that important information reaches participants directly.

#### Acceptance Criteria

1. WHEN an admin invokes `/broadcast` with a `message`, THE DM_Engine SHALL send a broadcast DM embed using color `#7289DA` to every player in every active squad.
2. WHEN an admin invokes `/dm` with a `user` and `description`, THE DM_Engine SHALL send a direct DM embed using color `#7289DA` to the specified user only.
3. WHEN `/broadcast` completes, THE Bot SHALL reply to the admin with a confirmation of how many DMs were sent.
4. WHEN `/dm` completes, THE Bot SHALL reply to the admin with a confirmation that the DM was sent.
5. IF the DM_Engine fails to deliver a DM after retries, THE DM_Engine SHALL log the failure to the terminal without crashing the bot.

---

### Requirement 15: Player Moderation — Mute and Unmute

**User Story:** As a tournament moderator, I want to mute and unmute players, so that disruptive participants can be silenced in group channels.

#### Acceptance Criteria

1. WHEN a moderator invokes `/mute_player` with a `user` and optional `reason`, THE Mod_System SHALL apply a Discord timeout or permission override to prevent the user from sending messages in their group channel.
2. WHEN a player is muted, THE DB SHALL update the player's `is_muted` flag to `1`.
3. WHEN a player is muted, THE DM_Engine SHALL send a mute-notification DM embed to the muted player.
4. WHEN a player is muted, THE Logger SHALL record the mute action with the moderator's ID and reason to the Action_Log_Channel.
5. WHEN a moderator invokes `/unmute_player` with a `user`, THE Mod_System SHALL restore the user's messaging permissions in their group channel.
6. WHEN a player is unmuted, THE DB SHALL update the player's `is_muted` flag to `0`.
7. WHEN a player is unmuted, THE Logger SHALL record the unmute action to the Action_Log_Channel.

---

### Requirement 16: Player Moderation — Warnings

**User Story:** As a tournament moderator, I want to issue warnings to players, so that repeated rule violations result in automatic consequences.

#### Acceptance Criteria

1. WHEN a moderator invokes `/warn_player` with a `user` and `reason`, THE Mod_System SHALL increment the player's warning count in the DB by 1.
2. WHEN a warning is issued, THE Embed_Builder SHALL construct a warn embed and THE DM_Engine SHALL send it to the warned player.
3. WHEN a warning is issued, THE Logger SHALL record the warning action with the reason to the Action_Log_Channel.
4. WHEN a player's warning count reaches 3, THE Mod_System SHALL automatically remove the player from their group (revoke group role and update DB).
5. WHEN a player is auto-removed due to 3 warnings, THE Logger SHALL record the auto-removal action to the Action_Log_Channel.

---

### Requirement 17: Remove Player from Group

**User Story:** As a tournament moderator, I want to manually remove a player from a group, so that disqualified or withdrawn players are cleanly removed from group channels.

#### Acceptance Criteria

1. WHEN a moderator invokes `/remove_from_group` with a `user` and `group_no`, THE Mod_System SHALL revoke the group role from the specified user.
2. WHEN a player is removed from a group, THE DB SHALL update the group record to reflect the removal.
3. WHEN a player is removed from a group, THE Logger SHALL record the removal action to the Action_Log_Channel.
4. IF `/remove_from_group` is invoked for a user who is not in the specified group, THEN THE Bot SHALL respond with an ephemeral error message.

---

### Requirement 18: Clear Registration Chat

**User Story:** As a tournament moderator, I want to bulk-clear the registration channel, so that the channel is clean between registration phases.

#### Acceptance Criteria

1. WHEN a moderator invokes `/clear_reg_chat`, THE Mod_System SHALL delete all messages in the Registration_Channel.
2. WHEN `/clear_reg_chat` completes, THE Logger SHALL record the clear action with the moderator's ID to the Action_Log_Channel.
3. WHEN `/clear_reg_chat` completes, THE Bot SHALL reply to the moderator with an ephemeral confirmation of how many messages were deleted.

---

### Requirement 19: AutoMod System

**User Story:** As a tournament organizer, I want the bot to automatically detect and act on spam and abuse in the server, so that moderation is enforced consistently without manual intervention.

#### Acceptance Criteria

1. WHEN a user sends 5 or more messages within a 3-second window, THE AutoMod SHALL automatically mute the user for 10 minutes and issue 1 warning.
2. WHEN a message contains 3 or more user mentions, THE AutoMod SHALL delete the message and issue 1 warning to the sender.
3. WHEN a message contains more than 70% uppercase characters and is longer than 10 characters, THE AutoMod SHALL delete the message and issue 1 warning to the sender.
4. WHEN a user makes repeated registration attempts after already being registered, THE AutoMod SHALL react to the message with ❌ and issue 1 warning.
5. WHEN AutoMod takes any action, THE Logger SHALL record the automated action to the Action_Log_Channel.

---

### Requirement 20: DM Notification Engine

**User Story:** As a tournament participant, I want to receive Discord DMs for all actions that affect my registration, so that I am always informed of my tournament status.

#### Acceptance Criteria

1. THE DM_Engine SHALL send DMs for the following events: registration confirmed, registration cancelled, registration edited, match assigned, match started, winner declared, player muted, player warned, and broadcast messages.
2. WHEN the DM_Engine attempts to send a DM and the user has DMs disabled, THE DM_Engine SHALL retry the delivery up to 3 times before logging the failure.
3. WHEN the DM_Engine fails to deliver a DM after all retries, THE DM_Engine SHALL log the failure to the terminal and continue processing remaining DMs without crashing.
4. THE DM_Engine SHALL use the Embed_Builder to construct all DM embeds with the correct color for each event type.

---

### Requirement 21: Action Logging

**User Story:** As a tournament organizer, I want all admin and moderation actions to be logged to a dedicated channel, so that there is a complete audit trail of all bot activity.

#### Acceptance Criteria

1. THE Logger SHALL post an embed to the Action_Log_Channel for every admin and moderation action performed by the bot.
2. WHEN logging an action, THE Logger SHALL include the action type, the actor's Discord ID, the target's Discord ID (if applicable), a description of the action, and the UTC timestamp.
3. THE Logger SHALL also write all actions to the terminal using structured log levels (INFO, WARN, ERROR).
4. IF the Logger fails to post to the Action_Log_Channel, THE Logger SHALL write the failure to the terminal and continue without crashing the bot.

---

### Requirement 22: Slash Command Registration ($sync)

**User Story:** As a bot administrator, I want to register all slash commands with Discord via a prefix command, so that commands are available in the server without manual API calls.

#### Acceptance Criteria

1. WHEN a bot administrator sends the message `$sync` in any channel, THE Bot SHALL register all defined slash commands with the Discord REST API for the configured guild.
2. WHEN `$sync` completes successfully, THE Bot SHALL reply with a confirmation message listing the number of commands registered.
3. IF `$sync` fails due to a Discord API error, THE Bot SHALL reply with an error message containing the failure reason.

---

### Requirement 23: VC Counter Channel

**User Story:** As a tournament participant, I want to see the current number of registered squads in a voice channel name, so that I can track registration progress at a glance.

#### Acceptance Criteria

1. WHEN the count of active squads changes (registration confirmed or cancelled), THE Bot SHALL update the VC_Counter_Channel name to display the current active squad count.
2. THE Bot SHALL format the VC_Counter_Channel name as a human-readable label including the squad count (e.g., `✅ Registered: 24`).

---

### Requirement 24: Confirmed Squads Channel Embeds

**User Story:** As a tournament participant, I want to see a live list of confirmed squads in a dedicated channel, so that I can verify my registration and see who else has registered.

#### Acceptance Criteria

1. WHEN a squad is confirmed, THE Bot SHALL post a new embed in the Confirmed_Squads_Channel containing the squad ID, team name, leader mention, all player mentions, and a hyperlink back to the original registration message.
2. WHEN a squad's registration is edited and confirmed, THE Bot SHALL edit the existing embed in the Confirmed_Squads_Channel to reflect the updated data.
3. WHEN a squad's registration is cancelled, THE Bot SHALL edit the existing embed in the Confirmed_Squads_Channel to display a cancellation notice.
4. THE Embed_Builder SHALL include a jump URL (hyperlink to the original registration message) in every confirmed-squad embed.

---

### Requirement 25: Bot Presence

**User Story:** As a server member, I want the bot to display a streaming presence status, so that it appears active and professional in the member list.

#### Acceptance Criteria

1. WHEN the Bot starts up, THE Bot SHALL set its Discord presence to "Streaming" activity type with a configured stream URL and status text.
2. THE Bot SHALL maintain the streaming presence continuously while it is online.

---

### Requirement 26: Database Integrity and Persistence

**User Story:** As a tournament organizer, I want all tournament data to be reliably persisted in a local SQLite database, so that no data is lost if the bot restarts.

#### Acceptance Criteria

1. THE DB SHALL create all required tables (`squads`, `players`, `groups_table`, `matches`, `action_logs`, `settings`) on startup if they do not already exist.
2. WHEN the Bot restarts, THE DB SHALL retain all previously persisted squad, player, group, match, and log records.
3. THE DB SHALL enforce a foreign key constraint between the `players` table and the `squads` table.
4. THE DB SHALL enforce uniqueness of `squad_id` in the `squads` table and uniqueness of `squad_no` in the `squads` table.
5. THE DB SHALL enforce a composite primary key of `(discord_id, squad_id)` in the `players` table to prevent duplicate player-squad records.

---

### Requirement 27: Embed Color Scheme Consistency

**User Story:** As a server member, I want all bot embeds to use a consistent color scheme, so that I can immediately recognize the type of notification from its color.

#### Acceptance Criteria

1. THE Embed_Builder SHALL use color `#00FF7F` for registration-confirmed embeds.
2. THE Embed_Builder SHALL use color `#FF0000` for registration-cancelled embeds.
3. THE Embed_Builder SHALL use color `#FFA500` for edit-pending (preview) embeds.
4. THE Embed_Builder SHALL use color `#00BFFF` for edit-confirmed embeds.
5. THE Embed_Builder SHALL use color `#9B59B6` for match-assigned embeds.
6. THE Embed_Builder SHALL use color `#FFD700` for winner-declared embeds.
7. THE Embed_Builder SHALL use color `#7289DA` for admin broadcast and DM embeds.
8. THE Embed_Builder SHALL use color `#FF4444` for error and warning embeds.
9. THE Embed_Builder SHALL use color `#8B00FF` for lock-registration embeds.
