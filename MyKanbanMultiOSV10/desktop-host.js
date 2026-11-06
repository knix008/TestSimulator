// Entry point of the Node process the Tauri program starts (src-tauri/src/host.rs).
// It runs the same Express server as the web version and reports the port on stdout.
// When the program ends, for any reason, stdin closes and this process ends with it.
process.stdin.on('end', () => process.exit(0));
process.stdin.on('close', () => process.exit(0));
process.stdin.on('error', () => process.exit(0));
process.stdin.resume();

const { startServer } = require('./server');

startServer(Number(process.env.MYKANBAN_PORT) || 3000)
  .then((port) => console.log(`MYKANBAN_PORT=${port}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
