-- =============================================================================
-- PostgreSQL Database Initialization - Custom Types
-- =============================================================================
-- 
-- This script creates custom PostgreSQL types used across the application
-- These types ensure data consistency and provide better type safety
--
-- Execution Order: 03
-- =============================================================================

-- Document processing status enum
CREATE TYPE shared.document_status AS ENUM (
    'received',
    'processing',
    'classified',
    'routed',
    'completed',
    'failed',
    'expired'
);

-- Document types/categories enum
CREATE TYPE shared.document_type AS ENUM (
    'invoice',
    'receipt',
    'contract',
    'report',
    'form',
    'letter',
    'memo',
    'other'
);

-- Processing priority levels
CREATE TYPE shared.priority_level AS ENUM (
    'low',
    'medium', 
    'high',
    'urgent'
);

-- Service health status
CREATE TYPE shared.health_status AS ENUM (
    'healthy',
    'degraded',
    'unhealthy',
    'unknown'
);

-- Classification confidence levels
CREATE TYPE classifier.confidence_level AS ENUM (
    'very_low',    -- 0.0 - 0.2
    'low',         -- 0.2 - 0.4
    'medium',      -- 0.4 - 0.6
    'high',        -- 0.6 - 0.8
    'very_high'    -- 0.8 - 1.0
);

-- Routing strategies
CREATE TYPE routing.strategy_type AS ENUM (
    'round_robin',
    'priority_based',
    'load_balanced',
    'rule_based',
    'manual'
);

-- Event severity levels for audit
CREATE TYPE audit.severity_level AS ENUM (
    'trace',
    'debug',
    'info',
    'warn',
    'error',
    'fatal'
);

-- Response generation methods
CREATE TYPE response.generation_method AS ENUM (
    'template_based',
    'ai_generated',
    'hybrid',
    'manual'
);

-- File format types
CREATE TYPE shared.file_format AS ENUM (
    'pdf',
    'doc',
    'docx',
    'txt',
    'rtf',
    'html',
    'xml',
    'json'
);

-- Processing stage tracker
CREATE TYPE shared.processing_stage AS ENUM (
    'ingestion',
    'preprocessing',
    'classification',
    'routing',
    'response_generation',
    'delivery',
    'archival'
);

-- Log custom type creation
DO $$
BEGIN
    RAISE NOTICE 'DIP Custom Types created successfully:';
    RAISE NOTICE '- Document processing enums (status, type, priority)';
    RAISE NOTICE '- Service health and monitoring types';
    RAISE NOTICE '- Classification confidence levels';
    RAISE NOTICE '- Routing and response generation types';
    RAISE NOTICE '- Audit and logging types';
END $$;