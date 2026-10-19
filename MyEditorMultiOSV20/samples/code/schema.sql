-- SQL — DDL, joins, aggregates, window functions
CREATE TABLE authors (
    id    INTEGER PRIMARY KEY,
    name  TEXT NOT NULL
);

CREATE TABLE books (
    id        INTEGER PRIMARY KEY,
    author_id INTEGER REFERENCES authors(id),
    title     TEXT NOT NULL,
    year      INTEGER
);

INSERT INTO authors VALUES (1, 'Kim'), (2, 'Lee');
INSERT INTO books VALUES (1, 1, 'First', 2001), (2, 1, 'Second', 2005), (3, 2, 'Other', 2010);

SELECT a.name, COUNT(*) AS books, MAX(b.year) AS latest,
       RANK() OVER (ORDER BY COUNT(*) DESC) AS rnk
FROM authors a JOIN books b ON b.author_id = a.id
GROUP BY a.name
ORDER BY rnk;
