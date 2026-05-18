# TaskForge — Multi-tenant SaaS Workflow Management Platform

TaskForge is a modern multi-tenant SaaS workflow and task management platform designed for organizations and collaborative teams.

This project focuses heavily on:
- scalable backend architecture
- multi-tenant SaaS design
- asynchronous processing
- role-based access control (RBAC)
- workflow orchestration
- distributed backend systems

---

# Key Highlights

- Multi-tenant SaaS architecture for organization-scoped collaboration
- JWT Authentication & Role-Based Access Control (RBAC)
- Asynchronous workflows using BullMQ and Redis
- MongoDB aggregation pipeline optimization & compound indexing
- OTP verification & email notification system
- Swagger/OpenAPI documentation
- Fully Dockerized backend infrastructure

---

# System Architecture

```text
                        +-------------------+
                        |     Frontend      |
                        |   React + Redux   |
                        +---------+---------+
                                  |
                                  v
                    +--------------------------+
                    |      NestJS REST API     |
                    |     JWT Authentication   |
                    +------------+-------------+
                                 |
         +-----------------------+----------------------+
         |                       |                      |
         v                       v                      v
+----------------+     +----------------+     +----------------+
|    MongoDB     |     |     Redis      |     |    BullMQ      |
| Replica Set DB |     | OTP / Caching  |     | Async Jobs     |
+----------------+     +----------------+     +----------------+
```

---

# Core Features

## Authentication & Security

- JWT Access & Refresh Token authentication
- OTP verification for:
  - user registration
  - password reset
- Password hashing using BCrypt
- Role-based access control:
  - ADMIN
  - USER
- Secure refresh token workflow
- Standardized API response handling

---

# Multi-Tenant SaaS Architecture

TaskForge is designed as a multi-tenant collaboration platform:

- Organizations act as isolated workspaces
- Organization-scoped permissions
- Team-based task collaboration
- Secure invitation & onboarding workflow
- Cross-organization access prevention

---

# Teams & Collaboration

- Team creation and management
- Team member invitations
- Role promotion/demotion
- Invitation token validation using Redis
- Team-scoped task management
- Collaborative workflow support

---

# Task & Workflow Management

- Full CRUD task management
- Task priorities:
  - Low
  - Medium
  - High
- Due date tracking
- Assignee management
- Task status workflows:
  - Pending
  - In Progress
  - Completed

---

# Async Processing & Background Jobs

## Email Dispatching

- Asynchronous email delivery using BullMQ
- Redis-backed job queue processing

## Scheduled Jobs

- Automated task reminder workflows
- Background notification processing

## Queue-Based Architecture

- Non-blocking background job execution
- Scalable asynchronous task processing
- Improved responsiveness under concurrent workloads

---

# Performance Optimizations

- Optimized MongoDB aggregation pipelines
- Applied compound indexing strategies
- Reduced query execution time:
  - ~80ms → ~2ms
- Benchmarked on datasets with:
  - 100,000+ records
- Improved concurrent task retrieval performance

---

# Tech Stack

## Backend

- Node.js
- TypeScript
- NestJS
- MongoDB
- Mongoose
- Redis
- BullMQ
- JWT Authentication
- Swagger/OpenAPI
- Docker & Docker Compose

## Frontend

- React.js
- Redux Toolkit
- Tailwind CSS

---

# API Documentation

Swagger UI is integrated directly into the backend.

```bash
http://localhost:8001/api/docs
```

---

# Dockerized Infrastructure

The backend infrastructure is fully containerized using Docker Compose.

Services:
- NestJS API
- MongoDB Replica Set
- Redis
- BullMQ Workers

---

# Getting Started

## Prerequisites

- Docker Desktop
- Node.js 18+
- Git

---

# 1. Clone Repository

```bash
git clone https://github.com/MinhPham204/TaskForge.git
cd TaskForge
```

---

# 2. Backend Setup

## Configure Environment Variables

Create `.env` file inside the backend directory.

Example:

```env
MONGO_URI=mongodb://localhost:27017/taskforge
JWT_SECRET=your-secret-key

REDIS_HOST=localhost
REDIS_PORT=6379

EMAIL_USER=your-email
EMAIL_PASS=your-password
```

---

## Start Docker Infrastructure

```bash
docker-compose up -d --build
```

---

## Initialize MongoDB Replica Set

```bash
docker exec -it task_manager_db mongosh --eval "rs.initiate()"
```

---

## Run Backend

```bash
npm install
npm run start:dev
```

---

# 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

---

# Future Improvements

- WebSocket Real-time Notifications
- Microservice Architecture
- CI/CD Pipeline
- Kubernetes Deployment
- Metrics & Monitoring
- Distributed Tracing
- File Upload Service

---

# Repository

- GitHub: https://github.com/MinhPham204/TaskForge
