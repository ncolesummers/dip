-- =============================================================================
-- PostgreSQL Database Initialization - Extensions
-- =============================================================================
-- 
-- This script creates necessary PostgreSQL extensions for the DIP application
-- Extensions are created in order of dependency
--
-- Execution Order: 01 (first)
-- =============================================================================

-- Enable UUID generation extension (for primary keys)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable full-text search extension (for document search)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Enable JSON functions (for metadata storage)
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Enable additional text search functions
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Enable cryptographic functions (for secure tokens)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Log extension creation
DO $$
BEGIN
    RAISE NOTICE 'DIP Database Extensions created successfully';
    RAISE NOTICE '- uuid-ossp: UUID generation';
    RAISE NOTICE '- pg_trgm: Trigram text search';
    RAISE NOTICE '- btree_gin: JSON indexing';
    RAISE NOTICE '- unaccent: Text normalization';
    RAISE NOTICE '- pgcrypto: Cryptographic functions';
END $$;