# CREDPAY API Documentation

This document describes all REST APIs exposed by the CREDPAY backend services.

| Service | Tech | Base URL |
|---|---|---|
| User Service | Spring Boot 3.5.x / Java 21 | `http://localhost:8080` |
| Payment Service | FastAPI / Python 3.14 | `http://localhost:8000` |

**Notes on error formats:**
- The **User Service** (Spring Boot) returns errors as `{ "message": "..." }`.
- The **Payment Service** (FastAPI) returns errors as `{ "detail": "..." }`, and
  request-body validation failures use HTTP `422` with a structured `detail` array.

All requests and responses use `Content-Type: application/json`.

---

## 1. Register API

Registers a new user. Email must be unique.

| | |
|---|---|
| **URL** | `/api/users/register` |
| **Full URL** | `http://localhost:8080/api/users/register` |
| **Method** | `POST` |
| **Service** | User Service (8080) |

### Request Body

```json
{
  "fullName": "Bharath Reddy",
  "email": "bharath@test.com",
  "password": "Password123"
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| fullName | string | yes | not blank |
| email | string | yes | valid email, unique |
| password | string | yes | min 6 characters |

### Response Body — `200 OK`

```json
{
  "message": "User registered successfully"
}
```

### Error Responses

| Status | When | Body |
|---|---|---|
| `409 Conflict` | Email already registered | `{ "message": "Email already exists" }` |
| `400 Bad Request` | Validation failed | `{ "message": "email: email must be valid" }` |

### Sample Postman Request

```
POST http://localhost:8080/api/users/register
Headers:
  Content-Type: application/json
Body (raw / JSON):
{
  "fullName": "Bharath Reddy",
  "email": "bharath@test.com",
  "password": "Password123"
}
```

curl equivalent:

```bash
curl -X POST http://localhost:8080/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Bharath Reddy","email":"bharath@test.com","password":"Password123"}'
```

---

## 2. Login API

Verifies the email exists and the password matches. No JWT is issued.

| | |
|---|---|
| **URL** | `/api/users/login` |
| **Full URL** | `http://localhost:8080/api/users/login` |
| **Method** | `POST` |
| **Service** | User Service (8080) |

### Request Body

```json
{
  "email": "bharath@test.com",
  "password": "Password123"
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| email | string | yes | valid email |
| password | string | yes | not blank |

### Response Body — `200 OK`

```json
{
  "userId": 3,
  "fullName": "Bharath Reddy",
  "email": "bharath@test.com",
  "message": "Login successful"
}
```

| Field | Type | Description |
|---|---|---|
| userId | number | ID of the authenticated user |
| fullName | string | User's full name |
| email | string | User's email |
| message | string | Always `"Login successful"` |

### Error Responses

| Status | When | Body |
|---|---|---|
| `401 Unauthorized` | Unknown email or wrong password | `{ "message": "Invalid email or password" }` |
| `400 Bad Request` | Validation failed | `{ "message": "email: email is required" }` |

### Sample Postman Request

```
POST http://localhost:8080/api/users/login
Headers:
  Content-Type: application/json
Body (raw / JSON):
{
  "email": "bharath@test.com",
  "password": "Password123"
}
```

curl equivalent:

```bash
curl -X POST http://localhost:8080/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"bharath@test.com","password":"Password123"}'
```

---

## 3. Add Card API

Adds a credit card for an existing user. Only the **masked** card number is stored
(e.g. `**** **** **** 5678`); the full number is never persisted.

| | |
|---|---|
| **URL** | `/api/cards/add` |
| **Full URL** | `http://localhost:8080/api/cards/add` |
| **Method** | `POST` |
| **Service** | User Service (8080) |

### Request Body

```json
{
  "userId": 1,
  "cardHolder": "Bharath Reddy",
  "cardNumber": "1234567812345678",
  "cardNetwork": "VISA",
  "expiryMonth": 12,
  "expiryYear": 2028
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| userId | number | yes | user must exist |
| cardHolder | string | yes | not blank |
| cardNumber | string | yes | 13–19 digits (only last 4 stored) |
| cardNetwork | string | yes | e.g. VISA, MASTERCARD, RUPAY |
| expiryMonth | number | yes | 1–12 |
| expiryYear | number | yes | ≥ current year |

### Response Body — `200 OK`

```json
{
  "message": "Card added successfully"
}
```

### Error Responses

| Status | When | Body |
|---|---|---|
| `404 Not Found` | userId does not exist | `{ "message": "User not found with id: 1" }` |
| `400 Bad Request` | Expiry year in the past | `{ "message": "expiryYear must be greater than or equal to 2026" }` |
| `400 Bad Request` | Field validation failed | `{ "message": "cardNumber: cardNumber must be 13-19 digits" }` |

### Sample Postman Request

```
POST http://localhost:8080/api/cards/add
Headers:
  Content-Type: application/json
