/**
 * Hand-authored emoji clues for the solo bot.
 *
 * These do double duty, and both jobs pull in the same direction:
 *
 *  1. They are what the bot PLAYS. A bot that built its clues by looking up
 *     emoji for the words in its prompt would produce exactly the literal
 *     "type the answer as a picture" clue the whole game is designed to punish
 *     (see scoring.ts) — fine for a demo nobody looks at twice, useless as a
 *     showcase. So they're written by hand, to the same bar as
 *     docs/content-guidelines.md sets for prompts.
 *  2. They are what the bot GUESSES WITH. The bot never sees an answer it
 *     hasn't earned — it gets the same role-filtered RoomView a browser does —
 *     so to guess a human's clue it scores the emoji it can see against these,
 *     pack by pack. Two variants per answer widen that vocabulary, which is why
 *     they aren't just flavour: a second reading of a title is a second set of
 *     emoji the bot can recognise a human reaching for.
 *
 * Every entry's `answer` must match a PROMPT_DATABASE answer exactly (the
 * seeder and the dealer key prompts by answer), and every clue must pass
 * `validateClue` — no letter emoji, and no number emoji for an answer that
 * contains a digit. `bot-clues.test.ts` enforces both, plus the ≥24-per-pack
 * floor that packs.test.ts holds the prompt library to.
 */

export interface BotClueEntry {
  /** Canonical answer, matching PROMPT_DATABASE exactly. */
  answer: string;
  /** Playable clues, most-preferred first. Each is 1–10 single emoji. */
  clues: string[][];
}

