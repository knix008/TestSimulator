-- Fix MariaDB auth plugin for Node.js / Prisma / mysql2 clients.
-- Run with the MariaDB client while logged in as an administrator account.
--
-- Example (PowerShell):
--   & "C:\Program Files\MariaDB 12.3\bin\mariadb.exe" -u root -p < server/scripts/fix-mariadb-auth.sql
--
-- Replace the password below with your real MariaDB root password.
-- Use the same password in Win app DB settings and Web admin DB settings.

SELECT user, host, plugin FROM mysql.user WHERE user IN ('root', 'myproject');

-- Option A: change root accounts to mysql_native_password
ALTER USER 'root'@'localhost' IDENTIFIED VIA mysql_native_password USING PASSWORD('');
ALTER USER 'root'@'127.0.0.1' IDENTIFIED VIA mysql_native_password USING PASSWORD('');
ALTER USER 'root'@'::1' IDENTIFIED VIA mysql_native_password USING PASSWORD('');

-- Option B (recommended): dedicated app user instead of root
-- CREATE USER IF NOT EXISTS 'myproject'@'localhost' IDENTIFIED VIA mysql_native_password USING PASSWORD('choose-a-password');
-- GRANT ALL PRIVILEGES ON myproject.* TO 'myproject'@'localhost';
-- CREATE USER IF NOT EXISTS 'myproject'@'127.0.0.1' IDENTIFIED VIA mysql_native_password USING PASSWORD('choose-a-password');
-- GRANT ALL PRIVILEGES ON myproject.* TO 'myproject'@'127.0.0.1';

FLUSH PRIVILEGES;

SELECT user, host, plugin FROM mysql.user WHERE user IN ('root', 'myproject');
