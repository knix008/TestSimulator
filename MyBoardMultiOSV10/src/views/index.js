// Loads every workspace view; each module calls registerView() itself (views/registry.js).
// One line per view folder — the folders own everything else (their texts, styles, tests).
import './board/index.js';
import './detail/index.js';
import './backlog/index.js';
import './reports/index.js';
import './settings/index.js';
