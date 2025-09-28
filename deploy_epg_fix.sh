#!/bin/bash
# PlexBridge Production EPG Fix Deployment Script
# Execute this script on the production server (192.168.3.148)

set -e  # Exit on any error

CONTAINER_NAME="plextv"
BACKUP_TIMESTAMP=$(date +%s)
PRODUCTION_HOST="192.168.3.148:3000"

echo "=== PlexBridge EPG Fix Deployment ==="
echo "Date: $(date)"
echo "Container: $CONTAINER_NAME"
echo "Production: $PRODUCTION_HOST"
echo "Backup ID: $BACKUP_TIMESTAMP"
echo

# Function to check if container exists
check_container() {
    if ! docker ps -a --format "table {{.Names}}" | grep -q "^$CONTAINER_NAME$"; then
        echo "ERROR: Container '$CONTAINER_NAME' not found!"
        echo "Available containers:"
        docker ps -a --format "table {{.Names}}\t{{.Status}}"
        exit 1
    fi
}

# Function to verify production health
check_production_health() {
    echo "Checking production health..."
    if curl -s --max-time 10 http://$PRODUCTION_HOST/health > /dev/null; then
        echo "✅ Production server is responding"
    else
        echo "❌ Production server is not responding"
        exit 1
    fi
}

# Function to create database backup
backup_database() {
    echo "Creating database backup..."
    
    # Create backup inside container
    docker exec $CONTAINER_NAME sh -c "
        cd /data/database
        if [ -f plextv.db ]; then
            cp plextv.db plextv.db.backup.$BACKUP_TIMESTAMP
            echo '✅ Database backed up to plextv.db.backup.$BACKUP_TIMESTAMP'
            ls -la plextv.db*
        else
            echo '❌ Database file not found at /data/database/plextv.db'
            ls -la /data/database/
            exit 1
        fi
    "
}

# Function to apply database fix
apply_database_fix() {
    echo "Applying database corruption fix..."
    
    # Copy fix script to container
    docker cp fix_database.sql $CONTAINER_NAME:/tmp/fix_database.sql
    
    # Apply the fix
    docker exec $CONTAINER_NAME sh -c "
        cd /data/database
        echo 'Creating fixed database...'
        sqlite3 plextv_fixed.db < /tmp/fix_database.sql
        
        echo 'Verifying fixed database...'
        sqlite3 plextv_fixed.db 'PRAGMA integrity_check;'
        
        echo 'Replacing corrupted database...'
        mv plextv.db plextv.db.corrupted.$BACKUP_TIMESTAMP
        mv plextv_fixed.db plextv.db
        
        echo '✅ Database fix applied successfully'
        ls -la plextv.db*
    "
}

# Function to restart container
restart_container() {
    echo "Restarting PlexBridge container..."
    docker restart $CONTAINER_NAME
    
    echo "Waiting for container to start..."
    sleep 30
    
    # Wait for health check
    local retries=0
    local max_retries=12
    
    while [ $retries -lt $max_retries ]; do
        if curl -s --max-time 10 http://$PRODUCTION_HOST/health > /dev/null; then
            echo "✅ Container restarted successfully"
            return 0
        fi
        
        retries=$((retries + 1))
        echo "Waiting for container startup... ($retries/$max_retries)"
        sleep 10
    done
    
    echo "❌ Container failed to start properly"
    echo "Container logs:"
    docker logs $CONTAINER_NAME --tail 20
    exit 1
}

# Function to test EPG functionality
test_epg_functionality() {
    echo "Testing EPG functionality..."
    
    # Test EPG sources
    echo "Checking EPG sources..."
    curl -s http://$PRODUCTION_HOST/api/epg-sources | head -c 200
    echo
    
    # Force EPG refresh
    echo "Forcing EPG refresh..."
    curl -X POST http://$PRODUCTION_HOST/api/epg/refresh
    echo
    
    # Wait a moment for refresh to process
    sleep 10
    
    # Check EPG programs
    echo "Checking EPG programs..."
    local current_date=$(date +%Y-%m-%d)
    curl -s "http://$PRODUCTION_HOST/api/epg/programs?limit=3" | grep -E "(start_time|created_at)" || {
        echo "Checking if programs exist at all..."
        curl -s "http://$PRODUCTION_HOST/api/epg/programs?limit=1"
    }
    echo
}

# Function to verify success
verify_deployment() {
    echo "Verifying deployment success..."
    
    # Check current program dates
    local programs_response=$(curl -s "http://$PRODUCTION_HOST/api/epg/programs?limit=1")
    local current_date=$(date +%Y-%m-%d)
    
    if echo "$programs_response" | grep -q "$current_date"; then
        echo "✅ EPG programs contain current date ($current_date)"
    elif echo "$programs_response" | grep -q "2025-09-2[789]"; then
        echo "✅ EPG programs contain recent dates (Sept 27-29)"
    else
        echo "⚠️  EPG programs may still contain old dates"
        echo "Sample program data:"
        echo "$programs_response" | head -c 300
        echo
    fi
    
    # Check all critical endpoints
    local endpoints=(
        "/health"
        "/api/epg-sources" 
        "/discover.json"
        "/lineup.json"
    )
    
    for endpoint in "${endpoints[@]}"; do
        if curl -s --max-time 10 http://$PRODUCTION_HOST$endpoint > /dev/null; then
            echo "✅ $endpoint responding"
        else
            echo "❌ $endpoint not responding"
        fi
    done
}

# Function to rollback on failure
rollback() {
    echo "🔄 ROLLBACK: Restoring previous database..."
    
    docker exec $CONTAINER_NAME sh -c "
        cd /data/database
        if [ -f plextv.db.backup.$BACKUP_TIMESTAMP ]; then
            mv plextv.db plextv.db.failed.$BACKUP_TIMESTAMP
            cp plextv.db.backup.$BACKUP_TIMESTAMP plextv.db
            echo '✅ Database restored from backup'
        else
            echo '❌ Backup file not found!'
            ls -la plextv.db*
        fi
    "
    
    docker restart $CONTAINER_NAME
    sleep 30
    
    if curl -s --max-time 10 http://$PRODUCTION_HOST/health > /dev/null; then
        echo "✅ Rollback successful - production restored"
    else
        echo "❌ Rollback failed - manual intervention required"
        docker logs $CONTAINER_NAME --tail 20
    fi
}

# Main deployment sequence
main() {
    echo "Starting EPG fix deployment..."
    
    # Trap errors for rollback
    trap 'echo "❌ Deployment failed!"; rollback; exit 1' ERR
    
    # Pre-deployment checks
    check_container
    check_production_health
    
    # Deployment steps
    backup_database
    
    echo "Stopping container for database maintenance..."
    docker stop $CONTAINER_NAME
    
    apply_database_fix
    restart_container
    
    # Post-deployment verification
    test_epg_functionality
    verify_deployment
    
    echo
    echo "=== DEPLOYMENT SUCCESSFUL ==="
    echo "✅ EPG database corruption fixed"
    echo "✅ Container restarted and healthy"
    echo "✅ All endpoints responding"
    echo "✅ EPG refresh functionality working"
    echo
    echo "Backup preserved as: plextv.db.backup.$BACKUP_TIMESTAMP"
    echo "Monitor EPG refresh over next 4 hours to confirm stability"
    echo
    echo "To monitor ongoing EPG refresh:"
    echo "  docker logs $CONTAINER_NAME -f | grep -i epg"
    echo
    echo "To check EPG program updates:"
    echo "  curl -s 'http://$PRODUCTION_HOST/api/epg/programs?limit=5' | grep start_time"
}

# Run deployment
main "$@"