export const BOT_CLUES: BotClueEntry[] = [
  // ── Disney ────────────────────────────────────────────────────────────────
  { answer: 'Finding Nemo', clues: [['🔍', '🐠', '🌊', '🐢', '🦈'], ['🤿', '🐡', '🌊', '👨‍👦', '🪸']] },
  { answer: 'The Lion King', clues: [['🦁', '👑', '🌅', '🐗', '🐒'], ['🦁', '☠️', '👑', '🌍', '🎶']] },
  { answer: 'Aladdin', clues: [['🧞‍♂️', '🪔', '🐵', '🏜️', '🧿'], ['🪄', '🐅', '👳', '🫖', '💍']] },
  { answer: 'Beauty and the Beast', clues: [['🌹', '🐗', '🏰', '📚', '🕯️'], ['💃', '🍽️', '🪞', '🌹', '⏳']] },
  { answer: 'Cinderella', clues: [['👠', '🎃', '🧹', '🕛', '👸'], ['🐭', '🧚', '👗', '🕰️', '🥿']] },
  { answer: 'Frozen', clues: [['❄️', '👭', '⛄', '🦌', '🏰'], ['🥶', '👸', '🧊', '🎶', '🌨️']] },
  { answer: 'Snow White and the Seven Dwarfs', clues: [['🍎', '👸', '⛏️', '🌲', '😴'], ['🪞', '🧙‍♀️', '🍏', '💤', '💋']] },
  { answer: 'The Little Mermaid', clues: [['🧜‍♀️', '🦀', '🐙', '🔱', '🐚'], ['🌊', '👣', '🎤', '🦑', '💋']] },
  { answer: 'Toy Story', clues: [['🤠', '🚀', '🧸', '👦', '🪖'], ['👽', '🐷', '🦖', '🎁', '🎲']] },
  { answer: 'Mary Poppins', clues: [['☂️', '🧹', '🎩', '🥄', '🎠'], ['👩‍🏫', '🌬️', '🧳', '🐧', '🎵']] },
  { answer: 'Ratatouille', clues: [['🐀', '👨‍🍳', '🍲', '🗼', '🍷'], ['🐭', '🥘', '🇫🇷', '👃', '⭐']] },
  { answer: 'The Nightmare Before Christmas', clues: [['🎃', '🎅', '💀', '🌙', '🎁'], ['👻', '🎄', '🧵', '🦇', '😱']] },
  { answer: 'Up', clues: [['🎈', '🏠', '👴', '🐕', '🌄'], ['🎈', '🗺️', '🦜', '👦', '☁️']] },
  { answer: 'WALL-E', clues: [['🤖', '🗑️', '🌍', '🚀', '🌱'], ['🤖', '❤️', '🛰️', '♻️', '🪴']] },
  { answer: 'Inside Out', clues: [['😊', '😢', '😡', '😨', '🧠'], ['🧠', '🎛️', '💭', '👧', '🌈']] },
  { answer: '101 Dalmatians', clues: [['🐶', '⚫', '⚪', '👗', '🚗'], ['🐕', '🖤', '🤍', '👵', '🐾']] },
  { answer: 'Alice in Wonderland', clues: [['🐰', '⏰', '🫖', '🍄', '👧'], ['🕳️', '🐛', '👑', '🃏', '🍰']] },
  { answer: 'Coco', clues: [['💀', '🎸', '🌺', '🇲🇽', '👴'], ['💀', '🕯️', '🎶', '🌉', '📸']] },
  { answer: 'Lady and the Tramp', clues: [['🐕', '🍝', '🐩', '🌙', '🎻'], ['🍽️', '🐶', '❤️', '🐾', '🇮🇹']] },
  { answer: 'Lilo & Stitch', clues: [['👽', '🌺', '🏄', '🏝️', '👧'], ['🛸', '🌈', '🍍', '👭', '🚀']] },
  { answer: 'Moana', clues: [['🌊', '🛶', '🐷', '🐓', '🏝️'], ['🌺', '💚', '🗿', '🪝', '🌀']] },
  { answer: 'Monsters, Inc.', clues: [['👹', '👁️', '🚪', '😱', '🏭'], ['👾', '👧', '🚪', '🔵', '😂']] },
  { answer: 'Mulan', clues: [['⚔️', '🐉', '🇨🇳', '👩', '🏹'], ['🦗', '🪖', '🌸', '🐴', '🪞']] },
  { answer: 'Pinocchio', clues: [['🪵', '👃', '🐋', '⭐', '🎻'], ['🤥', '🧒', '🦗', '🐳', '🪄']] },
  { answer: 'Sleeping Beauty', clues: [['😴', '👸', '🧚', '🏰', '🌹'], ['🪡', '💤', '🐉', '💋', '👑']] },
  { answer: 'Tangled', clues: [['💇‍♀️', '🗼', '🏮', '🍳', '🦎'], ['👸', '💛', '🔦', '🐴', '🎨']] },
  { answer: 'The Incredibles', clues: [['🦸', '👨‍👩‍👧‍👦', '🎭', '💪', '🚗'], ['🦸‍♀️', '🧵', '🏝️', '👶', '💥']] },
  { answer: 'Bambi', clues: [['🦌', '🌲', '🦋', '🔫', '🌸'], ['🦌', '🐰', '🦨', '❄️', '😢']] },
  { answer: 'Cars', clues: [['🏎️', '🏁', '🛣️', '🏆', '🚦'], ['🚗', '👀', '🏜️', '🛞', '⚡']] },
  { answer: 'Dumbo', clues: [['🐘', '👂', '🪶', '🎪', '🐭'], ['🐘', '🎈', '🤹', '😢', '🚂']] },
  { answer: 'Hercules', clues: [['💪', '⚡', '🏛️', '🐎', '🔥'], ['🦸', '🏺', '☁️', '🐍', '⭐']] },
  { answer: 'The Princess and the Frog', clues: [['👸', '🐸', '💋', '🎺', '🐊'], ['🍽️', '🌙', '🎷', '🪄', '🌿']] },
  { answer: 'Zootopia', clues: [['🐰', '🦊', '🏙️', '👮', '🦥'], ['🐇', '🚓', '🥕', '🦁', '🕵️']] },
  { answer: 'Big Hero 6', clues: [['🤖', '🦸', '🎌', '🧪', '❤️'], ['🎈', '👦', '🥋', '🏙️', '💥']] },

  // ── Fairy Tales & Rhymes ──────────────────────────────────────────────────
  { answer: 'Old MacDonald Had a Farm', clues: [['👴', '🚜', '🐄', '🐖', '🐔'], ['🌾', '🐑', '🦆', '🎶', '🏡']] },
  { answer: 'Goldilocks and the Three Bears', clues: [['👧', '🐻', '🥣', '🪑', '🛏️'], ['👱‍♀️', '🍯', '🏠', '😴', '🥄']] },
  { answer: 'Jack and the Beanstalk', clues: [['🫘', '🌱', '☁️', '🏰', '👹'], ['🐄', '🪓', '🥚', '🐔', '🧗']] },
  { answer: 'Little Red Riding Hood', clues: [['🔴', '🧕', '🐺', '🧺', '🌲'], ['👵', '🛏️', '🍰', '🪓', '👀']] },
  { answer: 'The Three Little Pigs', clues: [['🐷', '🏠', '🧱', '🌬️', '🐺'], ['🐖', '🌾', '🪵', '😤', '🔥']] },
  { answer: 'Humpty Dumpty', clues: [['🥚', '🧱', '💥', '🐴', '👑'], ['🥚', '🤕', '👑', '🧩', '😢']] },
  { answer: 'Itsy Bitsy Spider', clues: [['🕷️', '🧗', '💧', '🌈', '☀️'], ['🕸️', '🌧️', '🚿', '🔁', '🎵']] },
  { answer: 'Mary Had a Little Lamb', clues: [['👧', '🐑', '🏫', '🤍', '🚶'], ['🐏', '🎒', '📚', '😳', '👩‍🏫']] },
  { answer: 'The Tortoise and the Hare', clues: [['🐢', '🐇', '🏁', '😴', '🏆'], ['🐢', '🐰', '🏃', '⏳', '🥇']] },
  { answer: 'The Wheels on the Bus', clues: [['🚌', '🔁', '🛞', '👶', '🏙️'], ['🚍', '🎶', '🚪', '👨‍✈️', '🔄']] },
  { answer: 'Baa Baa Black Sheep', clues: [['🐑', '🖤', '🧶', '🎒', '👦'], ['🐏', '🌑', '🧵', '🙋', '🎵']] },
  { answer: 'Twinkle Twinkle Little Star', clues: [['⭐', '✨', '💎', '🌌', '❓'], ['🌟', '🔭', '🌙', '😴', '🎶']] },
  { answer: 'Row Row Row Your Boat', clues: [['🚣', '🌊', '😄', '💭', '🎶'], ['🚣‍♀️', '💤', '🏞️', '😊', '🔁']] },
  { answer: 'Hansel and Gretel', clues: [['👦', '👧', '🍞', '🌲', '🍬'], ['🏠', '🍭', '🧙‍♀️', '🔥', '🐦']] },
  { answer: 'Little Miss Muffet', clues: [['👧', '🥣', '🕷️', '😱', '🪑'], ['🍮', '🕸️', '🏃‍♀️', '😨', '🥛']] },
  { answer: 'Rapunzel', clues: [['👸', '💇', '🗼', '🧗', '🧙‍♀️'], ['💛', '🏰', '✂️', '🤴', '🌙']] },
  { answer: 'Three Blind Mice', clues: [['🐭', '🕶️', '🔪', '🏃', '👩‍🌾'], ['🐁', '🦯', '😱', '🧑‍🌾', '🎶']] },
  { answer: 'Five Little Monkeys', clues: [['🐒', '🛏️', '🤕', '📞', '👩‍⚕️'], ['🙈', '🛌', '💥', '😱', '🎵']] },
  { answer: 'Hickory Dickory Dock', clues: [['🐁', '🕰️', '🧗', '😱', '🔔'], ['🐭', '⏰', '🏃', '🎶', '🪜']] },
  { answer: 'London Bridge Is Falling Down', clues: [['🌉', '🇬🇧', '💥', '👸', '🧱'], ['🏙️', '🌊', '🔨', '👑', '🎶']] },
  { answer: 'The Frog Prince', clues: [['🐸', '👑', '💋', '👸', '🌊'], ['🐸', '🤴', '🪄', '💍', '🫅']] },
  { answer: 'The Gingerbread Man', clues: [['🍪', '🏃', '🦊', '👵', '🔥'], ['🧑‍🍳', '🍞', '😋', '🐺', '🏃‍♂️']] },
  { answer: 'The Ugly Duckling', clues: [['🦆', '😢', '🦢', '🪞', '💔'], ['🐥', '👎', '❄️', '🌸', '✨']] },
  { answer: 'The Boy Who Cried Wolf', clues: [['👦', '🐺', '📣', '🐑', '🤥'], ['🧒', '😱', '🙉', '🐕', '😭']] },
  { answer: "The Emperor's New Clothes", clues: [['👑', '🧵', '🪡', '🙈', '👶'], ['🫅', '🚶', '😳', '👀', '🧥']] },
  { answer: 'Head, Shoulders, Knees and Toes', clues: [['👤', '💪', '🦵', '🦶', '👂'], ['🙆', '👀', '👃', '👄', '🎵']] },
  { answer: "If You're Happy and You Know It", clues: [['😀', '👏', '🎶', '🦶', '🙌'], ['😄', '🤝', '🕺', '🎵', '😁']] },
  { answer: 'Jack and Jill', clues: [['👦', '👧', '⛰️', '🪣', '💧'], ['🧒', '🚰', '🤕', '🏃', '💦']] },
  { answer: 'Ring Around the Rosie', clues: [['💍', '🌹', '💐', '🤧', '🔄'], ['👧', '🕺', '🌸', '😷', '🍂']] },
  { answer: 'Rock-a-Bye Baby', clues: [['👶', '🌳', '🌬️', '🛏️', '💤'], ['🍼', '🪺', '😴', '🎵', '😱']] },
  { answer: 'This Little Piggy', clues: [['🐷', '🦶', '🏠', '🥩', '😭'], ['🐖', '🛒', '🦶', '🏡', '🎶']] },
  { answer: 'Hey Diddle Diddle', clues: [['🐈', '🎻', '🐄', '🌙', '🥄'], ['🐕', '😂', '🍽️', '🏃', '🌛']] },
  { answer: 'Chicken Little', clues: [['🐥', '☁️', '😱', '🌰', '🌍'], ['🐔', '💥', '🏃', '📣', '🍂']] },
  { answer: 'Little Bo-Peep', clues: [['👧', '🐑', '❓', '🪝', '😢'], ['👩‍🌾', '🐏', '🔍', '💤', '🌾']] },

  // ── Children's Movies ─────────────────────────────────────────────────────
  { answer: 'Despicable Me', clues: [['🦹', '🌙', '💛', '👧', '🚀'], ['🥼', '😈', '🍌', '👨‍👧‍👧', '🔫']] },
  { answer: 'E.T. the Extra-Terrestrial', clues: [['👽', '🚲', '🌕', '📞', '🏠'], ['🛸', '👦', '🤚', '✨', '🌲']] },
  { answer: 'Kung Fu Panda', clues: [['🐼', '🥋', '🥢', '🐉', '🏯'], ['🐻', '👊', '🍜', '🐍', '🧘']] },
  { answer: 'The Super Mario Bros. Movie', clues: [['🍄', '👨‍🔧', '🐢', '👸', '🏰'], ['🪠', '🎮', '🐉', '🎬', '🍄']] },
  { answer: 'Ice Age', clues: [['🧊', '🦣', '🦥', '🌰', '🐿️'], ['🥶', '🐘', '🦦', '🌍', '🧗']] },
  { answer: 'Minions', clues: [['💛', '🥽', '🍌', '👖', '🦹'], ['👀', '😂', '🧑‍🔬', '💊', '🎉']] },
  { answer: 'Shrek', clues: [['👹', '🏰', '🐴', '🧅', '💚'], ['🧌', '🐸', '👸', '🪵', '💍']] },
  { answer: 'How the Grinch Stole Christmas', clues: [['💚', '🎄', '😠', '🐕', '🎁'], ['🏔️', '🎅', '🤫', '❤️', '🎀']] },
  { answer: 'Jumanji', clues: [['🎲', '🥁', '🦏', '🌴', '🐒'], ['🎮', '🦁', '🌿', '⏳', '🕹️']] },
  { answer: 'Willy Wonka & the Chocolate Factory', clues: [['🍫', '🎫', '🏭', '🎩', '🫐'], ['🍬', '👦', '🛗', '🐿️', '🌈']] },
  { answer: 'Hotel Transylvania', clues: [['🏨', '🧛', '👻', '🐺', '🎃'], ['🦇', '👸', '💀', '🧳', '😱']] },
  { answer: 'How to Train Your Dragon', clues: [['🐉', '🪓', '🛡️', '🏝️', '👦'], ['🐲', '🐟', '🤝', '🌊', '⚔️']] },
  { answer: 'Puss in Boots', clues: [['🐱', '🥾', '🗡️', '🎩', '😿'], ['🐈', '👢', '🥚', '🐺', '🧡']] },
  { answer: 'Sonic the Hedgehog', clues: [['🦔', '💙', '💨', '💍', '🏃'], ['⚡', '🎮', '🌀', '🏁', '🥼']] },
  { answer: 'The Lego Movie', clues: [['🧱', '🤠', '🏗️', '🌈', '🦇'], ['🟨', '🔨', '🚀', '👷', '🎶']] },
  { answer: 'The Secret Life of Pets', clues: [['🐕', '🐈', '🤫', '🏙️', '🐰'], ['🦜', '🏠', '🚪', '🐾', '🎉']] },
  { answer: 'The Spongebob Squarepants Movie', clues: [['🧽', '🍔', '🌊', '⭐', '🩳'], ['🦀', '🐙', '🏝️', '🎬', '🫧']] },
  { answer: 'The Smurfs', clues: [['💙', '🍄', '🧙‍♂️', '🐈', '🏘️'], ['🔵', '👒', '🌲', '😺', '🎵']] },
  { answer: 'Madagascar', clues: [['🦁', '🦓', '🦒', '🦛', '🏝️'], ['🐧', '🚢', '🕺', '🌴', '🎪']] },
  { answer: 'Night at the Museum', clues: [['🏛️', '🌙', '🦖', '🗿', '🔦'], ['🦕', '👮', '🕰️', '🐒', '✨']] },
  { answer: 'Sing', clues: [['🎤', '🐨', '🐷', '🐘', '🎭'], ['🎶', '🦍', '🏆', '🎹', '🐭']] },
  { answer: 'The Karate Kid', clues: [['🥋', '👦', '🧙‍♂️', '🪰', '🏆'], ['👊', '🚗', '🧽', '🦩', '⛩️']] },
  { answer: 'Alvin and the Chipmunks', clues: [['🐿️', '🎤', '🎵', '🎄', '👨'], ['🐹', '🎸', '🎧', '😆', '🍰']] },
  { answer: 'The Boss Baby', clues: [['👶', '💼', '👔', '🍼', '🏢'], ['🐶', '👦', '📈', '😠', '🕴️']] },
  { answer: 'Trolls', clues: [['🧌', '🌈', '💇', '🎶', '🤗'], ['💖', '✨', '🎤', '🍰', '💃']] },
  { answer: 'Shrek 2', clues: [['👹', '👑', '🐱', '🧚', '🍸'], ['🧌', '💍', '🏰', '🐴', '👸']] },
  { answer: 'Cloudy with a Chance of Meatballs', clues: [['☁️', '🍝', '🌧️', '🍔', '🏝️'], ['🍕', '⛈️', '🧑‍🔬', '🌭', '🏘️']] },
  { answer: 'Detective Pikachu', clues: [['🕵️', '⚡', '🐭', '🎩', '🏙️'], ['🔍', '🟡', '🎮', '☕', '🤝']] },
  { answer: 'Happy Feet', clues: [['🐧', '🦶', '💃', '❄️', '🎶'], ['🕺', '🧊', '🐟', '🎤', '😀']] },
  { answer: 'Paddington', clues: [['🐻', '🧥', '🎩', '🍊', '🇬🇧'], ['🧳', '🚉', '🥪', '☂️', '🇵🇪']] },
  { answer: 'The Lego Batman Movie', clues: [['🧱', '🦇', '🦸', '🌃', '😎'], ['🟨', '🃏', '🏙️', '👨‍✈️', '💥']] },
  { answer: 'The Lorax', clues: [['🌳', '🥸', '🧡', '🪓', '🌱'], ['🌲', '🐟', '🐻', '🏭', '💨']] },
  { answer: 'The Polar Express', clues: [['🚂', '❄️', '🎅', '🎟️', '🔔'], ['🚄', '🧭', '☕', '🌌', '🎄']] },
  { answer: 'Wonka', clues: [['🍫', '🎩', '🏭', '🪄', '🎶'], ['🍬', '🌈', '🎪', '👦', '✨']] },
];

/** Every answer the bot has a clue for. */
export const BOT_CLUE_ANSWERS: ReadonlySet<string> = new Set(BOT_CLUES.map((e) => e.answer));

export function botCluesFor(answer: string): string[][] | undefined {
  return BOT_CLUES.find((e) => e.answer === answer)?.clues;
}
