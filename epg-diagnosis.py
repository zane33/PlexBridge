#!/usr/bin/env python3

import sqlite3
import os
import sys
from datetime import datetime

def main():
    # Find database
    db_path = os.path.join(os.path.dirname(__file__), 'data/database/plextv.db')
    
    if not os.path.exists(db_path):
        print(f"❌ Database not found at: {db_path}")
        sys.exit(1)
    
    print(f"✅ Found database at: {db_path}")
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        print("\n=== EPG SOURCES ===")
        cursor.execute("SELECT id, name, url, enabled, last_refresh, last_success, last_error FROM epg_sources")
        sources = cursor.fetchall()
        
        if sources:
            for source in sources:
                print(f"Source ID: {source[0]}")
                print(f"  Name: {source[1]}")
                print(f"  URL: {source[2]}")
                print(f"  Enabled: {'Yes' if source[3] else 'No'}")
                print(f"  Last Refresh: {source[4] or 'Never'}")
                print(f"  Last Success: {source[5] or 'Never'}")
                print(f"  Last Error: {source[6] or 'None'}")
                print()
        else:
            print("No EPG sources configured!")
        
        print("\n=== RECORD COUNTS ===")
        tables = [
            ("epg_sources", "EPG Sources"),
            ("epg_channels", "EPG Channels"),
            ("epg_programs", "EPG Programs"),
            ("channels", "Channels")
        ]
        
        for table, name in tables:
            cursor.execute(f"SELECT COUNT(*) FROM {table}")
            count = cursor.fetchone()[0]
            print(f"{name}: {count}")
        
        print("\n=== CHANNELS WITH EPG IDS ===")
        cursor.execute("SELECT COUNT(*) FROM channels WHERE epg_id IS NOT NULL AND epg_id != ''")
        epg_mapped = cursor.fetchone()[0]
        print(f"Channels with EPG IDs: {epg_mapped}")
        
        print("\n=== RECENT EPG PROGRAMS (Last 7 days) ===")
        cursor.execute("""
            SELECT channel_id, COUNT(*) as program_count 
            FROM epg_programs 
            WHERE start_time > datetime('now', '-7 days') 
            GROUP BY channel_id 
            ORDER BY program_count DESC 
            LIMIT 10
        """)
        recent_programs = cursor.fetchall()
        
        if recent_programs:
            for channel_id, count in recent_programs:
                print(f"Channel {channel_id}: {count} programs")
        else:
            print("No recent EPG programs found!")
        
        print("\n=== EPG INITIALIZATION CHECK ===")
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'epg_%'")
        epg_tables = cursor.fetchall()
        print(f"EPG tables found: {[table[0] for table in epg_tables]}")
        
        print("\n=== SAMPLE CHANNELS ===")
        cursor.execute("SELECT id, name, number, epg_id, enabled FROM channels ORDER BY number LIMIT 10")
        sample_channels = cursor.fetchall()
        
        for channel in sample_channels:
            status = "✅" if channel[3] else "❌"
            print(f"{status} Channel {channel[2]}: {channel[1]}")
            print(f"   EPG ID: {channel[3] or 'NOT SET'}")
            print(f"   Enabled: {'Yes' if channel[4] else 'No'}")
        
        conn.close()
        print("\n✅ EPG diagnosis complete")
        
    except Exception as e:
        print(f"❌ Error accessing database: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()