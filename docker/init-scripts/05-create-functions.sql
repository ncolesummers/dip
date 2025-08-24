-- =============================================================================
-- PostgreSQL Database Initialization - Functions and Triggers
-- =============================================================================
-- 
-- This script creates utility functions and triggers for the DIP application
-- Includes automatic timestamp updates, data validation, and utility functions
--
-- Execution Order: 05
-- =============================================================================

-- =============================================================================
-- UTILITY FUNCTIONS
-- =============================================================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION shared.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to validate document status transitions
CREATE OR REPLACE FUNCTION shared.validate_document_status_transition()
RETURNS TRIGGER AS $$
DECLARE
    valid_transitions TEXT[];
BEGIN
    -- Define valid status transitions
    CASE OLD.status
        WHEN 'received' THEN
            valid_transitions := ARRAY['processing', 'failed'];
        WHEN 'processing' THEN
            valid_transitions := ARRAY['classified', 'failed'];
        WHEN 'classified' THEN
            valid_transitions := ARRAY['routed', 'failed'];
        WHEN 'routed' THEN
            valid_transitions := ARRAY['completed', 'failed'];
        WHEN 'completed' THEN
            valid_transitions := ARRAY['expired']; -- Only allow archival
        WHEN 'failed' THEN
            valid_transitions := ARRAY['processing']; -- Allow retry
        WHEN 'expired' THEN
            valid_transitions := ARRAY[]::TEXT[]; -- No transitions from expired
        ELSE
            RAISE EXCEPTION 'Unknown document status: %', OLD.status;
    END CASE;
    
    -- Check if the new status is valid
    IF NOT (NEW.status::TEXT = ANY(valid_transitions)) AND OLD.status != NEW.status THEN
        RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
    END IF;
    
    -- Update processed_at when status changes to processing
    IF NEW.status = 'processing' AND OLD.status != 'processing' THEN
        NEW.processed_at = CURRENT_TIMESTAMP;
    END IF;
    
    -- Update completed_at when status changes to completed
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        NEW.completed_at = CURRENT_TIMESTAMP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate confidence level from score
CREATE OR REPLACE FUNCTION classifier.calculate_confidence_level(score DECIMAL)
RETURNS classifier.confidence_level AS $$
BEGIN
    CASE
        WHEN score >= 0.8 THEN RETURN 'very_high';
        WHEN score >= 0.6 THEN RETURN 'high';
        WHEN score >= 0.4 THEN RETURN 'medium';
        WHEN score >= 0.2 THEN RETURN 'low';
        ELSE RETURN 'very_low';
    END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to generate document checksum
CREATE OR REPLACE FUNCTION shared.generate_document_checksum(content BYTEA)
RETURNS TEXT AS $$
BEGIN
    RETURN encode(digest(content, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to validate file format
CREATE OR REPLACE FUNCTION shared.validate_file_format(filename TEXT)
RETURNS shared.file_format AS $$
DECLARE
    extension TEXT;
    format shared.file_format;
BEGIN
    -- Extract file extension
    extension := lower(substring(filename from '\.([^.]*)$'));
    
    -- Map extension to format
    CASE extension
        WHEN 'pdf' THEN format := 'pdf';
        WHEN 'doc' THEN format := 'doc';
        WHEN 'docx' THEN format := 'docx';
        WHEN 'txt' THEN format := 'txt';
        WHEN 'rtf' THEN format := 'rtf';
        WHEN 'html', 'htm' THEN format := 'html';
        WHEN 'xml' THEN format := 'xml';
        WHEN 'json' THEN format := 'json';
        ELSE
            RAISE EXCEPTION 'Unsupported file format: %', extension;
    END CASE;
    
    RETURN format;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to search documents by text content
CREATE OR REPLACE FUNCTION shared.search_documents(search_query TEXT)
RETURNS TABLE(
    document_id UUID,
    filename VARCHAR(500),
    status shared.document_status,
    created_at TIMESTAMP WITH TIME ZONE,
    rank REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id,
        d.filename,
        d.status,
        d.created_at,
        ts_rank(to_tsvector('english', d.text_content), plainto_tsquery('english', search_query)) as rank
    FROM shared.documents d
    WHERE to_tsvector('english', d.text_content) @@ plainto_tsquery('english', search_query)
    ORDER BY rank DESC, d.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get document processing statistics
CREATE OR REPLACE FUNCTION shared.get_processing_stats(
    start_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    end_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
)
RETURNS TABLE(
    status shared.document_status,
    count BIGINT,
    avg_processing_time_hours DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.status,
        COUNT(*) as count,
        ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(d.completed_at, CURRENT_TIMESTAMP) - d.created_at)) / 3600), 2) as avg_processing_time_hours
    FROM shared.documents d
    WHERE d.created_at BETWEEN start_date AND end_date
    GROUP BY d.status
    ORDER BY d.status;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old audit logs
