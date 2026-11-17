// Library categories an item is also listed under (besides its own): a bistro chair is dining furniture and also a
// restaurant's, a grab bar is a bathroom fitting and also a clinic's. Each rule takes items from the categories
// where such things are (so a "kitchen counter" never becomes a shop counter) whose name or tags say so.
// The library shows an item under its own category and under each of these (entry.also).

const RULES = [
  ["Restaurant", ["Dining", "Kitchen", "Electronics", "Decor", "Living", "Outdoor", "Lighting"],
    /\b(bar stools?|counter stools?|bistro|caf[eé]|restaurant|banquette|booth|buffet|high-?top|dining (table|chair|bench|set)|wine|espresso|coffee (machine|maker|grinder)|serving|cocktail|bar cart|bar table|pub|chef|pizza|bakery|bread|beer|cutlery|tableware|dinnerware|tea ?set|teapot|cake stand|menu|patio set|bistro set|ice bucket|decanter)\b/i],
  ["Commercial", ["Office", "Storage", "Electronics", "Decor", "Building", "Living", "Lighting"],
    /\b(reception|lobby|retail|shop|display (case|cabinet|stand|table|shelf|shelves|rack|counter)|showcase|vitrine|kiosk|cashier|checkout|pos\b|vending|signage|sign board|a-frame sign|neon sign|mannequin|clothes rail|garment rail|gondola|waiting|queue|showroom|salon|barber|brochure|price|counter desk|service counter|ticket|atm|track light|stanchions?)\b/i],
  ["Healthcare", ["Bathroom", "Building", "Bedroom", "Office", "Living", "Electronics", "Kids", "Decor"],
    /\b(hospital|clinic|medical|patient|nurse|wheelchair|accessible|grab bars?|first[- ]aid|defibrillator|aed|stretcher|crutch|commode|pharmacy|massage chair|treatment|examination|dental|doctor|pill organi[sz]er|thermometer|blood pressure|care bed|lift chair|shower chair|shower seat|bath seat|walk-in bath|support rail|hand sanitiser|sanitizer|rollator|walking frame)\b/i],
  ["School", ["Office", "Kids", "Storage", "Electronics", "Decor", "Living", "Building"],
    /\b(school|classroom|student|pupil|teacher|blackboard|chalkboard|whiteboard|lockers?|library|bookcase|bookshelf|globe|easel|study (desk|table|chair)|lecture|lectern|podium|projector|science|microscope|kids'? desk|children'?s desk|reading|bulletin|notice board|cork ?board|stationery|pencil|crayon|abacus|flip ?chart|pin ?board)\b/i],
  ["Fitness", ["Outdoor", "Kids", "Living", "Electronics", "Bathroom", "Decor", "Storage"],
    /\b(gym|fitness|exercise|yoga|treadmill|dumbbells?|kettlebells?|barbell|weight (bench|rack|plates?)|rowing|elliptical|spin bike|exercise bike|sauna|trampoline|climbing (wall|frame|arch|triangle)|basketball|football|soccer|tennis|ping[- ]?pong|table tennis|golf|skateboard|surfboard|skis?\b|boxing|punching|massage gun|foam roller|jump rope|skipping rope|pull-?up|swimming pool|hot tub|playground|swing set|jungle gym)\b/i],
  ["Storage", ["Living", "Bedroom", "Kitchen", "Office", "Bathroom", "Kids", "Decor", "Outdoor", "Dining", "Building"],
    /\b(storage|shelf|shelves|shelving|cabinet|cupboard|wardrobe|closet|chest of drawers|drawers?|dresser|lockers?|bins?|baskets?|crates?|boxes|rack|organi[sz]er|sideboard|bookcase|bookshelf|pantry|trunk|hamper|shoe cabinet|filing|tool ?(box|chest)|shed|tallboy|credenza|armoire|hutch)\b/i],
  ["Plants", ["Decor", "Outdoor", "Living", "Kitchen", "Bathroom", "Office", "Dining"],
    /\b(plants?|trees?|shrubs?|bush|hedge|flowers?|bouquet|cactus|succulents?|palm|fern|bonsai|planters?|herbs?|ivy|moss|orchid|bamboo|terrarium|monstera|olive|lavender|topiary|flower ?pot|garden bed|grass)\b/i],
  ["Vehicles", ["Outdoor", "Kids", "Building", "Storage", "Commercial", "Fitness"],
    /\b(bicycles?|(?<!exercise |spin )bikes?(?! rack)|e-?bike|scooter|motorcycle|motorbike|moped|boat|kayak|canoe|stroller|pram|buggy|forklift|tractor|trailer|caravan|wheelbarrow|golf cart|ride-on|charging station|ev charger|tricycle|go-?kart|shopping (cart|trolley))\b/i],
  ["People", ["Decor", "Commercial", "Outdoor"], /\b(mannequin|statue|bust|figure|figurine|sculpture of a|dress form)\b/i],
  ["Other", ["Building", "Outdoor", "Storage", "Decor", "Office"],
    /\b(pallet|wooden crates?|crate stack|barrel|oil drum|traffic cone|bollard|barrier|sandbag|tarp|step ladder|scaffold|bucket|jerry can|gas cylinder|toolbox|sawhorse|cable (reel|spool)|dumpster|skip bin|shipping container|water butt|stanchions?)\b/i],
];

/** Fills entry.also (the extra categories) on the catalogue's entries in place. */
export function addAlsoCategories(entries) {
  for (const e of entries) {
    const text = `${e.name} ${e.tags || ""}`;
    const also = [];
    for (const [cat, from, re] of RULES) if (cat !== e.cat && from.includes(e.cat) && re.test(text)) also.push(cat);
    if (also.length) e.also = also;
  }
  return entries;
}
