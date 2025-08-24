-- =============================================================================
-- PostgreSQL Database Initialization - Core Tables
-- =============================================================================
-- 
-- This script creates the core tables for the DIP application
-- Tables are organized by schema and include proper indexing and constraints
--
-- Execution Order: 04
-- =============================================================================

-- =============================================================================
-- SHARED SCHEMA TABLES
-- =============================================================================

-- Documents table (main entity)
CREATE TABLE shared.documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_id VARCHAR(255) UNIQUE, -- Client-provided ID
    filename VARCHAR(500) NOT NULL,
    original_filename VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL CHECK (file_size > 0),
    file_format shared.file_format NOT NULL,
    mime_type VARCHAR(100),
    checksum VARCHAR(64) NOT NULL, -- SHA-256 hash
    
    -- Processing metadata
    status shared.document_status DEFAULT 'received',
    priority shared.priority_level DEFAULT 'medium',
    current_stage shared.processing_stage DEFAULT 'ingestion',
    
    -- Content metadata
    page_count INTEGER,
    text_content TEXT,
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Versioning
    version INTEGER DEFAULT 1,
    
    -- Source tracking
    source_system VARCHAR(100),
    source_reference VARCHAR(255),
    
    CONSTRAINT documents_checksum_unique UNIQUE (checksum)
);

-- Create indexes on documents table
CREATE INDEX idx_documents_status ON shared.documents (status);
CREATE INDEX idx_documents_priority ON shared.documents (priority);
CREATE INDEX idx_documents_created_at ON shared.documents (created_at);
CREATE INDEX idx_documents_file_format ON shared.documents (file_format);
CREATE INDEX idx_documents_current_stage ON shared.documents (current_stage);
CREATE INDEX idx_documents_external_id ON shared.documents (external_id);
CREATE INDEX idx_documents_metadata ON shared.documents USING GIN (metadata);
CREATE INDEX idx_documents_text_search ON shared.documents USING GIN (to_tsvector('english', text_content));

-- Document relationships table (for document hierarchies)
CREATE TABLE shared.document_relationships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_document_id UUID REFERENCES shared.documents(id) ON DELETE CASCADE,
    child_document_id UUID REFERENCES shared.documents(id) ON DELETE CASCADE,
    relationship_type VARCHAR(50) NOT NULL, -- 'attachment', 'version', 'related'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(parent_document_id, child_document_id, relationship_type)
);

-- =============================================================================
-- INGESTION SCHEMA TABLES
-- =============================================================================

-- Document ingestion log
CREATE TABLE ingestion.ingestion_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES shared.documents(id) ON DELETE CASCADE,
    
    -- Ingestion details
    source_path VARCHAR(1000),
    ingestion_method VARCHAR(50), -- 'upload', 'api', 'batch', 'email'
    client_ip INET,
    user_agent TEXT,
    
    -- Processing details
    processing_time_ms INTEGER,
    file_validation_passed BOOLEAN DEFAULT FALSE,
    virus_scan_passed BOOLEAN DEFAULT FALSE,
    content_extracted BOOLEAN DEFAULT FALSE,
    
    -- Error tracking
    error_count INTEGER DEFAULT 0,
    last_error TEXT,
    
    -- Timestamps
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    ingestion_metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_ingestion_log_document_id ON ingestion.ingestion_log (document_id);
CREATE INDEX idx_ingestion_log_started_at ON ingestion.ingestion_log (started_at);
CREATE INDEX idx_ingestion_log_method ON ingestion.ingestion_log (ingestion_method);

-- =============================================================================
-- CLASSIFIER SCHEMA TABLES
-- =============================================================================

-- Document classifications
CREATE TABLE classifier.document_classifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES shared.documents(id) ON DELETE CASCADE,
    
    -- Classification results
    predicted_type shared.document_type NOT NULL,
    confidence_score DECIMAL(5,4) CHECK (confidence_score >= 0 AND confidence_score <= 1),
    confidence_level classifier.confidence_level NOT NULL,
    
    -- Model information
    model_name VARCHAR(100) NOT NULL,
    model_version VARCHAR(50),
    
    -- Alternative predictions (top 3)
    alternative_predictions JSONB DEFAULT '[]',
    
    -- Processing details
    processing_time_ms INTEGER,
    features_used JSONB DEFAULT '{}',
    
    -- Manual review
    requires_manual_review BOOLEAN DEFAULT FALSE,
    manual_review_completed BOOLEAN DEFAULT FALSE,
    manual_classification shared.document_type,
    reviewer_id VARCHAR(100),
    review_notes TEXT,
    
    -- Timestamps
    classified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    classification_metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_classifications_document_id ON classifier.document_classifications (document_id);
CREATE INDEX idx_classifications_predicted_type ON classifier.document_classifications (predicted_type);
CREATE INDEX idx_classifications_confidence ON classifier.document_classifications (confidence_score);
CREATE INDEX idx_classifications_manual_review ON classifier.document_classifications (requires_manual_review);

-- =============================================================================
-- ROUTING SCHEMA TABLES
-- =============================================================================

-- Routing rules
CREATE TABLE routing.routing_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL UNIQUE,
    description TEXT,
    
    -- Rule conditions (JSON)
    conditions JSONB NOT NULL,
    
    -- Routing configuration
    strategy routing.strategy_type DEFAULT 'rule_based',
    destination_endpoint VARCHAR(500),
    destination_queue VARCHAR(200),
    
    -- Rule metadata
    priority INTEGER DEFAULT 100,
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITH TIME ZONE,
    
    -- Statistics
    usage_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0
);

