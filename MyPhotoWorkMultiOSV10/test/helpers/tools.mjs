import { toolGroups } from '../../src/catalog.ts'

/** Every tool in the left strip. */
export const allToolIds = toolGroups.flatMap((group) => group.tools.map((tool) => tool.id))
