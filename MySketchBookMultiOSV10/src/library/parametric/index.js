// The parametric part of the library catalog: every entry is built in code from its params
// (see ARCHITECTURE.md §12 → Library objects). One module per category keeps the files reviewable.
import { ITEMS as living } from './living.js';
import { ITEMS as dining } from './dining.js';
import { ITEMS as bedroom } from './bedroom.js';
import { ITEMS as kitchen } from './kitchen.js';
import { ITEMS as appliances } from './appliances.js';
import { ITEMS as bathroom } from './bathroom.js';
import { ITEMS as office } from './office.js';
import { ITEMS as kids } from './kids.js';
import { ITEMS as storage } from './storage.js';
import { ITEMS as lighting } from './lighting.js';
import { ITEMS as decor } from './decor.js';
import { ITEMS as plants } from './plants.js';
import { ITEMS as openings } from './openings.js';
import { ITEMS as structure } from './structure.js';
import { ITEMS as outdoor } from './outdoor.js';
// More designs + preset variants (helpers.js → variant()) per category
import { ITEMS as livingMore } from './living-more.js';
import { ITEMS as livingSofas } from './living-sofas.js';
import { ITEMS as diningMore } from './dining-more.js';
import { ITEMS as bedroomMore } from './bedroom-more.js';
import { ITEMS as kitchenMore } from './kitchen-more.js';
import { ITEMS as appliancesMore } from './appliances-more.js';
import { ITEMS as bathroomMore } from './bathroom-more.js';
import { ITEMS as officeMore } from './office-more.js';
import { ITEMS as kidsMore } from './kids-more.js';
import { ITEMS as storageMore } from './storage-more.js';
import { ITEMS as lightingMore } from './lighting-more.js';
import { ITEMS as decorMore } from './decor-more.js';
import { ITEMS as plantsMore } from './plants-more.js';
import { ITEMS as doorsMore } from './doors-more.js';
import { ITEMS as windowsMore } from './windows-more.js';
import { ITEMS as structureMore } from './structure-more.js';
import { ITEMS as outdoorMore } from './outdoor-more.js';
// Further designs per category (*-extra.js) and the company workplace category
import { ITEMS as workplace } from './workplace.js';
import { ITEMS as livingExtra } from './living-extra.js';
import { ITEMS as sofasExtra } from './sofas-extra.js';
import { ITEMS as diningExtra } from './dining-extra.js';
import { ITEMS as bedroomExtra } from './bedroom-extra.js';
import { ITEMS as kitchenExtra } from './kitchen-extra.js';
import { ITEMS as appliancesExtra } from './appliances-extra.js';
import { ITEMS as bathroomExtra } from './bathroom-extra.js';
import { ITEMS as officeExtra } from './office-extra.js';
import { ITEMS as storageExtra } from './storage-extra.js';
import { ITEMS as lightingExtra } from './lighting-extra.js';
import { ITEMS as decorExtra } from './decor-extra.js';
import { ITEMS as plantsExtra } from './plants-extra.js';
import { ITEMS as doorsExtra } from './doors-extra.js';
import { ITEMS as windowsExtra } from './windows-extra.js';
import { ITEMS as structureExtra } from './structure-extra.js';
import { ITEMS as outdoorExtra } from './outdoor-extra.js';
// More office / workplace / lighting / appliance designs (*-plus.js)
import { ITEMS as officePlus } from './office-plus.js';
import { ITEMS as workplacePlus } from './workplace-plus.js';
import { ITEMS as workplacePlus2 } from './workplace-plus2.js';
import { ITEMS as lightingPlus } from './lighting-plus.js';
import { ITEMS as appliancesPlus } from './appliances-plus.js';
// More dining / bedroom / bathroom / kids designs (*-plus.js)
import { ITEMS as diningPlus } from './dining-plus.js';
import { ITEMS as bedroomPlus } from './bedroom-plus.js';
import { ITEMS as bathroomPlus } from './bathroom-plus.js';
import { ITEMS as kidsPlus } from './kids-plus.js';
import { ITEMS as outdoorPlus } from './outdoor-plus.js';
import { ITEMS as windowsPlus } from './windows-plus.js';
import { ITEMS as structurePlus } from './structure-plus.js';
import { ITEMS as doorsPlus } from './doors-plus.js';
// The accessories (소품) category: everyday props (*-plus.js, *-plus2.js)
import { ITEMS as accessoriesPlus } from './accessories-plus.js';
import { ITEMS as accessoriesPlus2 } from './accessories-plus2.js';
// Office props (사무실), server room (서버실), computers (컴퓨터) and landscaping (조경)
import { ITEMS as officeProps } from './office-props.js';
import { ITEMS as officeProps2 } from './office-props2.js';
import { ITEMS as serverRoom } from './server-room.js';
import { ITEMS as serverRoom2 } from './server-room2.js';
import { ITEMS as computers } from './computers.js';
import { ITEMS as computers2 } from './computers2.js';
import { ITEMS as landscape } from './landscape.js';
import { ITEMS as landscape2 } from './landscape2.js';
import { ITEMS as securityMoved } from './security-moved.js';
import { ITEMS as security } from './security.js';
import { ITEMS as security2 } from './security2.js';
// More air conditioners (가전) and light fixtures (조명)
import { ITEMS as appliancesAir } from './appliances-air.js';
import { ITEMS as lightingFixtures } from './lighting-fixtures.js';

export const PARAMETRIC_ITEMS = [
  ...living, ...dining, ...bedroom, ...kitchen, ...appliances, ...bathroom, ...office, ...kids,
  ...storage, ...lighting, ...decor, ...plants, ...openings, ...structure, ...outdoor,
  ...livingSofas, ...livingMore, ...diningMore, ...bedroomMore, ...kitchenMore, ...appliancesMore, ...bathroomMore, ...officeMore, ...kidsMore, ...storageMore, ...lightingMore, ...decorMore, ...plantsMore, ...doorsMore, ...windowsMore, ...structureMore, ...outdoorMore,
  ...workplace, ...livingExtra, ...sofasExtra, ...diningExtra, ...bedroomExtra, ...kitchenExtra, ...appliancesExtra, ...bathroomExtra, ...officeExtra, ...storageExtra, ...lightingExtra, ...decorExtra, ...plantsExtra, ...doorsExtra, ...windowsExtra, ...structureExtra, ...outdoorExtra,
  ...officePlus, ...workplacePlus, ...workplacePlus2, ...lightingPlus, ...appliancesPlus,
  ...diningPlus, ...bedroomPlus, ...bathroomPlus, ...kidsPlus,
  ...outdoorPlus,
  ...windowsPlus,
  ...structurePlus,
  ...doorsPlus,
  ...accessoriesPlus, ...accessoriesPlus2,
  ...officeProps, ...officeProps2, ...serverRoom, ...serverRoom2, ...computers, ...computers2, ...landscape, ...landscape2, ...securityMoved, ...security, ...security2,
  ...appliancesAir, ...lightingFixtures,
];

const BY_ID = new Map(PARAMETRIC_ITEMS.map((e) => [e.id, e]));
/** The entry with this id (undefined if none). */
export const parametricItem = (id) => BY_ID.get(id);

/** Builds an item by id with params (defaults filled) — convenience for the scene builder and tests. */
export function buildParametric(id, params, ctx) {
  const entry = BY_ID.get(id);
  if (!entry) throw new Error(`Unknown parametric item: ${id}`);
  return entry.build(params ?? {}, ctx);
}