CREATE OR REPLACE FUNCTION audit.cleanup_old_events(days_to_keep INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM audit.system_events 
    WHERE occurred_at < CURRENT_TIMESTAMP - (days_to_keep || ' days')::INTERVAL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RAISE NOTICE 'Cleaned up % old audit events (older than % days)', deleted_count, days_to_keep;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to increment usage counters
CREATE OR REPLACE FUNCTION shared.increment_usage_counter(table_name TEXT, record_id UUID)
RETURNS VOID AS $$
DECLARE
    sql_query TEXT;
BEGIN
    sql_query := format('UPDATE %I SET usage_count = usage_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE id = $1', table_name);
    EXECUTE sql_query USING record_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Trigger to auto-update updated_at timestamp on documents
CREATE TRIGGER documents_updated_at_trigger
    BEFORE UPDATE ON shared.documents
    FOR EACH ROW
    EXECUTE FUNCTION shared.update_updated_at();

-- Trigger to validate document status transitions
CREATE TRIGGER documents_status_transition_trigger
    BEFORE UPDATE OF status ON shared.documents
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION shared.validate_document_status_transition();

-- Trigger to auto-update updated_at timestamp on routing rules
CREATE TRIGGER routing_rules_updated_at_trigger
    BEFORE UPDATE ON routing.routing_rules
    FOR EACH ROW
    EXECUTE FUNCTION shared.update_updated_at();

-- Trigger to auto-update updated_at timestamp on response templates
CREATE TRIGGER response_templates_updated_at_trigger
    BEFORE UPDATE ON response.response_templates
    FOR EACH ROW
    EXECUTE FUNCTION shared.update_updated_at();

-- Trigger to auto-update updated_at timestamp on system settings
CREATE TRIGGER system_settings_updated_at_trigger
    BEFORE UPDATE ON config.system_settings
    FOR EACH ROW
    EXECUTE FUNCTION shared.update_updated_at();

-- Trigger to automatically calculate confidence level
CREATE OR REPLACE FUNCTION classifier.auto_calculate_confidence_level()
RETURNS TRIGGER AS $$
BEGIN
    NEW.confidence_level := classifier.calculate_confidence_level(NEW.confidence_score);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER classification_confidence_trigger
    BEFORE INSERT OR UPDATE OF confidence_score ON classifier.document_classifications
    FOR EACH ROW
    EXECUTE FUNCTION classifier.auto_calculate_confidence_level();

-- Trigger to automatically set manual review flag
CREATE OR REPLACE FUNCTION classifier.auto_set_manual_review()
RETURNS TRIGGER AS $$
BEGIN
    -- Require manual review for low confidence classifications
    IF NEW.confidence_score < 0.6 THEN
        NEW.requires_manual_review := TRUE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER classification_manual_review_trigger
    BEFORE INSERT OR UPDATE OF confidence_score ON classifier.document_classifications
    FOR EACH ROW
    EXECUTE FUNCTION classifier.auto_set_manual_review();

-- =============================================================================
-- VIEWS FOR COMMON QUERIES
-- =============================================================================

-- View for document processing pipeline status
CREATE VIEW shared.document_pipeline_status AS
SELECT 
    d.id,
    d.external_id,
    d.filename,
    d.status,
    d.current_stage,
    d.priority,
    d.created_at,
    d.processed_at,
    d.completed_at,
    -- Classification info
    dc.predicted_type,
    dc.confidence_score,
    dc.requires_manual_review,
    -- Routing info
    dr.strategy_used as routing_strategy,
    dr.destination as routing_destination,
    dr.delivered_at as routing_delivered_at,
    -- Response info
    gr.generation_method,
    gr.delivery_status as response_status,
    gr.delivered_at as response_delivered_at
FROM shared.documents d
LEFT JOIN classifier.document_classifications dc ON d.id = dc.document_id
LEFT JOIN routing.document_routing dr ON d.id = dr.document_id
LEFT JOIN response.generated_responses gr ON d.id = gr.document_id;

-- View for active routing rules
CREATE VIEW routing.active_routing_rules AS
SELECT *
FROM routing.routing_rules
WHERE is_active = TRUE
ORDER BY priority DESC, created_at ASC;

-- View for recent system events
CREATE VIEW audit.recent_events AS
SELECT *
FROM audit.system_events
WHERE occurred_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
ORDER BY occurred_at DESC;

-- Log function and trigger creation completion
DO $$
BEGIN
    RAISE NOTICE 'DIP Functions and Triggers created successfully:';
    RAISE NOTICE '- Utility functions for data validation and processing';
    RAISE NOTICE '- Automatic timestamp updates';
    RAISE NOTICE '- Document status transition validation';
    RAISE NOTICE '- Classification confidence calculation';
    RAISE NOTICE '- Text search and statistics functions';
    RAISE NOTICE '- Audit cleanup functions';
    RAISE NOTICE '- Common query views';
END $$;