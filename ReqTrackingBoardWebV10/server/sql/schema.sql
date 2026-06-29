-- Req Tracking Board - MariaDB Schema
-- Database: reqtracking (utf8mb4)

CREATE DATABASE IF NOT EXISTS reqtracking
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE reqtracking;

-- 사용자 (권한 포함)
-- role: admin | user
-- permission: view (보기 전용) | edit (편집 가능)
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(100) UNIQUE NOT NULL,
  password      VARCHAR(255) NOT NULL,
  display_name  VARCHAR(200) NOT NULL,
  email         VARCHAR(255) NOT NULL DEFAULT '',
  role          VARCHAR(50)  NOT NULL DEFAULT 'user',
  permission    VARCHAR(50)  NOT NULL DEFAULT 'view',
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  theme         VARCHAR(50)  NOT NULL DEFAULT 'default',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 요구사항
CREATE TABLE IF NOT EXISTS requirements (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  req_id        VARCHAR(100) UNIQUE NOT NULL,
  title         VARCHAR(500) NOT NULL,
  description   TEXT,
  category      VARCHAR(100) DEFAULT 'General',
  priority      VARCHAR(50)  DEFAULT 'Medium',
  status        VARCHAR(50)  DEFAULT 'Draft',
  owner         VARCHAR(200) DEFAULT '',
  version       VARCHAR(50)  DEFAULT '1.0',
  created_by    INT,
  updated_by    INT,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 테스트 케이스 (요구사항에 연결)
CREATE TABLE IF NOT EXISTS test_cases (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  tc_id            VARCHAR(100) UNIQUE NOT NULL,
  requirement_id   INT NOT NULL,
  title            VARCHAR(500) NOT NULL,
  description      TEXT,
  steps            TEXT,
  expected_result  TEXT,
  status           VARCHAR(50)  DEFAULT 'Not Run',
  result           TEXT,
  executed_by      VARCHAR(200) DEFAULT '',
  executed_at      DATETIME NULL,
  notes            TEXT,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (requirement_id) REFERENCES requirements(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
