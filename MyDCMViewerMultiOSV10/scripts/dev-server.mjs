// The page server `tauri dev` loads (devUrl http://localhost:5193): server.js on a fixed port,
// so edits under src/ show after a reload (Ctrl+R) without rebuilding anything.
import { createRequire } from 'node:module';

process.env.PORT = process.env.PORT || '5193';
process.env.STRICT_PORT = '1';
createRequire(import.meta.url)('../server.js');
