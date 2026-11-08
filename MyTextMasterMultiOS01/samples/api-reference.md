# REST API Reference

Base URL: `https://api.example.com/v1`

## Authentication

Send the token in the `Authorization` header:

```http
GET /users/me HTTP/1.1
Authorization: Bearer <token>
```

## Endpoints

### `GET /users`

Lists users.

| Parameter | Type | Description |
| --- | --- | --- |
| `page` | integer | Page number (from 1) |
| `size` | integer | Items per page (max 100) |

**Response**

```json
{
  "items": [{ "id": 1, "name": "Ada" }],
  "page": 1,
  "total": 42
}
```

### `POST /users`

Creates a user. Returns `201 Created`.

## Errors

| Code | Meaning |
| --- | --- |
| 400 | Bad request |
| 401 | Not signed in |
| 404 | Not found |