Body (raw / JSON):
{
  "userId": 1,
  "cardHolder": "Bharath Reddy",
  "cardNumber": "1234567812345678",
  "cardNetwork": "VISA",
  "expiryMonth": 12,
  "expiryYear": 2028
}
```

curl equivalent:

```bash
curl -X POST http://localhost:8080/api/cards/add \
  -H "Content-Type: application/json" \
  -d '{"userId":1,"cardHolder":"Bharath Reddy","cardNumber":"1234567812345678","cardNetwork":"VISA","expiryMonth":12,"expiryYear":2028}'
```

---

## 4. List Card API

Returns all cards belonging to a user. Card numbers are returned masked.

| | |
|---|---|
| **URL** | `/api/cards/user/{userId}` |
| **Full URL** | `http://localhost:8080/api/cards/user/1` |
| **Method** | `GET` |
| **Service** | User Service (8080) |

### Path Parameters

| Param | Type | Description |
|---|---|---|
| userId | number | ID of the user whose cards to list |

### Request Body

_None._

### Response Body — `200 OK`

```json
[
  {
    "id": 1,
    "cardHolder": "Bharath Reddy",
    "cardNumber": "**** **** **** 5678",
    "cardNetwork": "VISA"
  }
]
```

Returns an empty array `[]` if the user has no cards.

### Error Responses

| Status | When | Body |
|---|---|---|
| `404 Not Found` | userId does not exist | `{ "message": "User not found with id: 1" }` |

### Sample Postman Request

```
GET http://localhost:8080/api/cards/user/1
Headers:
  (none required)
Body:
  none
```

curl equivalent:

```bash
curl http://localhost:8080/api/cards/user/1
```

---

## 5. Pay Bill API

Simulates a payment. Validates the user and card, generates a unique transaction
id (format `TXN<YYYYMMDD><NNN>`, e.g. `TXN20260624001`), stores the record with
`status = SUCCESS`, and returns the result.

| | |
|---|---|
| **URL** | `/api/payment/pay` |
| **Full URL** | `http://localhost:8000/api/payment/pay` |
| **Method** | `POST` |
| **Service** | Payment Service (8000) |

### Request Body

```json
{
  "userId": 3,
  "cardId": 4,
  "amount": 2500,
  "upiId": "bharath@ybl"
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| userId | number | yes | user must exist |
| cardId | number | yes | card must exist |
| amount | number | yes | > 0 |
| upiId | string | yes | min 3 characters |

### Response Body — `200 OK`

```json
{
  "transactionId": "TXN20260624001",
  "status": "SUCCESS",
  "amount": 2500
}
```

### Error Responses

| Status | When | Body |
|---|---|---|
| `404 Not Found` | userId does not exist | `{ "detail": "User not found with id: 3" }` |
| `404 Not Found` | cardId does not exist | `{ "detail": "Card not found with id: 4" }` |
| `422 Unprocessable Entity` | Body validation failed (e.g. amount ≤ 0, missing field) | `{ "detail": [ { "loc": ["body", "amount"], "msg": "Input should be greater than 0", "type": "greater_than" } ] }` |

### Sample Postman Request

```
POST http://localhost:8000/api/payment/pay
Headers:
  Content-Type: application/json
Body (raw / JSON):
{
  "userId": 3,
  "cardId": 4,
  "amount": 2500,
  "upiId": "bharath@ybl"
}
```

curl equivalent:

```bash
curl -X POST http://localhost:8000/api/payment/pay \
  -H "Content-Type: application/json" \
  -d '{"userId":3,"cardId":4,"amount":2500,"upiId":"bharath@ybl"}'
```

---

## 6. Payment History API

Returns all payments for a user, newest first.

| | |
|---|---|
| **URL** | `/api/payment/history/{userId}` |
| **Full URL** | `http://localhost:8000/api/payment/history/3` |
| **Method** | `GET` |
| **Service** | Payment Service (8000) |

### Path Parameters

| Param | Type | Description |
|---|---|---|
| userId | number | ID of the user whose payments to list |

### Request Body

_None._

### Response Body — `200 OK`

```json
[
  {
    "transactionId": "TXN20260624001",
    "amount": 2500,
    "status": "SUCCESS",
    "createdAt": "2026-06-24T12:00:00+00:00"
  }
]
```

Returns an empty array `[]` if the user has no payments.

### Error Responses

| Status | When | Body |
|---|---|---|
| `404 Not Found` | userId does not exist | `{ "detail": "User not found with id: 3" }` |

### Sample Postman Request

```
GET http://localhost:8000/api/payment/history/3
Headers:
  (none required)
Body:
  none
```

curl equivalent:

```bash
curl http://localhost:8000/api/payment/history/3
```

---

## Quick Reference

| # | API | Method | URL | Service |
|---|---|---|---|---|
| 1 | Register | POST | `/api/users/register` | User (8080) |
| 2 | Login | POST | `/api/users/login` | User (8080) |
| 3 | Add Card | POST | `/api/cards/add` | User (8080) |
| 4 | List Cards | GET | `/api/cards/user/{userId}` | User (8080) |
| 5 | Pay Bill | POST | `/api/payment/pay` | Payment (8000) |
| 6 | Payment History | GET | `/api/payment/history/{userId}` | Payment (8000) |
