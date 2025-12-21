/**
 * Inspiration Seed - Provides random word seeds to break LLM entropy traps
 * 
 * Uses a large English dictionary (~370k words) to inject variety into LLM prompts.
 * Words are interpreted abstractly for fantasy context - the LLM extracts essence,
 * not literal meaning.
 * 
 * Example: "microwave" → warmth, transformation, hidden energy
 */

// Embedded word list - a curated subset for faster loading
// This is a fallback; ideally we'd load the full dictionary
const FALLBACK_WORDS = [
    // Abstract concepts
    'aberration', 'absence', 'abundance', 'abyss', 'accord', 'ache', 'acrid',
    'adrift', 'affliction', 'aftermath', 'agony', 'alchemy', 'allegiance', 'allure',
    'amalgam', 'ambush', 'ancient', 'anguish', 'anomaly', 'antique', 'apparition',
    'arcane', 'ardor', 'arid', 'armor', 'artifact', 'ascent', 'ash', 'asylum',
    'atrophy', 'aura', 'austere', 'avarice', 'awakening', 'awe', 'axis',
    // Nature
    'barren', 'basalt', 'beacon', 'beast', 'bellow', 'bile', 'bittersweet',
    'blaze', 'blight', 'bloom', 'bone', 'bramble', 'breach', 'breath', 'brew',
    'brittle', 'bronze', 'brood', 'burden', 'burial', 'burnished',
    // Emotions/States
    'calamity', 'calcified', 'calm', 'canker', 'captive', 'carrion', 'cascade',
    'catalyst', 'cavernous', 'cessation', 'chain', 'chalice', 'chamber', 'chaos',
    'char', 'chasm', 'chill', 'cipher', 'circlet', 'clamor', 'clarity', 'cleft',
    'cloister', 'coagulate', 'coil', 'collapse', 'combustion', 'communion',
    'confluence', 'contagion', 'contempt', 'convergence', 'conviction', 'copper',
    'corrode', 'corruption', 'covenant', 'cradle', 'crag', 'craven', 'crescent',
    'crest', 'crimson', 'crypt', 'crystal', 'curse', 'cycle',
    // More abstract
    'damnation', 'dank', 'dawn', 'decay', 'deceit', 'decree', 'deep', 'defiance',
    'delirium', 'deluge', 'demise', 'density', 'desolate', 'despair', 'destiny',
    'devotion', 'devouring', 'dew', 'dim', 'discord', 'dissolution', 'distant',
    'divine', 'domain', 'dominion', 'doom', 'dormant', 'doubt', 'dread', 'dream',
    'drift', 'drought', 'dusk', 'dust', 'dwelling', 'dynasty',
    // Elements
    'earth', 'echo', 'eclipse', 'edifice', 'effigy', 'ember', 'embers', 'embrace',
    'emergence', 'empire', 'enclave', 'endless', 'enigma', 'enthrall', 'entropy',
    'ephemeral', 'epoch', 'equilibrium', 'erosion', 'eruption', 'essence', 'eternal',
    'ether', 'ethos', 'exile', 'exodus', 'exorcism', 'expanse', 'extinction',
    // Fantasy-adjacent
    'facade', 'fading', 'fallow', 'famine', 'fangs', 'fate', 'fathom', 'feast',
    'fervor', 'fetid', 'fever', 'fissure', 'flame', 'flesh', 'flicker', 'flood',
    'flux', 'fog', 'folly', 'font', 'forbidden', 'forge', 'forsaken', 'fortitude',
    'fossil', 'fracture', 'fragment', 'frail', 'frenzy', 'frost', 'fuel', 'fugue',
    'fulcrum', 'fume', 'funeral', 'furnace', 'fury', 'fusion',
    // G-H
    'gale', 'gallows', 'garden', 'gargoyle', 'gasp', 'gate', 'gather', 'genesis',
    'ghost', 'gild', 'glacier', 'gloom', 'glory', 'glyph', 'gnaw', 'gold', 'gore',
    'gossamer', 'grace', 'granite', 'grave', 'greed', 'grief', 'grim', 'grind',
    'grip', 'grotto', 'grove', 'growth', 'grudge', 'guardian', 'guest', 'guilt',
    'gust', 'gut', 'hallowed', 'halo', 'harbinger', 'harmony', 'harvest', 'haunt',
    'haven', 'haze', 'hearth', 'heat', 'heir', 'heresy', 'heritage', 'hermit',
    'hidden', 'hierarch', 'hoard', 'hollow', 'holocaust', 'holy', 'homage', 'horde',
    'horizon', 'horror', 'host', 'howl', 'hull', 'humble', 'hunger', 'hunt', 'husk',
    // I-K
    'ice', 'icon', 'idol', 'ignite', 'illusion', 'immolate', 'immortal', 'impale',
    'incantation', 'incarnate', 'incense', 'incision', 'indigo', 'infection',
    'inferno', 'infinity', 'inheritance', 'inquisition', 'inscription', 'insidious',
    'instinct', 'intricate', 'intrusion', 'invasion', 'inverse', 'invoke', 'iron',
    'isolation', 'ivory', 'jade', 'jagged', 'jaw', 'jest', 'jewel', 'journey',
    'judgement', 'junction', 'jungle', 'keen', 'keeper', 'kernel', 'key', 'kindle',
    'kingdom', 'kinship', 'knell', 'knight', 'knot', 'knowledge',
    // L-M
    'labyrinth', 'lament', 'lance', 'lantern', 'lapse', 'lash', 'latent', 'lattice',
    'lavish', 'layer', 'leaden', 'legacy', 'legend', 'legion', 'lens', 'leviathan',
    'lichen', 'light', 'limbo', 'lineage', 'liquid', 'litany', 'locus', 'lone',
    'loom', 'lord', 'lore', 'loss', 'lotus', 'lucid', 'lull', 'lumen', 'luminous',
    'lure', 'lurk', 'lust', 'luster', 'luxury', 'macabre', 'maelstrom', 'mage',
    'magma', 'magnitude', 'malice', 'mandate', 'mane', 'manifest', 'manor',
    'mantle', 'marble', 'march', 'mark', 'marrow', 'marsh', 'martyr', 'mask',
    'mass', 'mast', 'master', 'maze', 'meadow', 'measure', 'mechanism', 'meditate',
    'melancholy', 'melody', 'membrane', 'memorial', 'menace', 'mercy', 'meridian',
    'mesh', 'metal', 'metamorphosis', 'meteor', 'miasma', 'midnight', 'migration',
    'mineral', 'minion', 'mirror', 'mist', 'molten', 'monarch', 'monolith',
    'monument', 'moon', 'moor', 'morass', 'morbid', 'mortal', 'moss', 'moth',
    'mountain', 'mourn', 'murk', 'murmur', 'muse', 'musk', 'mute', 'mutation', 'myth',
    // N-O
    'nadir', 'nascent', 'nature', 'nectar', 'needle', 'nemesis', 'nerve', 'nest',
    'nexus', 'night', 'nimbus', 'noble', 'nocturnal', 'node', 'nomad', 'null',
    'numb', 'oath', 'obelisk', 'obsidian', 'occult', 'ocean', 'ode', 'odor',
    'offering', 'oil', 'omen', 'omniscient', 'onyx', 'ooze', 'opaque', 'oracle',
    'orbit', 'order', 'ore', 'origin', 'ornate', 'orphan', 'ossify', 'outcast',
    'overflow', 'overlord', 'oxidize', 'oxygen',
    // P-Q
    'pact', 'pagan', 'pain', 'pale', 'pallid', 'palm', 'panacea', 'pantheon',
    'paradigm', 'paradise', 'paradox', 'parasite', 'parch', 'pariah', 'passage',
    'passion', 'path', 'patience', 'patriarch', 'pattern', 'peace', 'peak', 'pearl',
    'peat', 'penance', 'pendulum', 'penitent', 'peril', 'perish', 'perpetual',
    'pestilence', 'petrify', 'phantom', 'phoenix', 'phosphor', 'pierce', 'pilgrim',
    'pillar', 'pinnacle', 'pit', 'pitch', 'pivot', 'plague', 'plasm', 'plateau',
    'plight', 'plunder', 'plunge', 'poison', 'polar', 'pollen', 'pool', 'portal',
    'portent', 'possession', 'praxis', 'prayer', 'precipice', 'predator', 'preserve',
    'primal', 'prime', 'prism', 'prison', 'pristine', 'procession', 'profane',
    'prophecy', 'prophet', 'prow', 'prowl', 'pulse', 'pungent', 'puppet', 'purgatory',
    'purity', 'purpose', 'pyre', 'quake', 'quarantine', 'quarry', 'quartz', 'quest',
    'quicksand', 'quill', 'quintessence',
    // R-S
    'radiance', 'rage', 'rain', 'rampart', 'rancid', 'rapture', 'raven', 'ravine',
    'raw', 'realm', 'reaper', 'rebellion', 'rebirth', 'reckoning', 'recluse',
    'redemption', 'reflection', 'refuge', 'regal', 'relic', 'reliquary', 'remnant',
    'remorse', 'render', 'renewal', 'requiem', 'residue', 'resilience', 'resonance',
    'respite', 'restoration', 'resurrection', 'retribution', 'revelation', 'revenant',
    'reverence', 'rift', 'rime', 'ripple', 'ritual', 'river', 'roar', 'rogue',
    'root', 'rot', 'ruin', 'rune', 'rupture', 'rust', 'ruthless', 'sacred',
    'sacrifice', 'saga', 'sage', 'salt', 'salvation', 'sanctum', 'sand', 'sanguine',
    'sap', 'sapphire', 'sarcophagus', 'saturation', 'savage', 'scale', 'scar',
    'scarlet', 'scatter', 'scavenger', 'scheme', 'schism', 'scorn', 'scourge',
    'scroll', 'seal', 'sear', 'sediment', 'seek', 'seep', 'sentinel', 'sepulcher',
    'seraph', 'serenity', 'serpent', 'sever', 'shade', 'shadow', 'shard', 'shatter',
    'shell', 'shelter', 'shimmer', 'shrine', 'shroud', 'siege', 'sigil', 'silence',
    'silk', 'silver', 'sin', 'sinew', 'siphon', 'siren', 'skeleton', 'skull',
    'slaughter', 'slave', 'sleep', 'slime', 'slither', 'slumber', 'smolder', 'snow',
    'solace', 'solar', 'sole', 'solemn', 'solitary', 'solstice', 'solution', 'soot',
    'sorcery', 'sorrow', 'soul', 'source', 'sovereign', 'spark', 'spawn', 'specter',
    'spell', 'sphere', 'sphinx', 'spire', 'spirit', 'splinter', 'spoil', 'spore',
    'spring', 'spur', 'stagnant', 'stain', 'stake', 'stalactite', 'stalk', 'star',
    'starvation', 'static', 'statue', 'steam', 'steel', 'steep', 'stellar', 'stem',
    'stench', 'stigma', 'stillness', 'sting', 'stone', 'storm', 'strand', 'strangle',
    'stratum', 'stream', 'strength', 'strife', 'strike', 'structure', 'struggle',
    'sublime', 'submersion', 'substance', 'subtle', 'succumb', 'suffocate', 'sulfur',
    'summit', 'summon', 'sun', 'surge', 'surplus', 'survival', 'suspend', 'swamp',
    'swarm', 'sway', 'swell', 'swift', 'symbol', 'symmetry', 'synthesis',
    // T-Z
    'taint', 'talisman', 'tangle', 'tapestry', 'tar', 'tarnish', 'tear', 'tempest',
    'temple', 'tendon', 'tendril', 'tension', 'terminus', 'terrain', 'terror',
    'testament', 'texture', 'thaw', 'thorn', 'threshold', 'throne', 'tide', 'timber',
    'time', 'titan', 'token', 'tomb', 'tongue', 'torment', 'torpor', 'torrent',
    'torture', 'totem', 'touch', 'tower', 'toxin', 'trace', 'tradition', 'trail',
    'transcend', 'transformation', 'transit', 'transmutation', 'trap', 'trauma',
    'traverse', 'treasure', 'tremble', 'trial', 'tribe', 'tribute', 'trickle',
    'trigger', 'trinity', 'triumph', 'trophy', 'trove', 'truth', 'tumult', 'tunnel',
    'turbid', 'turmoil', 'twilight', 'twist', 'tyrant', 'umbra', 'uncharted',
    'undead', 'underworld', 'unearth', 'unrest', 'upheaval', 'urge', 'urn', 'usurp',
    'vacuum', 'vale', 'valor', 'vampire', 'vanish', 'vapor', 'vault', 'veil',
    'vein', 'vendetta', 'venom', 'vermillion', 'vessel', 'vestige', 'vex', 'vibration',
    'vigil', 'vigor', 'vine', 'vintage', 'violet', 'viper', 'virtue', 'viscera',
    'viscous', 'vision', 'vitality', 'vitriol', 'void', 'volatile', 'volcano',
    'volition', 'vortex', 'vow', 'vulture', 'wail', 'wander', 'wane', 'warden',
    'warmth', 'warning', 'warp', 'warren', 'waste', 'watch', 'water', 'wave', 'wax',
    'wealth', 'weapon', 'weather', 'weave', 'web', 'weed', 'weight', 'weird', 'well',
    'welt', 'whisper', 'wick', 'wild', 'will', 'wilt', 'wind', 'winter', 'wisdom',
    'wither', 'witness', 'woe', 'wolf', 'wonder', 'wood', 'worm', 'worship', 'wound',
    'wraith', 'wrath', 'wreath', 'wreck', 'wrest', 'writhe', 'wyrd', 'yawn', 'yearn',
    'yield', 'yoke', 'zenith', 'zephyr', 'zero', 'zodiac', 'zone'
];

