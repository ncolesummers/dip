-- =============================================================================
-- PostgreSQL Database Initialization - Schema Creation
-- =============================================================================
-- 
-- This script creates the database schemas for organizing tables by domain
-- Each microservice has its own schema plus shared schemas for common data
--
-- Execution Order: 02
-- =============================================================================

-- Create schema for document ingestion service
CREATE SCHEMA IF NOT EXISTS ingestion;
COMMENT ON SCHEMA ingestion IS 'Document ingestion and initial processing';

-- Create schema for document classification service  
CREATE SCHEMA IF NOT EXISTS classifier;
COMMENT ON SCHEMA classifier IS 'AI-powered document classification';

-- Create schema for routing service
CREATE SCHEMA IF NOT EXISTS routing;
COMMENT ON SCHEMA routing IS 'Intelligent document routing logic';

-- Create schema for response service
CREATE SCHEMA IF NOT EXISTS response;
COMMENT ON SCHEMA response IS 'Response generation and delivery';

-- Create schema for shared/common data
CREATE SCHEMA IF NOT EXISTS shared;
COMMENT ON SCHEMA shared IS 'Shared data structures and common entities';

-- Create schema for audit and monitoring
CREATE SCHEMA IF NOT EXISTS audit;
COMMENT ON SCHEMA audit IS 'Audit trails and system monitoring';

-- Create schema for configuration and settings
CREATE SCHEMA IF NOT EXISTS config;
COMMENT ON SCHEMA config IS 'System configuration and settings';

-- Grant permissions on schemas to the application user
GRANT USAGE ON SCHEMA ingestion TO dip_user;
GRANT USAGE ON SCHEMA classifier TO dip_user;
GRANT USAGE ON SCHEMA routing TO dip_user;
GRANT USAGE ON SCHEMA response TO dip_user;
GRANT USAGE ON SCHEMA shared TO dip_user;
GRANT USAGE ON SCHEMA audit TO dip_user;
GRANT USAGE ON SCHEMA config TO dip_user;

-- Grant create permissions (for future table creation)
GRANT CREATE ON SCHEMA ingestion TO dip_user;
GRANT CREATE ON SCHEMA classifier TO dip_user;
GRANT CREATE ON SCHEMA routing TO dip_user;
GRANT CREATE ON SCHEMA response TO dip_user;
GRANT CREATE ON SCHEMA shared TO dip_user;
GRANT CREATE ON SCHEMA audit TO dip_user;
GRANT CREATE ON SCHEMA config TO dip_user;

-- Log schema creation
DO $$
BEGIN
    RAISE NOTICE 'DIP Database Schemas created successfully:';
    RAISE NOTICE '- ingestion: Document ingestion service';
    RAISE NOTICE '- classifier: Document classification service';
    RAISE NOTICE '- routing: Document routing service';
    RAISE NOTICE '- response: Response generation service';
    RAISE NOTICE '- shared: Common shared entities';
    RAISE NOTICE '- audit: Audit and monitoring data';
    RAISE NOTICE '- config: System configuration';
END $$;