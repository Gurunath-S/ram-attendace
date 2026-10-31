-- Migration: 001_initial_schema.sql
-- Initial database schema for A.D. GARMENTS Attendance System

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. FACTORIES
CREATE TABLE IF NOT EXISTS factories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. USERS
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factory_id UUID NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
    display_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL CHECK (role IN ('SUPERVISOR', 'MANAGER', 'ADMIN')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. PRODUCTION UNITS
CREATE TABLE IF NOT EXISTS production_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    factory_id UUID NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
    stable_code VARCHAR(64) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_production_units_code UNIQUE (factory_id, stable_code)
);

-- 4. DEPARTMENTS
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID NOT NULL REFERENCES production_units(id) ON DELETE CASCADE,
    stable_code VARCHAR(64) NOT NULL,
    visible_label VARCHAR(255) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_departments_code UNIQUE (unit_id, stable_code)
);

-- 5. ATTENDANCE REPORTS
CREATE TABLE IF NOT EXISTS attendance_reports (
    id UUID PRIMARY KEY, -- client-generated UUID for offline creation support
    factory_id UUID NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REOPENED')),
    revision INT NOT NULL DEFAULT 1,
    created_by UUID NOT NULL REFERENCES users(id),
    submitted_by UUID REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    submitted_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_factory_report_date UNIQUE (factory_id, report_date)
);

-- 6. ATTENDANCE ENTRIES
CREATE TABLE IF NOT EXISTS attendance_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES attendance_reports(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    headcount INT CHECK (headcount IS NULL OR headcount >= 0),
    is_entered BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_report_department UNIQUE (report_id, department_id)
);

-- 7. REPORT ADJUSTMENTS (STAFF & SHIFT)
CREATE TABLE IF NOT EXISTS report_adjustments (
    report_id UUID PRIMARY KEY REFERENCES attendance_reports(id) ON DELETE CASCADE,
    staff_count INT CHECK (staff_count IS NULL OR staff_count >= 0),
    shift_count INT CHECK (shift_count IS NULL OR shift_count >= 0),
    is_staff_entered BOOLEAN NOT NULL DEFAULT FALSE,
    is_shift_entered BOOLEAN NOT NULL DEFAULT FALSE
);

-- 8. AUDIT EVENTS
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES attendance_reports(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES users(id),
    action VARCHAR(64) NOT NULL,
    revision INT NOT NULL,
    change_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. SYNCHRONIZATION OPERATIONS (Idempotent tracking)
CREATE TABLE IF NOT EXISTS sync_operations (
    operation_id UUID PRIMARY KEY,
    report_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id),
    operation_type VARCHAR(32) NOT NULL,
    base_revision INT NOT NULL,
    processing_status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED',
    stored_outcome JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. REPORT DOCUMENTS (Archived PDF & Excel history)
CREATE TABLE IF NOT EXISTS report_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES attendance_reports(id) ON DELETE CASCADE,
    revision INT NOT NULL,
    document_type VARCHAR(32) NOT NULL CHECK (document_type IN ('PDF', 'EXCEL')),
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    generated_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_reports_factory_date ON attendance_reports(factory_id, report_date);
CREATE INDEX IF NOT EXISTS idx_entries_report ON attendance_entries(report_id);
CREATE INDEX IF NOT EXISTS idx_audit_report ON audit_events(report_id, revision);
CREATE INDEX IF NOT EXISTS idx_sync_ops_report ON sync_operations(report_id);
CREATE INDEX IF NOT EXISTS idx_sync_ops_user ON sync_operations(user_id);
CREATE INDEX IF NOT EXISTS idx_report_documents_report ON report_documents(report_id, revision);
