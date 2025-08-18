#!/bin/bash

# PlexBridge Database Verification and Backup Script
# This script verifies database persistence and creates backups

DB_PATH="/data/database/plextv.db"
BACKUP_DIR="/data/database/backups"
LOG_FILE="/data/logs/database-verification.log"

echo "=== PlexBridge Database Verification ===" | tee -a "$LOG_FILE"
echo "Timestamp: $(date)" | tee -a "$LOG_FILE"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Function to log messages
log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Check if database file exists
if [ -f "$DB_PATH" ]; then
    log_message "✓ Database file found at: $DB_PATH"
    
    # Get database file size
    DB_SIZE=$(stat -f%z "$DB_PATH" 2>/dev/null || stat -c%s "$DB_PATH" 2>/dev/null || echo "unknown")
    log_message "✓ Database file size: $DB_SIZE bytes"
    
    # Check if database is accessible and get basic info
    if sqlite3 "$DB_PATH" ".tables" >/dev/null 2>&1; then
        log_message "✓ Database is accessible and readable"
        
        # Get table information
        TABLES=$(sqlite3 "$DB_PATH" ".tables" 2>/dev/null)
        log_message "✓ Database tables: $(echo $TABLES | tr '\n' ' ')"
        
        # Get row counts for main tables
        for table in channels streams epg_sources epg_programs settings; do
            if echo "$TABLES" | grep -q "$table"; then
                COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM $table;" 2>/dev/null || echo "error")
                log_message "✓ Table '$table': $COUNT rows"
            else
                log_message "⚠ Table '$table': not found"
            fi
        done
        
        # Check database integrity
        if sqlite3 "$DB_PATH" "PRAGMA integrity_check;" | grep -q "ok"; then
            log_message "✓ Database integrity check: PASSED"
        else
            log_message "❌ Database integrity check: FAILED"
        fi
        
        # Create backup
        BACKUP_FILE="$BACKUP_DIR/plextv-backup-$(date +%Y%m%d-%H%M%S).db"
        if cp "$DB_PATH" "$BACKUP_FILE" 2>/dev/null; then
            log_message "✓ Database backup created: $BACKUP_FILE"
            
            # Verify backup
            if sqlite3 "$BACKUP_FILE" ".tables" >/dev/null 2>&1; then
                log_message "✓ Backup verification: PASSED"
            else
                log_message "❌ Backup verification: FAILED"
                rm -f "$BACKUP_FILE"
            fi
        else
            log_message "❌ Failed to create database backup"
        fi
        
        # Clean up old backups (keep last 10)
        if [ -d "$BACKUP_DIR" ]; then
            BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/plextv-backup-*.db 2>/dev/null | wc -l)
            if [ "$BACKUP_COUNT" -gt 10 ]; then
                log_message "Cleaning up old backups (keeping last 10)..."
                ls -1t "$BACKUP_DIR"/plextv-backup-*.db | tail -n +11 | xargs rm -f
            fi
        fi
        
    else
        log_message "❌ Database file exists but is not accessible"
        log_message "❌ This may indicate corruption or permission issues"
        
        # Attempt to get more information
        if [ -r "$DB_PATH" ]; then
            log_message "✓ Database file is readable"
        else
            log_message "❌ Database file is not readable"
        fi
        
        if [ -w "$DB_PATH" ]; then
            log_message "✓ Database file is writable"
        else
            log_message "❌ Database file is not writable"
        fi
    fi
    
else
    log_message "❌ Database file not found at: $DB_PATH"
    log_message "ℹ This is normal for a fresh installation"
    
    # Check if directory exists and is writable
    DB_DIR=$(dirname "$DB_PATH")
    if [ -d "$DB_DIR" ]; then
        log_message "✓ Database directory exists: $DB_DIR"
        if [ -w "$DB_DIR" ]; then
            log_message "✓ Database directory is writable"
        else
            log_message "❌ Database directory is not writable"
        fi
    else
        log_message "❌ Database directory does not exist: $DB_DIR"
    fi
fi

# Check data directory permissions
log_message "=== Data Directory Verification ==="
for dir in /data /data/database /data/cache /data/logs /data/logos; do
    if [ -d "$dir" ]; then
        OWNER=$(stat -f%Su:%Sg "$dir" 2>/dev/null || stat -c%U:%G "$dir" 2>/dev/null || echo "unknown")
        PERMS=$(stat -f%Mp%Lp "$dir" 2>/dev/null || stat -c%a "$dir" 2>/dev/null || echo "unknown")
        log_message "✓ Directory $dir: owner=$OWNER permissions=$PERMS"
    else
        log_message "❌ Directory $dir: does not exist"
    fi
done

log_message "=== Verification Complete ==="
echo "Verification log saved to: $LOG_FILE"