#!/bin/bash

# ============================================================================
# JERICHO Security Type-C - Installation Verification Script
# Tests all components after installation
# ============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test results
PASSED=0
FAILED=0

log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASSED++))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAILED++))
}

# Test system services
test_services() {
    log_test "Testing system services..."
    
    # PostgreSQL
    if systemctl is-active --quiet postgresql; then
        log_pass "PostgreSQL service is running"
    else
        log_fail "PostgreSQL service is not running"
    fi
    
    # Redis
    if systemctl is-active --quiet redis-server; then
        log_pass "Redis service is running"
    else
        log_fail "Redis service is not running"
    fi
    
    # Nginx
    if systemctl is-active --quiet nginx; then
        log_pass "Nginx service is running"
    else
        log_fail "Nginx service is not running"
    fi
}

# Test database connectivity
test_database() {
    log_test "Testing database connectivity..."
    
    if PGPASSWORD="jericho_secure_2024" psql -h localhost -U jericho -d jericho_security -c "SELECT 1;" > /dev/null 2>&1; then
        log_pass "Database connection successful"
    else
        log_fail "Database connection failed"
    fi
}

# Test Redis connectivity
test_redis() {
    log_test "Testing Redis connectivity..."
    
    if redis-cli ping > /dev/null 2>&1; then
        log_pass "Redis connection successful"
    else
        log_fail "Redis connection failed"
    fi
}

# Test application processes
test_application() {
    log_test "Testing application processes..."
    
    if pm2 list | grep -q "jericho-backend.*online"; then
        log_pass "Backend application is running"
    else
        log_fail "Backend application is not running"
    fi
}

# Test API endpoints
test_api() {
    log_test "Testing API endpoints..."
    
    # Health check
    if curl -s http://localhost:5000/api/health > /dev/null 2>&1; then
        log_pass "Backend API health check successful"
    else
        log_fail "Backend API health check failed"
    fi
    
    # Frontend via Nginx
    if curl -s http://localhost/ > /dev/null 2>&1; then
        log_pass "Frontend access via Nginx successful"
    else
        log_fail "Frontend access via Nginx failed"
    fi
}

# Test RTSP streaming components
test_streaming() {
    log_test "Testing RTSP streaming components..."
    
    # Check FFmpeg
    if command -v ffmpeg > /dev/null 2>&1; then
        log_pass "FFmpeg is installed and available"
    else
        log_fail "FFmpeg is not installed or not in PATH"
    fi
    
    # Check streaming API
    if curl -s http://localhost:8080/api/streams > /dev/null 2>&1; then
        log_pass "Streaming API is accessible"
    else
        log_fail "Streaming API is not accessible"
    fi
    
    # Check HLS directory
    if [[ -d "/opt/jericho-security/backend/public/hls" ]]; then
        log_pass "HLS directory exists"
    else
        log_fail "HLS directory does not exist"
    fi
}

# Test file permissions and directories
test_filesystem() {
    log_test "Testing filesystem and permissions..."
    
    # Check main directory
    if [[ -d "/opt/jericho-security" ]]; then
        log_pass "Main application directory exists"
    else
        log_fail "Main application directory does not exist"
    fi
    
    # Check logs directory
    if [[ -d "/opt/jericho-security/backend/logs" ]]; then
        log_pass "Logs directory exists"
    else
        log_fail "Logs directory does not exist"
    fi
    
    # Check uploads directory
    if [[ -d "/opt/jericho-security/backend/uploads" ]]; then
        log_pass "Uploads directory exists"
    else
        log_fail "Uploads directory does not exist"
    fi
    
    # Check environment file
    if [[ -f "/opt/jericho-security/backend/.env" ]]; then
        log_pass "Environment configuration file exists"
    else
        log_fail "Environment configuration file does not exist"
    fi
}

