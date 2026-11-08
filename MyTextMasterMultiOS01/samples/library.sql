-- 도서관 대출 관리 데이터베이스
-- 테이블 만들기, 예시 데이터, 자주 쓰는 조회

CREATE TABLE members (
    member_id   INTEGER PRIMARY KEY,
    name        VARCHAR(50)  NOT NULL,
    email       VARCHAR(100) UNIQUE,
    joined_at   DATE         DEFAULT CURRENT_DATE
);

CREATE TABLE books (
    book_id     INTEGER PRIMARY KEY,
    title       VARCHAR(200) NOT NULL,
    author      VARCHAR(100),
    published   INTEGER,
    copies      INTEGER DEFAULT 1 CHECK (copies >= 0)
);

CREATE TABLE loans (
    loan_id     INTEGER PRIMARY KEY,
    member_id   INTEGER NOT NULL REFERENCES members(member_id),
    book_id     INTEGER NOT NULL REFERENCES books(book_id),
    loaned_at   DATE    NOT NULL,
    due_at      DATE    NOT NULL,
    returned_at DATE
);

CREATE INDEX idx_loans_member ON loans(member_id);

INSERT INTO members (member_id, name, email) VALUES
    (1, '김하늘', 'sky@example.com'),
    (2, '박도윤', 'doyun@example.com'),
    (3, 'Emily Clark', 'emily@example.com');

INSERT INTO books (book_id, title, author, published, copies) VALUES
    (101, '채식주의자', '한강', 2007, 3),
    (102, 'Clean Code', 'Robert C. Martin', 2008, 2),
    (103, '코스모스', '칼 세이건', 1980, 1);

INSERT INTO loans VALUES
    (1, 1, 101, '2026-10-20', '2026-11-03', NULL),
    (2, 2, 102, '2026-10-25', '2026-11-08', '2026-11-01'),
    (3, 3, 103, '2026-11-01', '2026-11-15', NULL);

-- 반납 기한이 지난 대출
SELECT m.name, b.title, l.due_at
FROM loans l
JOIN members m ON m.member_id = l.member_id
JOIN books   b ON b.book_id   = l.book_id
WHERE l.returned_at IS NULL
  AND l.due_at < CURRENT_DATE
ORDER BY l.due_at;

-- 회원별 대출 횟수
SELECT m.name, COUNT(l.loan_id) AS loan_count
FROM members m
LEFT JOIN loans l ON l.member_id = m.member_id
GROUP BY m.name
HAVING COUNT(l.loan_id) > 0
ORDER BY loan_count DESC;
