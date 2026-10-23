# CREDPAY CAPSTONE PROJECT

## Day 1 – System Design & Architecture Overview

---

# Project Overview

The objective of this capstone project is to build a simplified **CRED-style Credit Card Bill Payment Application** using a modern microservices architecture.

Students will learn the complete DevOps lifecycle by building, containerizing, deploying and monitoring a real-world application.

Instead of building a monolithic application, the project is divided into multiple independent services.

By the end of the project, students will understand:

* Microservices Architecture
* REST APIs
* React Frontend
* Java Spring Boot
* Python FastAPI
* PostgreSQL
* Docker
* Kubernetes (AKS)
* Azure Container Registry
* Terraform
* Azure DevOps Pipelines
* Prometheus & Grafana
* AI-powered Observability

---

# Business Requirement

Develop a web application similar to **CRED** where users can:

1. Register an account
2. Login
3. Add a Credit Card
4. View Registered Cards
5. Enter Bill Amount
6. Enter UPI ID
7. Simulate Payment
8. View Payment Success
9. View Payment History

For learning purposes, this project simulates payment processing without integrating a real payment gateway.

---

# Functional Flow

```
User

↓

Register

↓

Login

↓

Dashboard

↓

Add Credit Card

↓

Pay Credit Card Bill

↓

Payment Successful

↓

Payment History
```

---

# Why Microservices?

Instead of putting all business logic into one application, each business capability is separated into its own service.

Benefits include:

* Independent deployments
* Better scalability
* Easier maintenance
* Technology flexibility
* Fault isolation
* Industry-standard architecture

---

# Overall Architecture

```
                    React Frontend
                         │
                         │ REST API
                         ▼
                Spring Cloud API Gateway
                   (Implemented Later)
                  /                    \
                 /                      \
                ▼                        ▼

      User Service                Payment Service
      Spring Boot                  FastAPI (Python)

                 \                /
                  \              /
                   ▼            ▼

                  PostgreSQL Database
```

---

# Technology Stack

## Frontend

* React 18
* Vite
* Material UI
* Axios

Purpose

Provides the user interface.

---

## User Service

Technology

* Java 21
* Spring Boot 3.5
* Spring Data JPA
* Maven

Responsibilities

* User Registration
* Login
* Add Card
* View Cards

Runs on

```
localhost:8080
```

---

## Payment Service

Technology

* Python 3.14
* FastAPI
* SQLAlchemy

Responsibilities

* Pay Bill
* Generate Transaction ID
* Payment History

Runs on

```
localhost:8000
```

---

## Database

Technology

PostgreSQL 17

Database Name

```
credpay
```

Tables

* users
* cards
* payments

---

# Why One Database?

Initially all services share a single PostgreSQL database.

Reasons:

* Faster development
* Easier learning
* Simpler deployment
* Less infrastructure

Later, each microservice could own its own database if needed.

---

# Database Design

## users

Stores registered users.

Columns include:

* id
* full_name
* email
* password_hash
* created_at

---

## cards

Stores registered credit cards.

Only the masked card number is stored.

Example

```
**** **** **** 5678
```

The complete card number is never stored.

---

## payments

Stores payment history.

Contains:

* user_id
* card_id
* amount
* transaction_id
* upi_id
* status
* created_at

---

# API Design

The application exposes six REST APIs.

## User APIs

POST

```
/api/users/register
```

Registers a user.

---

POST

```
/api/users/login
```

Authenticates a user.

---

POST

```
/api/cards/add
```

Registers a new credit card.

---

GET

```
/api/cards/user/{userId}
```

Returns all registered cards.

---

## Payment APIs

POST

```
/api/payment/pay
```

Creates a simulated payment and generates a transaction ID.

---

GET

```
/api/payment/history/{userId}
```

Returns payment history.

---

# Current Local Architecture

```
Browser

↓

React Frontend
localhost:5173

↓

User Service
localhost:8080

↓

Payment Service
localhost:8000

↓

PostgreSQL
localhost:5432
```

Everything currently runs on the developer's laptop.

---

# Deployment Roadmap

## Day 1

Application Development

✔ PostgreSQL

✔ Java Service

✔ Python Service

✔ React Frontend

✔ Local Testing

---

## Day 2

Containerization

* Dockerfiles
* Docker Images
* Docker Compose

---

## Day 3

Cloud Deployment

* Azure Container Registry
* AKS
* Terraform
* Azure PostgreSQL

---

## Day 4

DevOps & Observability

* Azure DevOps Pipelines
* Prometheus
* Grafana
* Azure OpenAI Observability

---

# Project Folder Structure

```
CredPay/

├── customer-portal/

├── user-service/

├── payment-service/

├── database/

│     schema.sql

├── docker/

├── terraform/

├── kubernetes/

├── azure-pipelines/

└── docs/
```

---

# Learning Outcomes


* Design a Microservices Architecture
* Build REST APIs
* Connect Multiple Services
* Design a PostgreSQL Database
* Build a React Frontend
* Containerize Applications
* Deploy Containers to Kubernetes
* Provision Infrastructure using Terraform
* Build CI/CD Pipelines
* Implement Monitoring and Observability
* Understand an end-to-end DevOps workflow used in enterprise environments.

---

# Current Project Status

Completed

* Database Design
* Java User Service
* Python Payment Service
* Premium React Frontend
* Local End-to-End Testing
* Dockerfiles for Java, Python and React

Upcoming

* Spring Cloud API Gateway
* Docker Compose
* Azure Deployment
* Kubernetes
* Terraform
* Azure DevOps CI/CD
* Monitoring & AI Observability

---

# End-to-End Demonstration Flow

```
Register
      │
      ▼
Login
      │
      ▼
Dashboard
      │
      ▼
Add Credit Card
      │
      ▼
View Registered Cards
      │
      ▼
Enter Amount
      │
      ▼
Enter UPI ID
      │
      ▼
Pay Bill
      │
      ▼
Transaction Generated
      │
      ▼
Payment Successful
      │
      ▼
Payment History
```

This completes the Day 1 implementation and provides a fully functional local application ready for containerization in the next phase.