# Test network ports
test_ports() {
    log_test "Testing network ports..."
    
    # Backend port
    if netstat -tlnp | grep -q ":5000"; then
        log_pass "Backend port 5000 is listening"
    else
        log_fail "Backend port 5000 is not listening"
    fi
    
    # Nginx port
    if netstat -tlnp | grep -q ":80"; then
        log_pass "Nginx port 80 is listening"
    else
        log_fail "Nginx port 80 is not listening"
    fi
    
    # Streaming ports
    if netstat -tlnp | grep -q ":8080"; then
        log_pass "Streaming HTTP port 8080 is listening"
    else
        log_fail "Streaming HTTP port 8080 is not listening"
    fi
}

# Test firewall configuration
test_firewall() {
    log_test "Testing firewall configuration..."
    
    if sudo ufw status | grep -q "Status: active"; then
        log_pass "UFW firewall is active"
        
        # Check if required ports are allowed
        if sudo ufw status | grep -q "80/tcp"; then
            log_pass "HTTP port 80 is allowed through firewall"
        else
            log_fail "HTTP port 80 is not allowed through firewall"
        fi
        
        if sudo ufw status | grep -q "5000/tcp"; then
            log_pass "Backend port 5000 is allowed through firewall"
        else
            log_fail "Backend port 5000 is not allowed through firewall"
        fi
    else
        log_fail "UFW firewall is not active"
    fi
}

# Test management tools
test_management() {
    log_test "Testing management tools..."
    
    if command -v jericho-status > /dev/null 2>&1; then
        log_pass "jericho-status command is available"
    else
        log_fail "jericho-status command is not available"
    fi
}

# Performance test with test stream
test_streaming_functionality() {
    log_test "Testing streaming functionality with test stream..."
    
    # Add a test stream
    if curl -s -X POST http://localhost:5000/api/cameras/test-verification/stream \
        -H "Content-Type: application/json" \
        -d '{"rtspUrl": "rtsp://wowzaec2demo.streamlock.net/vod/mp4:BigBuckBunny_115k.mov"}' > /dev/null 2>&1; then
        log_pass "Test stream creation successful"
        
        # Wait a moment for stream to initialize
        sleep 3
        
        # Check if stream is listed
        if curl -s http://localhost:8080/api/streams | grep -q "test-verification"; then
            log_pass "Test stream is listed in streaming API"
        else
            log_fail "Test stream is not listed in streaming API"
        fi
        
        # Clean up test stream
        curl -s -X DELETE http://localhost:5000/api/cameras/test-verification/stream > /dev/null 2>&1
        
    else
        log_fail "Test stream creation failed"
    fi
}

# Main verification function
main() {
    echo -e "${BLUE}============================================"
    echo "JERICHO Security Type-C - Verification Test"
    echo -e "============================================${NC}"
    echo
    
    # Run all tests
    test_services
    test_database
    test_redis
    test_application
    test_api
    test_streaming
    test_filesystem
    test_ports
    test_firewall
    test_management
    test_streaming_functionality
    
    echo
    echo -e "${BLUE}============================================"
    echo "TEST RESULTS"
    echo -e "============================================${NC}"
    echo -e "Tests Passed: ${GREEN}$PASSED${NC}"
    echo -e "Tests Failed: ${RED}$FAILED${NC}"
    echo
    
    if [ $FAILED -eq 0 ]; then
        echo -e "${GREEN}🎉 ALL TESTS PASSED!${NC}"
        echo -e "${GREEN}Your JERICHO Security system is ready to use!${NC}"
        echo
        echo -e "${BLUE}Next Steps:${NC}"
        echo "1. Open browser: http://$(ip route get 1 | awk '{print $7; exit}')"
        echo "2. Login with: admin / admin123!"
        echo "3. Change default password"
        echo "4. Add your Hikvision credentials"
        echo "5. Discover and add cameras"
        
        exit 0
    else
        echo -e "${RED}❌ SOME TESTS FAILED!${NC}"
        echo -e "${YELLOW}Please check the failed tests above and resolve issues.${NC}"
        echo
        echo -e "${BLUE}Common Solutions:${NC}"
        echo "• Run: pm2 restart jericho-backend"
        echo "• Check logs: pm2 logs jericho-backend"
        echo "• Verify services: jericho-status"
        echo "• Check configuration: /opt/jericho-security/backend/.env"
        
        exit 1
    fi
}

# Run verification
main "$@"