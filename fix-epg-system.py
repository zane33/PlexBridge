#!/usr/bin/env python3

"""
PlexBridge EPG System Fix Script
===============================

This script fixes the critical EPG functionality failure by:
1. Adding EPG sources to the database
2. Creating sample channels for testing
3. Providing configuration templates
4. Validating the EPG system setup

CRITICAL ISSUE IDENTIFIED:
- No EPG sources configured (0 sources)
- No channels configured (0 channels) 
- No EPG data available (0 programs)
- EPG service cannot initialize without sources
"""

import sqlite3
import os
import sys
import json
import uuid
from datetime import datetime

def main():
    print("🔧 PlexBridge EPG System Repair Tool")
    print("=" * 50)
    
    # Find database
    db_path = os.path.join(os.path.dirname(__file__), 'data/database/plextv.db')
    
    if not os.path.exists(db_path):
        print(f"❌ Database not found at: {db_path}")
        sys.exit(1)
    
    print(f"✅ Found database at: {db_path}")
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        print("\n📊 CURRENT STATE ANALYSIS")
        print("-" * 30)
        
        # Check current state
        tables = [
            ("epg_sources", "EPG Sources"),
            ("epg_channels", "EPG Channels"), 
            ("epg_programs", "EPG Programs"),
            ("channels", "Channels")
        ]
        
        for table, name in tables:
            cursor.execute(f"SELECT COUNT(*) FROM {table}")
            count = cursor.fetchone()[0]
            status = "✅" if count > 0 else "❌"
            print(f"{status} {name}: {count}")
        
        print("\n🔧 APPLYING FIXES")
        print("-" * 20)
        
        # 1. Add EPG Sources
        print("1️⃣ Adding EPG sources...")
        epg_sources = [
            {
                'id': 'tvnz-epg-source',
                'name': 'TVNZ EPG Source', 
                'url': 'https://xmltv.s3.amazonaws.com/epg/tvnz/epg.xml.gz',
                'refresh_interval': '4h',
                'enabled': 1,
                'category': 'News',
                'secondary_genres': '["News bulletin","Current affairs","Weather"]'
            },
            {
                'id': 'skytv-epg-source',
                'name': 'Sky TV EPG Source',
                'url': 'https://xmltv.s3.amazonaws.com/epg/sky/epg.xml.gz', 
                'refresh_interval': '6h',
                'enabled': 1,
                'category': 'Sports',
                'secondary_genres': '["Sports event","Sports talk","Football"]'
            },
            {
                'id': 'generic-epg-source',
                'name': 'Generic XMLTV Source',
                'url': 'https://iptv-org.github.io/epg/guides/nz/freeviewnz.com.xml',
                'refresh_interval': '4h', 
                'enabled': 1,
                'category': None,
                'secondary_genres': None
            }
        ]
        
        # Clear existing EPG sources
        cursor.execute("DELETE FROM epg_sources")
        
        # Insert EPG sources
        for source in epg_sources:
            try:
                cursor.execute("""
                    INSERT INTO epg_sources 
                    (id, name, url, refresh_interval, enabled, category, secondary_genres, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """, (
                    source['id'],
                    source['name'], 
                    source['url'],
                    source['refresh_interval'],
                    source['enabled'],
                    source['category'],
                    source['secondary_genres']
                ))
                print(f"   ✅ Added: {source['name']}")
            except Exception as e:
                print(f"   ❌ Failed to add {source['name']}: {e}")
        
        # 2. Add sample channels for testing
        print("\n2️⃣ Adding sample channels...")
        sample_channels = [
            {
                'id': str(uuid.uuid4()),
                'name': 'TVNZ 1',
                'number': 1,
                'enabled': 1,
                'epg_id': 'tvnz-1',
                'logo': None
            },
            {
                'id': str(uuid.uuid4()),
                'name': 'TVNZ 2', 
                'number': 2,
                'enabled': 1,
                'epg_id': 'tvnz-2',
                'logo': None
            },
            {
                'id': str(uuid.uuid4()),
                'name': 'Three',
                'number': 3,
                'enabled': 1,
                'epg_id': 'three',
                'logo': None
            },
            {
                'id': str(uuid.uuid4()),
                'name': 'Sky Sport 1',
                'number': 51,
                'enabled': 1,
                'epg_id': 'sky-sport-1',
                'logo': None
            },
            {
                'id': str(uuid.uuid4()),
                'name': 'Sky News',
                'number': 52,
                'enabled': 1, 
                'epg_id': 'sky-news',
                'logo': None
            }
        ]
        
        # Clear existing channels
        cursor.execute("DELETE FROM channels")
        
        # Insert sample channels
        for channel in sample_channels:
            try:
                cursor.execute("""
                    INSERT INTO channels 
                    (id, name, number, enabled, epg_id, logo, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """, (
                    channel['id'],
                    channel['name'],
                    channel['number'],
                    channel['enabled'], 
                    channel['epg_id'],
                    channel['logo']
                ))
                print(f"   ✅ Added: {channel['name']} (Ch {channel['number']}) -> EPG ID: {channel['epg_id']}")
            except Exception as e:
                print(f"   ❌ Failed to add {channel['name']}: {e}")
        
        # 3. Create sample streams for channels
        print("\n3️⃣ Adding sample streams...")
        sample_streams = [
            {
                'id': str(uuid.uuid4()),
                'channel_id': sample_channels[0]['id'],  # TVNZ 1
                'name': 'TVNZ 1 Stream',
                'url': 'https://tvnz-1.stream.example.com/playlist.m3u8',
                'type': 'hls',
                'enabled': 1
            },
            {
                'id': str(uuid.uuid4()), 
                'channel_id': sample_channels[3]['id'],  # Sky Sport 1
                'name': 'Sky Sport 1 Stream',
                'url': 'https://sky-sport-1.stream.example.com/playlist.m3u8', 
                'type': 'hls',
                'enabled': 1
            }
        ]
        
        # Clear existing streams
        cursor.execute("DELETE FROM streams")
        
        # Insert sample streams
        for stream in sample_streams:
            try:
                cursor.execute("""
                    INSERT INTO streams 
                    (id, channel_id, name, url, type, enabled, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """, (
                    stream['id'],
                    stream['channel_id'],
                    stream['name'],
                    stream['url'],
                    stream['type'], 
                    stream['enabled']
                ))
                print(f"   ✅ Added stream: {stream['name']}")
            except Exception as e:
                print(f"   ❌ Failed to add stream {stream['name']}: {e}")
        
        # Commit changes
        conn.commit()
        
        print("\n✅ EPG SYSTEM REPAIR COMPLETED")
        print("=" * 35)
        
        # Final verification
        print("\n📊 POST-REPAIR VERIFICATION")
        print("-" * 30)
        
        for table, name in tables:
            cursor.execute(f"SELECT COUNT(*) FROM {table}")
            count = cursor.fetchone()[0]
            status = "✅" if count > 0 else "❌"
            print(f"{status} {name}: {count}")
        
        print("\n📋 NEXT STEPS")
        print("-" * 15)
        print("1. Restart the PlexBridge Docker container to initialize EPG service")
        print("2. The EPG service will automatically:")
        print("   - Download EPG data from configured sources")
        print("   - Schedule refresh jobs for each source") 
        print("   - Populate epg_channels and epg_programs tables")
        print("3. Access the web interface to:")
        print("   - Verify EPG sources in EPG Manager")
        print("   - Check channel mappings")
        print("   - Monitor EPG download progress")
        print("4. Configure real stream URLs in the Streams section")
        
        print("\n🌐 WEB INTERFACE ACCESS")
        print("-" * 25)
        print("• EPG Manager: http://[your-ip]:3000/#/epg")
        print("• Channels: http://[your-ip]:3000/#/channels") 
        print("• Streams: http://[your-ip]:3000/#/streams")
        
        print("\n🔧 CONFIGURATION TEMPLATES")
        print("-" * 30)
        
        # Create configuration templates
        config_template = {
            "epg_sources": {
                "description": "Add these EPG sources via the web interface",
                "sources": [
                    {
                        "name": "TVNZ Official EPG",
                        "url": "https://i.mjh.nz/nzau/epg.xml.gz",
                        "refresh_interval": "4h",
                        "category": "News"
                    },
                    {
                        "name": "Sky TV EPG",
                        "url": "https://i.mjh.nz/au/Melbourne/epg.xml.gz", 
                        "refresh_interval": "6h",
                        "category": "Sports"
                    }
                ]
            },
            "channel_mappings": {
                "description": "Match channel EPG IDs to XMLTV source IDs",
                "examples": {
                    "TVNZ 1": "tvnz-1 or mjh-tvnz-1",
                    "TVNZ 2": "tvnz-2 or mjh-tvnz-2", 
                    "Sky Sport 1": "sky-sport-1"
                }
            }
        }
        
        config_file = os.path.join(os.path.dirname(__file__), 'epg-configuration-template.json')
        with open(config_file, 'w') as f:
            json.dump(config_template, f, indent=2)
        
        print(f"📄 Configuration template saved: {config_file}")
        
        conn.close()
        
    except Exception as e:
        print(f"❌ Error during repair: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()