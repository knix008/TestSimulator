-- Fix MariaDB auth plugin for Node.js / Prisma / mysql2 clients.
-- Run with the MariaDB client while logged in as an administrator account.
--
-- IMPORTANT: MariaDB 10.4+ may keep gssapi in auth_or on the PC hostname account
-- (e.g. root@YOUR-PC-NAME) even when mysql.user.plugin shows mysql_native_password.
-- Node.js/Prisma then fail with auth_gssapi_client. Fix ALL root hosts:
--
-- Example (PowerShell):
--   cd ...\MyProjectWebV10\server
--   .\scripts\fix-mariadb-auth-from-win.ps1
--
-- Or manually: list hosts, then ALTER each one (replace password and host names).

SELECT user, host, plugin FROM mysql.user WHERE user IN ('root', 'myproject');
SELECT Host, User, Priv FROM mysql.global_priv WHERE User IN ('root', 'myproject');

-- List every root host (run this, then ALTER each Host value returned):
-- SELECT Host FROM mysql.global_priv WHERE User='root';

-- Example for common hosts (replace YOUR_PASSWORD):
-- ALTER USER 'root'@'localhost' IDENTIFIED VIA mysql_native_password USING PASSWORD('YOUR_PASSWORD');
-- ALTER USER 'root'@'127.0.0.1' IDENTIFIED VIA mysql_native_password USING PASSWORD('YOUR_PASSWORD');
-- ALTER USER 'root'@'::1' IDENTIFIED VIA mysql_native_password USING PASSWORD('YOUR_PASSWORD');
-- ALTER USER 'root'@'YOUR-PC-HOSTNAME' IDENTIFIED VIA mysql_native_password USING PASSWORD('YOUR_PASSWORD');

FLUSH PRIVILEGES;

SELECT user, host, plugin FROM mysql.user WHERE user IN ('root', 'myproject');
SELECT Host, User, Priv FROM mysql.global_priv WHERE User IN ('root', 'myproject');
