-- =============================================================================
-- PostgreSQL Database Initialization - Seed Data
-- =============================================================================
-- 
-- This script inserts initial seed data for development and testing
-- Includes configuration settings, routing rules, and response templates
--
-- Execution Order: 06 (final)
-- =============================================================================

-- =============================================================================
-- SYSTEM CONFIGURATION SEED DATA
-- =============================================================================

INSERT INTO config.system_settings (setting_key, setting_value, setting_type, description, category, is_sensitive) VALUES
-- General application settings
('app.name', 'Document Intelligence Platform', 'string', 'Application display name', 'general', false),
('app.version', '1.0.0', 'string', 'Current application version', 'general', false),
('app.environment', 'development', 'string', 'Current environment (development/staging/production)', 'general', false),

-- Document processing settings
('documents.max_file_size', '52428800', 'number', 'Maximum file size in bytes (50MB)', 'documents', false),
('documents.allowed_formats', '["pdf", "doc", "docx", "txt", "rtf"]', 'json', 'Allowed document formats', 'documents', false),
('documents.retention_days', '365', 'number', 'Document retention period in days', 'documents', false),
('documents.auto_expire', 'true', 'boolean', 'Automatically expire old documents', 'documents', false),

-- Classification settings
('classification.confidence_threshold', '0.8', 'number', 'Minimum confidence threshold for auto-classification', 'classification', false),
('classification.manual_review_threshold', '0.6', 'number', 'Confidence threshold below which manual review is required', 'classification', false),
('classification.default_model', 'llama2:7b', 'string', 'Default AI model for classification', 'classification', false),
('classification.batch_size', '10', 'number', 'Maximum documents to classify in a single batch', 'classification', false),

-- Routing settings
('routing.default_strategy', 'rule_based', 'string', 'Default routing strategy', 'routing', false),
('routing.fallback_destination', '/dev/null', 'string', 'Fallback destination when no rules match', 'routing', false),
('routing.retry_attempts', '3', 'number', 'Number of retry attempts for failed routing', 'routing', false),
('routing.retry_delay_seconds', '30', 'number', 'Delay between retry attempts in seconds', 'routing', false),

-- Response generation settings
('response.default_method', 'template_based', 'string', 'Default response generation method', 'response', false),
('response.ai_model', 'llama2:13b', 'string', 'AI model for response generation', 'response', false),
('response.max_response_length', '4000', 'number', 'Maximum response length in characters', 'response', false),
('response.template_cache_ttl', '3600', 'number', 'Template cache TTL in seconds', 'response', false),

-- Monitoring and logging settings
('monitoring.metrics_enabled', 'true', 'boolean', 'Enable metrics collection', 'monitoring', false),
('monitoring.detailed_logging', 'true', 'boolean', 'Enable detailed logging in development', 'monitoring', false),
('monitoring.health_check_interval', '30', 'number', 'Health check interval in seconds', 'monitoring', false),
('monitoring.alert_thresholds', '{"error_rate": 0.05, "response_time": 5000}', 'json', 'Alerting thresholds', 'monitoring', false),

-- Security settings
('security.max_upload_size', '52428800', 'number', 'Maximum upload size in bytes', 'security', false),
('security.allowed_origins', '["http://localhost:3000", "http://localhost:8080"]', 'json', 'Allowed CORS origins', 'security', false),
('security.rate_limit_requests', '100', 'number', 'Rate limit requests per window', 'security', false),
('security.rate_limit_window', '60', 'number', 'Rate limit window in seconds', 'security', false),

-- Integration settings
('kafka.default_topic_partitions', '3', 'number', 'Default number of partitions for new topics', 'kafka', false),
('kafka.default_replication_factor', '1', 'number', 'Default replication factor for new topics', 'kafka', false),
('kafka.consumer_timeout', '30000', 'number', 'Consumer timeout in milliseconds', 'kafka', false),
('kafka.producer_timeout', '10000', 'number', 'Producer timeout in milliseconds', 'kafka', false);

