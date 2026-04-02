const RAW_MODEL_3D_CATALOG = [
  { category: 'creatures', file: 'Wolf.glb', prompt: 'A fierce grey wolf in an aggressive stance, stylized fantasy', aliases: ['wolf'] },
  { category: 'creatures', file: 'Giant_Rat.glb', prompt: 'A giant rat, mangy and scarred, dark fantasy creature', aliases: ['giant rat', 'rat'] },
  { category: 'creatures', file: 'Zombie.glb', prompt: 'A shambling zombie in tattered medieval clothing, dark fantasy', aliases: ['zombie', 'undead'] },
  { category: 'creatures', file: 'Skeleton_Warrior.glb', prompt: 'A skeletal warrior holding a rusted sword and shield, fantasy undead', aliases: ['skeleton', 'skeleton warrior'] },
  { category: 'creatures', file: 'Orc.glb', prompt: 'A muscular green orc with tusks wearing leather armor, Warhammer fantasy', aliases: ['orc'] },
  { category: 'creatures', file: 'Goblin.glb', prompt: 'A small goblin with a dagger and ragged clothes, dark fantasy', aliases: ['goblin'] },
  { category: 'creatures', file: 'Ogre.glb', prompt: 'A massive ogre with a wooden club, scarred skin, fantasy brute', aliases: ['ogre'] },
  { category: 'creatures', file: 'Troll.glb', prompt: 'A large cave troll with mossy skin and a stone club, dark fantasy', aliases: ['troll'] },
  { category: 'creatures', file: 'Giant_Spider.glb', prompt: 'A giant hairy spider, dark dungeon creature, fantasy', aliases: ['spider', 'giant spider'] },
  { category: 'creatures', file: 'Bat_Swarm.glb', prompt: 'A bat swarm cluster, dark cave creatures, fantasy', aliases: ['bat', 'bat swarm'] },
  { category: 'creatures', file: 'Warhorse.glb', prompt: 'A brown saddled warhorse with barding, medieval fantasy', aliases: ['warhorse'] },
  { category: 'creatures', file: 'Horse.glb', prompt: 'A simple brown horse with saddle, medieval traveler horse', aliases: ['horse'] },
  { category: 'creatures', file: 'Swamp_Serpent.glb', prompt: 'A venomous swamp serpent, green scales, coiled and hissing', aliases: ['serpent', 'swamp serpent'] },
  { category: 'creatures', file: 'Chaos_Daemon.glb', prompt: 'A chaos daemon with horns and fiery skin, Warhammer dark fantasy', aliases: ['daemon', 'demon', 'chaos daemon'] },
  { category: 'creatures', file: 'Werewolf.glb', prompt: 'A werewolf mid-transformation, dark fantasy horror', aliases: ['werewolf'] },
  { category: 'creatures', file: 'Griffon.glb', prompt: 'A griffon with eagle head and lion body, heraldic fantasy', aliases: ['griffon', 'griffin'] },
  { category: 'creatures', file: 'Wyvern.glb', prompt: 'A wyvern perched on a rock, dark green scales, fantasy dragon-like', aliases: ['wyvern'] },
  { category: 'creatures', file: 'Rat_Swarm.glb', prompt: 'A swarm of rats on the ground, dozens of small rats clustered together', aliases: ['rat swarm'] },

  { category: 'characters', file: 'Human_Warrior_Male.glb', prompt: 'A medieval human male warrior in plate armor with a longsword, Warhammer fantasy', aliases: ['human male warrior', 'soldier', 'fighter'] },
  { category: 'characters', file: 'Human_Warrior_Female.glb', prompt: 'A medieval human female warrior in chainmail with a shield, fantasy', aliases: ['human female warrior'] },
  { category: 'characters', file: 'Human_Mage_Male.glb', prompt: 'A human male wizard in dark blue robes with a glowing staff, Warhammer fantasy', aliases: ['human male mage', 'wizard'] },
  { category: 'characters', file: 'Human_Mage_Female.glb', prompt: 'A human female wizard in purple robes holding a spellbook, dark fantasy', aliases: ['human female mage'] },
  { category: 'characters', file: 'Human_Rogue_Male.glb', prompt: 'A human male rogue in dark leather armor with twin daggers, hooded, fantasy', aliases: ['human male rogue', 'thief'] },
  { category: 'characters', file: 'Human_Rogue_Female.glb', prompt: 'A human female rogue in dark leather with a crossbow, hooded, fantasy', aliases: ['human female rogue'] },
  { category: 'characters', file: 'Dwarf_Warrior.glb', prompt: 'A stout dwarf warrior with a great axe and heavy plate armor, long beard', aliases: ['dwarf warrior', 'dwarf'] },
  { category: 'characters', file: 'Dwarf_Female.glb', prompt: 'A dwarf female with braided hair and a warhammer, sturdy armor', aliases: ['dwarf female'] },
  { category: 'characters', file: 'Elf_Ranger.glb', prompt: 'A tall slender elf male ranger with a longbow, green cloak, fantasy', aliases: ['elf ranger', 'elf'] },
  { category: 'characters', file: 'Elf_Mage_Female.glb', prompt: 'A graceful elf female mage in silver robes with a crystal staff', aliases: ['elf mage', 'elf female mage'] },
  { category: 'characters', file: 'Halfling_Male.glb', prompt: 'A small halfling male with a sling and cooking pot, cheerful, fantasy', aliases: ['halfling male', 'halfling'] },
  { category: 'characters', file: 'Halfling_Female.glb', prompt: 'A small halfling female with an apron and rolling pin, plump, cozy', aliases: ['halfling female'] },
  { category: 'characters', file: 'Noble_Male.glb', prompt: 'A wealthy medieval noble man in red velvet doublet with gold trim', aliases: ['noble male', 'noble'] },
  { category: 'characters', file: 'Noble_Female.glb', prompt: 'A medieval noble woman in an elegant dress with jewelry, aristocratic', aliases: ['noble female'] },
  { category: 'characters', file: 'Merchant.glb', prompt: 'A fat medieval merchant with a coin purse and fine clothes', aliases: ['merchant', 'trader'] },
  { category: 'characters', file: 'Priest_Sigmar.glb', prompt: 'A Sigmarite priest in white robes with a warhammer and holy book', aliases: ['priest', 'sigmar priest'] },
  { category: 'characters', file: 'Town_Guard.glb', prompt: 'A medieval town guard in half-plate with a halberd and shield', aliases: ['town guard', 'guard'] },
  { category: 'characters', file: 'Blacksmith.glb', prompt: 'A medieval blacksmith with a leather apron, muscular, holding tongs', aliases: ['blacksmith', 'smith'] },
  { category: 'characters', file: 'Innkeeper.glb', prompt: 'A medieval innkeeper, portly, holding a tankard and rag', aliases: ['innkeeper', 'barkeep'] },
  { category: 'characters', file: 'Necromancer.glb', prompt: 'A hooded necromancer in black tattered robes with a skull staff', aliases: ['necromancer'] },
  { category: 'characters', file: 'Peasant.glb', prompt: 'A medieval peasant farmer in simple clothes with a pitchfork', aliases: ['peasant', 'farmer'] },
  { category: 'characters', file: 'Witch_Hunter.glb', prompt: 'A witch hunter in a wide-brimmed hat and long coat with pistol and rapier', aliases: ['witch hunter'] },

  { category: 'furniture', file: 'Table_Tavern.glb', prompt: 'A sturdy medieval wooden tavern table, rectangular, dark wood', aliases: ['table', 'tavern table'] },
  { category: 'furniture', file: 'Table_Round.glb', prompt: 'A round medieval wooden table with carved legs', aliases: ['round table'] },
  { category: 'furniture', file: 'Bench.glb', prompt: 'A simple medieval wooden bench, long, dark oak', aliases: ['bench'] },
  { category: 'furniture', file: 'Stool.glb', prompt: 'A three-legged wooden tavern stool, rustic', aliases: ['stool'] },
  { category: 'furniture', file: 'Bed.glb', prompt: 'A medieval straw-stuffed bed with a wooden frame and blanket', aliases: ['bed'] },
  { category: 'furniture', file: 'Bookshelf.glb', prompt: 'A large wooden bookshelf filled with old leather-bound books', aliases: ['bookshelf', 'shelf'] },
  { category: 'furniture', file: 'Fireplace.glb', prompt: 'A medieval stone fireplace with burning logs and iron grate', aliases: ['fireplace'] },
  { category: 'furniture', file: 'Fireplace_Grand.glb', prompt: 'A grand medieval stone fireplace with ornate mantelpiece, castle-style', aliases: ['grand fireplace'] },
  { category: 'furniture', file: 'Wardrobe.glb', prompt: 'A medieval wooden wardrobe, dark oak, iron hinges', aliases: ['wardrobe'] },
  { category: 'furniture', file: 'Writing_Desk.glb', prompt: 'A medieval writing desk with quill, inkwell and papers', aliases: ['desk', 'writing desk'] },
  { category: 'furniture', file: 'Throne.glb', prompt: 'A medieval wooden throne with red cushion and gold accents', aliases: ['throne'] },
  { category: 'furniture', file: 'Chandelier.glb', prompt: 'A medieval iron chandelier with candles, hanging from chains', aliases: ['chandelier'] },
  { category: 'furniture', file: 'Tapestry.glb', prompt: 'A decorative medieval tapestry hanging on a wall, heraldic design', aliases: ['tapestry'] },
  { category: 'furniture', file: 'Weapon_Rack.glb', prompt: 'A medieval wooden weapon rack with swords and shields displayed', aliases: ['weapon rack'] },
  { category: 'furniture', file: 'Pew.glb', prompt: 'A medieval pew, simple wooden church bench', aliases: ['pew'] },
  { category: 'furniture', file: 'Rug_Ornate.glb', prompt: 'A dark red ornate carpet rug with gold patterns, medieval fantasy', aliases: ['rug', 'ornate rug', 'carpet'] },

  { category: 'items', file: 'Sword.glb', prompt: 'A medieval longsword with leather-wrapped hilt, steel blade', aliases: ['sword', 'longsword'] },
  { category: 'items', file: 'Axe.glb', prompt: 'A medieval battle axe with wooden handle and iron head', aliases: ['axe', 'battle axe'] },
  { category: 'items', file: 'Bow_And_Quiver.glb', prompt: 'A wooden longbow with a leather quiver of arrows', aliases: ['bow', 'quiver'] },
  { category: 'items', file: 'Shield.glb', prompt: 'A medieval round wooden shield with iron boss and heraldic emblem', aliases: ['shield'] },
  { category: 'items', file: 'Crate.glb', prompt: 'A wooden medieval crate, nailed shut, travel-worn', aliases: ['crate'] },
  { category: 'items', file: 'Potion.glb', prompt: 'A glowing potion bottle, purple liquid, cork stopper, fantasy', aliases: ['potion'] },
  { category: 'items', file: 'Scroll.glb', prompt: 'An ancient rolled parchment scroll with wax seal, fantasy', aliases: ['scroll'] },
  { category: 'items', file: 'Coin_Pile.glb', prompt: 'A pile of gold coins on the ground, treasure, fantasy', aliases: ['coins', 'coin pile', 'gold'] },
  { category: 'items', file: 'Gem.glb', prompt: 'A sparkling gemstone, blue crystal, cut and polished, fantasy', aliases: ['gem', 'gemstone'] },
  { category: 'items', file: 'Backpack.glb', prompt: 'A leather adventurer backpack with buckles and pouches', aliases: ['backpack'] },
  { category: 'items', file: 'Skull.glb', prompt: 'A human skull on the ground, cracked, dark fantasy', aliases: ['skull'] },
  { category: 'items', file: 'Key_Iron.glb', prompt: 'A medieval iron key, large and ornate, dungeon-style', aliases: ['key', 'iron key'] },
  { category: 'items', file: 'Banner.glb', prompt: 'A medieval heraldic banner on a pole, red and gold, lion emblem', aliases: ['banner'] },
  { category: 'items', file: 'Ladder.glb', prompt: 'A medieval wooden ladder, simple construction, leaning', aliases: ['ladder'] },
  { category: 'items', file: 'Lantern.glb', prompt: 'An iron lantern with candle inside, medieval hanging style', aliases: ['lantern'] },
  { category: 'items', file: 'Satchel.glb', prompt: 'A medieval leather satchel bag, worn and travel-stained', aliases: ['satchel', 'bag'] },
  { category: 'items', file: 'Pistol.glb', prompt: 'A medieval flintlock pistol, ornate wooden grip, dark fantasy', aliases: ['pistol'] },
  { category: 'items', file: 'Crossbow.glb', prompt: 'A medieval crossbow, wooden stock, iron mechanism', aliases: ['crossbow'] },
  { category: 'items', file: 'Warhammer.glb', prompt: 'A medieval warhammer, iron head on a long wooden shaft', aliases: ['warhammer'] },
  { category: 'items', file: 'Bone_Pile.glb', prompt: 'A pile of old bones and skulls on dungeon floor, dark fantasy', aliases: ['bone pile', 'bones'] },

  { category: 'architecture', file: 'Door_Dungeon.glb', prompt: 'A heavy medieval iron-reinforced wooden door, dungeon style', aliases: ['dungeon door', 'door'] },
  { category: 'architecture', file: 'Door_Wooden.glb', prompt: 'A medieval wooden door with iron studs, tavern-style', aliases: ['wooden door'] },
  { category: 'architecture', file: 'Gate_Portcullis.glb', prompt: 'A large medieval castle iron portcullis gate', aliases: ['gate', 'portcullis'] },
  { category: 'architecture', file: 'Pillar_Stone.glb', prompt: 'A stone dungeon pillar, rough-hewn, medieval dark fantasy', aliases: ['pillar', 'stone pillar', 'column'] },
  { category: 'architecture', file: 'Column_Marble.glb', prompt: 'A tall marble column, classical style, temple architecture', aliases: ['marble column'] },
  { category: 'architecture', file: 'Well.glb', prompt: 'A medieval stone well with wooden bucket and rope', aliases: ['well'] },
  { category: 'architecture', file: 'Fountain.glb', prompt: 'A medieval town square stone fountain with water basin', aliases: ['fountain'] },
  { category: 'architecture', file: 'Signpost.glb', prompt: 'A medieval wooden signpost with two directional signs at a crossroads', aliases: ['signpost', 'sign'] },
  { category: 'architecture', file: 'Market_Stall.glb', prompt: 'A wooden medieval market stall with canvas awning', aliases: ['market stall', 'stall'] },
  { category: 'architecture', file: 'Bridge_Stone.glb', prompt: 'A medieval stone bridge, arched, moss-covered', aliases: ['stone bridge', 'bridge'] },
  { category: 'architecture', file: 'Barricade.glb', prompt: 'A medieval wooden barricade made of stakes and planks', aliases: ['barricade'] },
  { category: 'architecture', file: 'Prison_Bars.glb', prompt: 'A medieval prison cell iron bars gate, dungeon', aliases: ['prison bars', 'bars'] },
  { category: 'architecture', file: 'Staircase_Spiral.glb', prompt: 'A medieval stone staircase, spiral, going upward in a tower', aliases: ['spiral staircase', 'stairs'] },
  { category: 'architecture', file: 'Altar.glb', prompt: 'A stone religious altar with candles and offerings, medieval temple', aliases: ['altar'] },
  { category: 'architecture', file: 'Statue_Knight.glb', prompt: 'A medieval stone statue of a knight in armor, weathered', aliases: ['knight statue', 'statue'] },
  { category: 'architecture', file: 'Statue_Saint.glb', prompt: 'A medieval stone statue of a robed saint with outstretched hands', aliases: ['saint statue'] },
  { category: 'architecture', file: 'Anvil.glb', prompt: 'A medieval blacksmith anvil on a tree stump, iron tools nearby', aliases: ['anvil'] },
  { category: 'architecture', file: 'Dock.glb', prompt: 'A medieval wooden dock pier extending over water', aliases: ['dock', 'pier'] },

  { category: 'buildings', file: 'Tavern.glb', prompt: 'A medieval half-timbered tavern with a hanging sign, two stories', aliases: ['tavern'] },
  { category: 'buildings', file: 'Cottage.glb', prompt: 'A small medieval thatched-roof peasant cottage', aliases: ['cottage', 'hut'] },
  { category: 'buildings', file: 'Smithy.glb', prompt: 'A medieval blacksmith workshop with chimney and forge', aliases: ['smithy', 'forge'] },
  { category: 'buildings', file: 'Watchtower.glb', prompt: 'A medieval watchtower, stone base with wooden top', aliases: ['watchtower'] },
  { category: 'buildings', file: 'Ruined_Tower.glb', prompt: 'A ruined medieval stone tower, partially collapsed, overgrown', aliases: ['ruined tower', 'tower'] },
  { category: 'buildings', file: 'Shop.glb', prompt: 'A medieval market shop building with open storefront', aliases: ['shop'] },
  { category: 'buildings', file: 'Windmill.glb', prompt: 'A medieval windmill with cloth sails, wooden construction', aliases: ['windmill'] },
  { category: 'buildings', file: 'Swamp_Hut.glb', prompt: 'A swamp witch hut on stilts, crooked, with hanging herbs', aliases: ['swamp hut'] },
  { category: 'buildings', file: 'Castle_Gatehouse.glb', prompt: 'A medieval stone castle gatehouse with two towers and portcullis', aliases: ['gatehouse', 'castle gatehouse'] },
  { category: 'buildings', file: 'Tent_Military.glb', prompt: 'A simple medieval canvas tent, military camp style', aliases: ['military tent'] },
  { category: 'buildings', file: 'Tent_Camp.glb', prompt: 'A medieval adventurer tent with bedroll visible, campsite', aliases: ['camp tent', 'tent'] },
  { category: 'buildings', file: 'Stable.glb', prompt: 'A medieval wooden stable with hay and horse trough', aliases: ['stable'] },

  { category: 'nature', file: 'Oak_Tree_Dark.glb', prompt: 'A large twisted dark fantasy oak tree with thick trunk', aliases: ['oak tree', 'tree'] },
  { category: 'nature', file: 'Dead_Tree.glb', prompt: 'A dead leafless tree with gnarled branches, spooky fantasy', aliases: ['dead tree'] },
  { category: 'nature', file: 'Pine_Tree.glb', prompt: 'A pine tree, tall and straight, temperate forest', aliases: ['pine tree'] },
  { category: 'nature', file: 'Fallen_Log.glb', prompt: 'A fallen tree log, mossy, lying on forest ground', aliases: ['fallen log', 'log'] },
  { category: 'nature', file: 'Tree_Stump.glb', prompt: 'A tree stump with axe marks, medieval woodcutting', aliases: ['tree stump', 'stump'] },
  { category: 'nature', file: 'Bush.glb', prompt: 'A wild bush, thick green foliage, fantasy forest', aliases: ['bush'] },
  { category: 'nature', file: 'Mushrooms_Glowing.glb', prompt: 'A cluster of glowing fantasy mushrooms, bioluminescent, cave', aliases: ['glowing mushrooms'] },
  { category: 'nature', file: 'Mushrooms_Forest.glb', prompt: 'Regular brown forest mushroom cluster on the ground', aliases: ['mushrooms', 'forest mushrooms'] },
  { category: 'nature', file: 'Boulder_Mossy.glb', prompt: 'A large moss-covered boulder, natural stone, forest', aliases: ['boulder', 'mossy boulder'] },
  { category: 'nature', file: 'Rocks_Small.glb', prompt: 'A small rock formation, grey stones stacked naturally', aliases: ['rocks', 'small rocks'] },
  { category: 'nature', file: 'Swamp_Reeds.glb', prompt: 'Tall swamp reeds and cattails growing from water', aliases: ['reeds'] },
  { category: 'nature', file: 'Swamp_Tree.glb', prompt: 'A twisted swamp tree with hanging moss and exposed roots', aliases: ['swamp tree'] },
  { category: 'nature', file: 'Hay_Bales.glb', prompt: 'A stack of hay bales, medieval farm, golden straw', aliases: ['hay bales', 'hay'] },
  { category: 'nature', file: 'Garden_Patch.glb', prompt: 'A medieval vegetable garden patch with cabbages and carrots', aliases: ['garden patch', 'garden'] },
  { category: 'nature', file: 'Firewood_Pile.glb', prompt: 'A pile of firewood logs, neatly stacked, medieval', aliases: ['firewood pile', 'firewood'] },
  { category: 'nature', file: 'Crystal_Formation.glb', prompt: 'A crystal rock formation, purple amethyst crystals growing from stone', aliases: ['crystal formation', 'crystal'] },

  { category: 'props', file: 'Campfire.glb', prompt: 'A medieval campfire with stones around it and burning logs', aliases: ['campfire', 'fire'] },
  { category: 'props', file: 'Torch_Wall.glb', prompt: 'A wall-mounted medieval torch with flame, iron bracket', aliases: ['wall torch', 'torch'] },
  { category: 'props', file: 'Torch_Standing.glb', prompt: 'A standing medieval torch on a wooden pole, ground torch', aliases: ['standing torch'] },
  { category: 'props', file: 'Cart.glb', prompt: 'A medieval wooden horse-drawn cart with two wheels', aliases: ['cart'] },
  { category: 'props', file: 'Cart_Vendor.glb', prompt: 'A medieval vendor cart with goods and canvas cover', aliases: ['vendor cart'] },
  { category: 'props', file: 'Ship_Helm.glb', prompt: 'A medieval ship helm steering wheel, wooden with iron', aliases: ['ship helm', 'helm'] },
  { category: 'props', file: 'Ship_Mast.glb', prompt: 'A tall wooden ship mast with furled sails and rigging', aliases: ['ship mast', 'mast'] },
  { category: 'props', file: 'Gallows.glb', prompt: 'A medieval gallows hangman noose, dark wood, ominous', aliases: ['gallows'] },
  { category: 'props', file: 'Pillory.glb', prompt: 'A medieval stocks pillory for punishment, wooden, town square', aliases: ['pillory', 'stocks'] },
  { category: 'props', file: 'Gravestone.glb', prompt: 'A medieval gravestone, weathered stone with cross, cemetery', aliases: ['gravestone', 'grave'] },
  { category: 'props', file: 'Coffin.glb', prompt: 'A medieval wooden coffin, simple, dark wood with iron nails', aliases: ['coffin'] },
  { category: 'props', file: 'Rowboat.glb', prompt: 'A medieval wooden rowboat, simple, beached on shore', aliases: ['rowboat', 'boat'] },
  { category: 'props', file: 'Hanging_Cage.glb', prompt: 'A medieval iron cage, hanging, dungeon torture device', aliases: ['hanging cage', 'cage'] },
  { category: 'props', file: 'Cauldron_Fire.glb', prompt: 'A medieval cauldron on tripod over fire, witch brewing pot', aliases: ['cauldron fire', 'cauldron'] },
];

function normalizeIdPart(value) {
  return String(value || '')
    .replace(/\.glb$/i, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function titleFromFile(file) {
  return String(file || '')
    .replace(/\.glb$/i, '')
    .replace(/_/g, ' ')
    .trim();
}

export const MODEL_3D_CATALOG = RAW_MODEL_3D_CATALOG.map((entry) => ({
  ...entry,
  id: `${normalizeIdPart(entry.category)}:${normalizeIdPart(entry.file)}`,
  title: titleFromFile(entry.file),
  storagePath: `prefabs/${entry.category}/${entry.file}`,
}));

export const MODEL_3D_CATALOG_BY_ID = Object.fromEntries(
  MODEL_3D_CATALOG.map((entry) => [entry.id, entry])
);

export function getModelCatalogEntry(modelId) {
  return MODEL_3D_CATALOG_BY_ID[modelId] || null;
}
