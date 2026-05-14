#[calimero_sdk::app::event]
pub enum Event<'a> {
    /// A new game session was created or renamed.
    GameCreated { id: &'a str, name: &'a str },
    /// A player created a character.
    CharacterCreated { id: &'a str, name: &'a str },
    /// A chat message or system message was posted to the log.
    MessagePosted {},
    /// A dice roll was made (player ability check or NPC roll).
    RollMade { id: &'a str, total: u32 },
    /// A character's HP was adjusted by the DM.
    HPAdjusted { character_id: &'a str, hp: u32 },
    /// The DM changed the game state (e.g. "exploring", "combat", "resting").
    GameStateChanged { state: &'a str },
    /// The DM advanced the turn order.
    TurnAdvanced { player: &'a str },
    /// The DM set a difficulty class for the current challenge.
    DifficultySet { dc: u32 },
}