-- =============================================================================
-- ROUTING RULES SEED DATA
-- =============================================================================

INSERT INTO routing.routing_rules (name, description, conditions, strategy, destination_endpoint, destination_queue, priority, is_active) VALUES
-- Invoice routing rules
('Route Invoices to Accounting', 
 'Route all invoice documents to the accounting system',
 '{"document_type": "invoice", "confidence_score": {"min": 0.8}}',
 'rule_based',
 'http://accounting-system.internal/invoices',
 'accounting.invoices',
 100,
 true),

-- High priority document routing
('Route Urgent Documents',
 'Route all urgent priority documents to immediate processing queue',
 '{"priority": "urgent"}',
 'priority_based',
 'http://urgent-processor.internal/process',
 'processing.urgent',
 200,
 true),

-- Contract routing rules
('Route Contracts to Legal',
 'Route contract documents to legal department',
 '{"document_type": "contract", "confidence_score": {"min": 0.7}}',
 'rule_based',
 'http://legal-system.internal/contracts',
 'legal.contracts',
 90,
 true),

-- Report routing rules
('Route Reports to Analytics',
 'Route report documents to analytics system',
 '{"document_type": "report"}',
 'rule_based',
 'http://analytics-system.internal/reports',
 'analytics.reports',
 80,
 true),

-- Fallback routing rule
('Default Routing',
 'Default routing for documents that don\'t match other rules',
 '{}',
 'round_robin',
 'http://default-processor.internal/process',
 'processing.default',
 1,
 true);

-- =============================================================================
-- RESPONSE TEMPLATES SEED DATA
-- =============================================================================

INSERT INTO response.response_templates (name, description, template_content, template_format, document_types, is_active) VALUES
-- Invoice processing templates
('Invoice Received Confirmation',
 'Confirmation template for received invoices',
 'Thank you for submitting your invoice. We have received your {{document_type}} document "{{filename}}" and it has been assigned reference number {{external_id}}. The document is currently being processed and you should expect a response within {{processing_sla}} business days.',
 'text',
 '{"invoice"}',
 true),

('Invoice Processing Complete',
 'Template for completed invoice processing',
 'Your invoice {{filename}} (Reference: {{external_id}}) has been successfully processed and {{routing_destination}}. Processing completed on {{completed_date}}. If you have any questions, please reference this confirmation number: {{confirmation_id}}.',
 'text',
 '{"invoice"}',
 true),

-- Contract processing templates
('Contract Review Initiated',
 'Template for contract review initiation',
 'Your contract document "{{filename}}" has been received and forwarded to our legal department for review. Reference number: {{external_id}}. You will be notified once the review is complete. Estimated review time: {{estimated_processing_time}}.',
 'text',
 '{"contract"}',
 true),

-- Report processing templates
('Report Analysis Complete',
 'Template for completed report analysis',
 'Your report "{{filename}}" has been analyzed and the results have been forwarded to the appropriate department. Document classification: {{predicted_type}} ({{confidence_score}}% confidence). Analysis completed on {{completed_date}}.',
 'text',
 '{"report"}',
 true),

-- Error handling templates
('Processing Error Notification',
 'Template for processing error notifications',
 'We encountered an issue processing your document "{{filename}}" (Reference: {{external_id}}). Error: {{error_message}}. Our team has been notified and will investigate. Please contact support if this issue persists.',
 'text',
 '{"invoice", "contract", "report", "form", "letter", "memo", "other"}',
 true),

-- Generic templates
('Document Received',
 'Generic document received confirmation',
 'Thank you for submitting your document. We have received "{{filename}}" and assigned it reference number {{external_id}}. Your document is currently in the {{current_stage}} stage of processing.',
 'text',
 '{"invoice", "contract", "report", "form", "letter", "memo", "other"}',
 true),

