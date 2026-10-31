# A.D. GARMENTS Attendance Mobile & Backend System

A production-grade, offline-first attendance reporting application engineered specifically for **A.D. GARMENTS** garment manufacturing operations. Replaces manual department headcount calculations and paper records across two manufacturing units (Unit-1 and Unit-2).

---

## 1. System Architecture

The project is structured as an enterprise TypeScript monorepo with NPM workspaces:

```
├── packages/
│   └── domain/                 # Core domain logic, validation schemas & calculation engine
│       ├── src/attendance-types.ts
│       ├── src/calculations.ts # Exact Unit-1, Unit-2, Staff, Shift & Grand Total formulas
│       ├── src/date-rules.ts   # Week/month bounds & date normalization
│       └── src/validation.ts   # Zod schemas for drafts, submission & sync
├── apps/
│   ├── api/                    # Node.js + Express + PostgreSQL REST Backend
│   │   ├── src/controllers/   # Attendance, Auth, Report & Sync endpoints
│   │   ├── src/services/      # Concurrency revisions, PDF/Excel generation, Sync push/pull
│   │   ├── src/repositories/  # Transactional PostgreSQL access & audit logs
│   │   └── tests/             # End-to-end API integration tests
│   └── mobile/                 # Cross-platform React Native + Expo App
│       ├── src/app/           # Expo Router file-based screens (Dashboard, Entry, Reports, History, Settings)
│       ├── src/services/      # SQLite local database, Sync Engine, PDF & Share service
│       ├── src/context/       # Offline session authentication & role management
│       └── src/theme/         # Industrial garment manufacturing UI theme
└── database/
    └── migrations/            # Versioned SQL migrations (Factories, Units, Depts, Reports, Entries, Adjustments, Audits, Sync Ops)
```

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
psql -d ad_garments_attendance -f database/migrations/001_initial_schema.sql

# Seed initial factory data, departments, default users & reference historical reports
npx tsx apps/api/src/db/seed.ts
```

### 2. Default Seeded Credentials
- **Supervisor**: `supervisor@adgarments.com` / `Password@123` (Role: `SUPERVISOR`)
- **Manager**: `manager@adgarments.com` / `Password@123` (Role: `MANAGER`)
- **Admin**: `admin@adgarments.com` / `Password@123` (Role: `ADMIN`)

### 3. Running Backend API
```bash
npm run dev --workspace=@ad-garments/api
# Server runs at http://localhost:3000
# Health check: http://localhost:3000/health
```

### 4. Running Mobile Application
```bash
# Start Expo development server (Web / Android / iOS)
npm run start --workspace=@ad-garments/mobile
# Press 'w' to run in browser, or scan QR code in Expo Go app on Android/iOS
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