-- Document routing log
CREATE TABLE routing.document_routing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES shared.documents(id) ON DELETE CASCADE,
    
    -- Routing details
    routing_rule_id UUID REFERENCES routing.routing_rules(id),
    strategy_used routing.strategy_type NOT NULL,
    destination VARCHAR(500) NOT NULL,
    
    -- Processing details
    processing_time_ms INTEGER,
    routing_score DECIMAL(5,4),
    
    -- Status tracking
    routed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP WITH TIME ZONE,
    delivery_confirmed BOOLEAN DEFAULT FALSE,
    
    -- Error tracking
    retry_count INTEGER DEFAULT 0,
    last_error TEXT,
    
    -- Metadata
    routing_metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_routing_document_id ON routing.document_routing (document_id);
CREATE INDEX idx_routing_rule_id ON routing.document_routing (routing_rule_id);
CREATE INDEX idx_routing_strategy ON routing.document_routing (strategy_used);

-- =============================================================================
-- RESPONSE SCHEMA TABLES
-- =============================================================================

-- Response templates
CREATE TABLE response.response_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL UNIQUE,
    description TEXT,
    
    -- Template content
    template_content TEXT NOT NULL,
    template_format VARCHAR(50) DEFAULT 'text', -- 'text', 'html', 'json'
    
    -- Applicability
    document_types shared.document_type[] DEFAULT '{}',
    conditions JSONB DEFAULT '{}',
    
    -- Metadata
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITH TIME ZONE,
    
    -- Statistics
    usage_count INTEGER DEFAULT 0
);

-- Generated responses
CREATE TABLE response.generated_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES shared.documents(id) ON DELETE CASCADE,
    
    -- Response content
    response_content TEXT NOT NULL,
    response_format VARCHAR(50) DEFAULT 'text',
    
    -- Generation details
    generation_method response.generation_method NOT NULL,
    template_id UUID REFERENCES response.response_templates(id),
    model_name VARCHAR(100),
    model_version VARCHAR(50),
    
    -- Processing details
    processing_time_ms INTEGER,
    token_count INTEGER,
    
    -- Quality metrics
    quality_score DECIMAL(5,4),
    requires_review BOOLEAN DEFAULT FALSE,
    
    -- Status
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP WITH TIME ZONE,
    delivery_status VARCHAR(50) DEFAULT 'pending',
    
    -- Metadata
    response_metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_responses_document_id ON response.generated_responses (document_id);
CREATE INDEX idx_responses_template_id ON response.generated_responses (template_id);
CREATE INDEX idx_responses_method ON response.generated_responses (generation_method);

-- =============================================================================
-- AUDIT SCHEMA TABLES
-- =============================================================================

-- System audit log
CREATE TABLE audit.system_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Event details
    event_type VARCHAR(100) NOT NULL,
    event_name VARCHAR(200) NOT NULL,
    severity audit.severity_level DEFAULT 'info',
    
    -- Context
    service_name VARCHAR(100),
    document_id UUID,
    user_id VARCHAR(100),
    session_id VARCHAR(100),
    
    -- Event data
    event_data JSONB DEFAULT '{}',
    message TEXT,
    
    -- Error details (if applicable)
    error_code VARCHAR(100),
    error_message TEXT,
    stack_trace TEXT,
    
    -- Request context
    request_id VARCHAR(100),
    correlation_id VARCHAR(100),
    client_ip INET,
    
    -- Timing
    occurred_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    duration_ms INTEGER
);

CREATE INDEX idx_audit_occurred_at ON audit.system_events (occurred_at);
CREATE INDEX idx_audit_event_type ON audit.system_events (event_type);
CREATE INDEX idx_audit_service ON audit.system_events (service_name);
CREATE INDEX idx_audit_document_id ON audit.system_events (document_id);
CREATE INDEX idx_audit_severity ON audit.system_events (severity);

-- =============================================================================
-- CONFIG SCHEMA TABLES
-- =============================================================================

-- System configuration
CREATE TABLE config.system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Setting details
    setting_key VARCHAR(200) NOT NULL UNIQUE,
    setting_value TEXT,
    setting_type VARCHAR(50) DEFAULT 'string', -- 'string', 'number', 'boolean', 'json'
    
    -- Metadata
    description TEXT,
    category VARCHAR(100),
    is_sensitive BOOLEAN DEFAULT FALSE,
    is_readonly BOOLEAN DEFAULT FALSE,
    
    -- Validation
    validation_rules JSONB DEFAULT '{}',
    default_value TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(100)
);

CREATE INDEX idx_settings_key ON config.system_settings (setting_key);
CREATE INDEX idx_settings_category ON config.system_settings (category);

-- Log table creation completion
DO $$
BEGIN
    RAISE NOTICE 'DIP Core Tables created successfully:';
    RAISE NOTICE '- Shared: documents, document_relationships';
    RAISE NOTICE '- Ingestion: ingestion_log';
    RAISE NOTICE '- Classifier: document_classifications';
    RAISE NOTICE '- Routing: routing_rules, document_routing';
    RAISE NOTICE '- Response: response_templates, generated_responses';
    RAISE NOTICE '- Audit: system_events';
    RAISE NOTICE '- Config: system_settings';
END $$;