// Word list (loaded from dictionary or fallback)
let wordList: string[] = FALLBACK_WORDS;
let isLoaded = false;

/**
 * Load the full English dictionary from URL
 */
export async function loadDictionary(): Promise<void> {
    if (isLoaded) return;

    try {
        const response = await fetch('https://raw.githubusercontent.com/dwyl/english-words/master/words_dictionary.json');
        const data = await response.json();
        wordList = Object.keys(data);
        isLoaded = true;
        console.log(`[InspirationSeed] Loaded ${wordList.length} words from dictionary`);
    } catch (error) {
        console.warn('[InspirationSeed] Failed to load dictionary, using fallback:', error);
        wordList = FALLBACK_WORDS;
        isLoaded = true;
    }
}

/**
 * Get a random inspiration word
 */
export function getInspirationSeed(seed?: number): string {
    const index = seed !== undefined
        ? Math.abs(seed) % wordList.length
        : Math.floor(Math.random() * wordList.length);
    return wordList[index];
}

/**
 * Get the inspiration prompt instruction for LLM
 */
export function getInspirationPrompt(word: string): string {
    return `
[INSPIRATION SEED: "${word}"]
This is a soft creative inspiration, NOT a requirement.
Interpret abstractly for a fantasy dungeon setting.
If the word seems modern, extract its essence:
- "telephone" → distant communication, voices across void
- "algorithm" → ritualistic patterns, mechanical precision
- "static" → frozen energy, suspended animation
Do NOT include modern technology literally. Let the word inspire mood and atmosphere.`;
}

/**
 * Get a complete inspiration context for a room collapse
 */
export function getInspirationContext(roomId: string): { word: string; prompt: string } {
    // Use room ID hash for deterministic word selection
    const hash = roomId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const word = getInspirationSeed(hash + Date.now()); // Add timestamp for variety
    return {
        word,
        prompt: getInspirationPrompt(word)
    };
}

/**
 * Get word count
 */
export function getWordCount(): number {
    return wordList.length;
}