('Processing Complete',
 'Generic processing completion template',
 'Your document "{{filename}}" (Reference: {{external_id}}) has been successfully processed. Classification: {{predicted_type}}. The document has been {{routing_action}} and processing is now complete.',
 'text',
 '{"invoice", "contract", "report", "form", "letter", "memo", "other"}',
 true),

-- HTML templates for rich formatting
('Invoice HTML Receipt',
 'Rich HTML template for invoice receipts',
 '<!DOCTYPE html><html><head><title>Invoice Receipt</title></head><body><h2>Invoice Processing Receipt</h2><p><strong>Document:</strong> {{filename}}</p><p><strong>Reference:</strong> {{external_id}}</p><p><strong>Status:</strong> {{status}}</p><p><strong>Processed:</strong> {{completed_date}}</p><hr><p>This invoice has been successfully processed and forwarded to accounting. Thank you for your business.</p></body></html>',
 'html',
 '{"invoice"}',
 true);

-- =============================================================================
-- INITIAL KAFKA TOPICS SETUP DATA
-- =============================================================================
-- Note: This would typically be handled by Kafka auto-creation or separate scripts
-- Documented here for reference

-- Documents to be created by application:
-- documents.ingested
-- documents.classified  
-- documents.routed
-- responses.generated
-- documents.failed
-- classification.failed
-- routing.failed
-- response.failed
-- system.metrics
-- system.health
-- system.audit

-- =============================================================================
-- DEVELOPMENT TEST DATA (Optional - only for development)
-- =============================================================================

-- Insert some test documents for development (only if in development mode)
DO $$
DECLARE
    test_doc_id UUID;
BEGIN
    -- Check if we're in development mode
    IF EXISTS (SELECT 1 FROM config.system_settings WHERE setting_key = 'app.environment' AND setting_value = 'development') THEN
        
        -- Insert test invoice document
        INSERT INTO shared.documents (
            external_id, filename, original_filename, file_size, file_format, 
            mime_type, checksum, status, priority, text_content, metadata
        ) VALUES (
            'TEST-INV-001',
            'test_invoice_001.pdf',
            'sample_invoice.pdf',
            245760,
            'pdf',
            'application/pdf',
            'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
            'received',
            'medium',
            'INVOICE #INV-2024-001 Date: 2024-01-15 Bill To: ACME Corp Amount: $1,234.56 Due Date: 2024-02-15',
            '{"invoice_number": "INV-2024-001", "amount": 1234.56, "currency": "USD", "due_date": "2024-02-15"}'::jsonb
        ) RETURNING id INTO test_doc_id;
        
        -- Insert test classification for the document
        INSERT INTO classifier.document_classifications (
            document_id, predicted_type, confidence_score, model_name, processing_time_ms
        ) VALUES (
            test_doc_id, 'invoice', 0.95, 'llama2:7b', 1250
        );
        
        -- Insert test contract document
        INSERT INTO shared.documents (
            external_id, filename, original_filename, file_size, file_format,
            mime_type, checksum, status, priority, text_content, metadata
        ) VALUES (
            'TEST-CONTRACT-001',
            'test_contract_001.docx',
            'service_agreement.docx',
            156789,
            'docx',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef1234567',
            'classified',
            'high',
            'SERVICE AGREEMENT This agreement is between Company A and Company B for software services...',
            '{"contract_type": "service_agreement", "parties": ["Company A", "Company B"], "effective_date": "2024-01-01"}'::jsonb
        );
        
        RAISE NOTICE 'Development test data inserted successfully';
    END IF;
END $$;

-- Log seed data completion
DO $$
BEGIN
    RAISE NOTICE 'DIP Seed Data inserted successfully:';
    RAISE NOTICE '- System configuration settings';
    RAISE NOTICE '- Default routing rules';
    RAISE NOTICE '- Response templates';
    RAISE NOTICE '- Development test data (if in development mode)';
    RAISE NOTICE '';
    RAISE NOTICE 'Database initialization complete!';
    RAISE NOTICE 'The DIP system is ready for use.';
END $$;