# A.D. GARMENTS Attendance Mobile & Backend System

A production-grade, offline-first attendance reporting application engineered specifically for **A.D. GARMENTS** garment manufacturing operations. Replaces manual department headcount calculations and paper records across two manufacturing units (Unit-1 and Unit-2).

---

## 1. System Architecture

The project is structured as an enterprise TypeScript monorepo with NPM workspaces:

├── backend/                    # Node.js + Express + PostgreSQL REST Backend API
│   ├── src/controllers/        # Attendance, Auth, Report & Sync endpoints
│   ├── src/services/           # Concurrency revisions, PDF/Excel generation, Sync push/pull
│   ├── src/repositories/       # Transactional PostgreSQL access & audit logs
│   ├── src/db/                 # Connection pool, seed script & migrations
│   └── tests/                  # End-to-end API integration tests
├── frontend/                   # High-Performance Cross-Platform React Native + Web App
│   ├── src/app/                # File-based screens (Dashboard, Daily Entry, Reports, History, Settings)
│   ├── src/services/           # SQLite & Web local DB, Sync Engine, PDF & Share service
│   ├── src/context/            # Offline session authentication & role management
│   └── src/theme/              # Executive luxury industrial UI theme
├── packages/
│   └── domain/                 # Core domain logic, validation schemas & calculation engine
└── database/
    └── migrations/             # Versioned PostgreSQL migrations

---

## 2. Department & Calculation Specifications

### Exact 16 Departments

| Unit | Department Code | Label | Order |
| :--- | :--- | :--- | :--- |
| **Unit 1** | `U1_SINGER_1` | SINGER | 1 |
| **Unit 1** | `U1_FLATLOCK` | FLATLOCK | 2 |
| **Unit 1** | `U1_OVERLOCK` | OVERLOCK | 3 |
| **Unit 1** | `U1_HELPER` | HELPER | 4 |
| **Unit 1** | `U1_SINGER_2` | SINGER | 5 |
| **Unit 1** | `U1_CHECKING` | CHECKING | 6 |
| **Unit 1** | `U1_IRONING` | IRONING | 7 |
| **Unit 1** | `U1_PACKING` | PACKING | 8 |
| **Unit 1** | `STAFF` | **STAFF (U1)** | Adjustment |
| **Unit 2** | `U2_CUTTING` | CUTTING | 1 |
| **Unit 2** | `U2_FLATLOCK` | FLATLOCK | 2 |
| **Unit 2** | `U2_OVERLOCK` | OVERLOCK | 3 |
| **Unit 2** | `U2_HELPER` | HELPER | 4 |
| **Unit 2** | `U2_SINGER_CO_SHIFT` | SINGER CO.SHIFT | 5 |
| **Unit 2** | `U2_CHECKING` | CHECKING | 6 |
| **Unit 2** | `U2_IRONING` | IRONING | 7 |
| **Unit 2** | `U2_PACKING` | PACKING | 8 |
| **Unit 2** | `SHIFT` | **SHIFT (U2)** | Adjustment |

### Core Mathematical Rules

$$\text{Unit 1 Total} = \sum_{i=1}^{8} \text{Count}(\text{U1 Dept}_i)$$

$$\text{Unit 2 Total} = \sum_{i=1}^{8} \text{Count}(\text{U2 Dept}_i)$$

$$\text{Grand Total} = \text{Unit 1 Total} + \text{Unit 2 Total} + \text{STAFF} + \text{SHIFT}$$

*Note: STAFF and SHIFT counts are kept strictly separate from production headcounts and only added in the Grand Total.*

---

## 3. Getting Started & Setup

### Prerequisites
- Node.js >= 20.x
- PostgreSQL >= 14
- Expo CLI (`npx expo`)

### 1. Database Setup & Migrations
```bash
# Clone and enter repo
cd /home/guru/Documents/Garage/Attendance

# Configure environment variables
cp .env.example .env
# Ensure DATABASE_URL is set (e.g. postgresql://guru@localhost:5432/ad_garments_attendance)

# Run migrations
npm run migrate

# Seed initial factory data, departments, default users & reference historical reports
npm run seed
```

### 2. Default Seeded Credentials
- **Supervisor**: `supervisor@adgarments.com` / `Password@123` (Role: `SUPERVISOR`)
- **Manager**: `manager@adgarments.com` / `Password@123` (Role: `MANAGER`)
- **Admin**: `admin@adgarments.com` / `Password@123` (Role: `ADMIN`)

### 3. Running Backend API
```bash
npm run backend:dev
# or
npm run dev --workspace=@ad-garments/api
# Server runs at http://localhost:4000
# Health check: http://localhost:4000/health
```

### 4. Running Frontend Application
```bash
# Web browser:
npm run frontend:dev

# Or Native / Expo Metro (Android / iOS):
npm run frontend:start
```

---

## 4. Testing & Verification

Run the comprehensive unit and integration test suite:

```bash
# Run all tests across workspaces
npm test

# Run domain package tests
npm test --workspace=@ad-garments/domain

# Run API integration tests
npm test --workspace=@ad-garments/api
```

**Results:**
- `@ad-garments/domain`: **12 / 12 passing** (100%)
- `@ad-garments/api`: **13 / 13 passing** (100%)
- **25 total automated tests passing**.
