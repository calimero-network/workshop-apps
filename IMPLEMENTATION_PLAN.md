# Implementation Plan

App: dnd-online-table
Summary: Real-time collaborative D&D table: shared chat, DM-managed dice rolls, turn tracking, and live game log

## Backend (logic/src/lib.rs)
- [x] Define entity: [table] Character (id:String, author:String, name:String, class:String, strength:u8, dexterity:u8, constitution:u8, intelligence:u8, wisdom:u8, charisma:u8, hp_current:u32, hp_max:u32, created_at:u64)
- [x] Define entity: [table] GameSession (id:String, dm_id:String, name:String, game_state:String, current_dc:Option<u32>, current_turn_player:Option<String>, created_at:u64)
- [x] Define entity: [table] TableEvent (id:String, author:String, event_type:String, timestamp:u64, content:String, ability:Option<String>, d20_roll:Option<u32>, modifier:Option<i32>, total:Option<u32>)
- [x] Implement mutate: [table] create_character(name: String, class: String, str: u8, dex: u8, con: u8, int: u8, wis: u8, cha: u8) → app::Result<String>
- [x] Implement view: [table] get_my_character() → app::Result<Character>
- [x] Implement mutate: [table] create_game(name: String) → app::Result<String>
- [x] Implement mutate: [table] invite_player(player_id: String) → app::Result<()>
- [x] Implement mutate: [table] post_message(text: String) → app::Result<String>
- [x] Implement mutate: [table] roll_for_player(player_id: String, ability: String, reason: String) → app::Result<String>
- [x] Implement mutate: [table] roll_npc(npc_name: String, modifier: i32, reason: String) → app::Result<String>
- [x] Implement mutate: [table] set_difficulty(dc: u32) → app::Result<()>
- [x] Implement mutate: [table] adjust_hp(character_id: String, delta: i32) → app::Result<()>
- [x] Implement mutate: [table] set_game_state(state: String) → app::Result<()>
- [x] Implement mutate: [table] set_turn_order(players: Vec<String>) → app::Result<()>
- [x] Implement mutate: [table] advance_turn() → app::Result<()>
- [x] Implement view: [table] get_game_log() → app::Result<Vec<TableEvent>>
- [x] Implement view: [table] get_game_info() → app::Result<GameSession>
- [x] Implement view: [table] get_all_characters() → app::Result<Vec<Character>>

## Frontend (app/)
- [x] Screen: GameLobby — Create game, invite players, view active tables
- [x] Screen: CharacterSheet — Create and view character stats, HP, ability scores
- [x] Screen: Table — Live chat + game log, character roster with HP, turn tracker, DM control panel (roll buttons, set DC, adjust HP, manage turns, change state)
- [x] Apply designTheme tokens

## Verification
- [x] cargo build --target wasm32-unknown-unknown succeeds
- [x] tsc --noEmit passes
- [x] Test story (player): create a D&D character with name, class, and ability scores
- [x] Test story (DM): create a game and invite players to the table
- [x] Test story (anyone at the table): chat with the group in a shared message feed
- [x] Test story (player): describe what my character is doing (attack, climb, persuade, etc.)
- [x] Test story (DM): roll a d20 for a player's ability and see their modifier automatically applied
- [x] Test story (DM): roll dice for NPCs and monsters
- [x] Test story (DM): set the difficulty (DC) for rolls and judge whether players succeed
- [x] Test story (DM): manage turn order and control whose turn it is in combat
- [x] Test story (DM): adjust character HP and manage game state (exploring, combat, resting)
- [x] Test story (anyone at the table): see all messages, rolls, and game events in one live feed
- [x] Augment test/spec-smoke.workflow.yml with mutate-method round-trip steps
