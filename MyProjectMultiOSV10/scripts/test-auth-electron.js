const path = require('path');
const { app } = require('electron');

app.whenReady().then(() => {
  try {
    const { initLocalDatabase } = require('../dist-electron/db/localDatabase');
    const { authenticateUser } = require('../dist-electron/auth/userService');
    const userData = app.getPath('userData');
    console.log('userData:', userData);
    initLocalDatabase(userData);
    const session = authenticateUser('admin', 'admin');
    console.log('login result:', session);
  } catch (error) {
    console.error('auth test failed:', error);
  } finally {
    app.quit();
  }
});

app.on('window-all-closed', () => app.quit());
