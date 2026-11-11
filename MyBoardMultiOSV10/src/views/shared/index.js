// Helpers shared by the workspace views (board, backlog, detail, reports). Importing this module also
// registers the shared texts and loads the shared card styles. Exports are kept stable (other views use them).
import { registerTexts } from '../../i18n.js';
import { ko, en } from './texts.js';
import './shared.css';

registerTexts({ ko, en });

export {
  createLookups, letterAvatar, avatarHtml, avatarStackHtml, typeIconHtml, priorityIconHtml, resolutionIconHtml, labelColor, labelChipsHtml, epicChipHtml,
  progressHtml, dueChipHtml, daysDotsHtml, coverHtml, cardHtml, issueToCard, CARD_FIELDS,
} from './cards.js';
export {
  DAY_MS, HOUR_S, DAY_S, WEEK_S, escapeHtml, isoDate, toDate, formatDate, formatDateTime, relativeTime, daysSince, dueState,
  formatDuration, parseDuration, formatPoints, hashColor, initials,
} from './format.js';
export { errorMessage, isConflict } from './errors.js';
export { refButtonHtml, openRefList, closeRefList, refListOpen } from './refdropdown.js';
