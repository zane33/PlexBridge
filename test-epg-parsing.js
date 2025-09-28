#!/usr/bin/env node

/**
 * CRITICAL EPG PARSING TEST
 * 
 * This script directly tests the EPG service parsing functionality to identify
 * why the refresh shows success but no programs are being stored in the database.
 */

const axios = require('axios');
const xml2js = require('xml2js');

class EPGTestParser {
  constructor() {
    this.parser = new xml2js.Parser({
      explicitArray: false,
      ignoreAttrs: false,
      mergeAttrs: true
    });
  }

  async testEPGParsing() {
    console.log('🔍 CRITICAL EPG PARSING TEST');
    console.log('==============================');
    
    try {
      // Download EPG data
      console.log('\n📥 Step 1: Downloading EPG data...');
      const response = await axios.get('https://i.mjh.nz/nz/epg.xml', {
        timeout: 60000,
        maxContentLength: 50 * 1024 * 1024,
        responseType: 'text',
        headers: {
          'User-Agent': 'PlexBridge/1.0 (compatible; EPG Test)',
          'Accept': 'application/xml, text/xml, */*'
        }
      });

      const xmlData = response.data;
      console.log(`✅ Downloaded ${xmlData.length} bytes of EPG data`);
      console.log(`📊 First 200 chars: ${xmlData.substring(0, 200)}...`);

      // Parse XML
      console.log('\n📊 Step 2: Parsing XML...');
      const result = await this.parser.parseStringPromise(xmlData);
      
      if (!result.tv) {
        throw new Error('Invalid XMLTV format - missing tv root element');
      }

      const channels = this.normalizeArray(result.tv.channel || []);
      const programmes = this.normalizeArray(result.tv.programme || []);

      console.log(`✅ Parsed ${channels.length} channels and ${programmes.length} programmes`);

      // Analyze channel data
      console.log('\n📺 Step 3: Analyzing channels...');
      console.log(`Total channels: ${channels.length}`);
      
      if (channels.length > 0) {
        console.log('\nSample channels:');
        channels.slice(0, 5).forEach(channel => {
          const displayName = this.extractText(channel['display-name']);
          console.log(`  - ${channel.id}: ${displayName}`);
        });
      }

      // Analyze programme data for current date
      console.log('\n📅 Step 4: Analyzing programmes for current date...');
      const today = new Date();
      const todayStr = today.toISOString().substring(0, 10).replace(/-/g, ''); // YYYYMMDD format
      
      const todayProgrammes = programmes.filter(prog => {
        if (!prog.start) return false;
        return prog.start.substring(0, 8) === todayStr;
      });

      console.log(`Total programmes: ${programmes.length}`);
      console.log(`Today's programmes (${todayStr}): ${todayProgrammes.length}`);

      if (todayProgrammes.length > 0) {
        console.log('\nSample today\'s programmes:');
        todayProgrammes.slice(0, 5).forEach(prog => {
          const title = this.extractText(prog.title);
          console.log(`  - ${prog.channel}: ${title} (${prog.start} - ${prog.stop})`);
        });
      }

      // Parse sample programmes to test program parsing logic
      console.log('\n🔍 Step 5: Testing program parsing logic...');
      let successfulParsed = 0;
      let failedParsed = 0;

      const samplePrograms = todayProgrammes.slice(0, 10);
      const parsedPrograms = [];

      for (const programme of samplePrograms) {
        try {
          const program = this.parseProgram(programme);
          if (program) {
            parsedPrograms.push(program);
            successfulParsed++;
          } else {
            failedParsed++;
          }
        } catch (error) {
          failedParsed++;
          console.warn(`Failed to parse programme: ${error.message}`);
        }
      }

      console.log(`✅ Successfully parsed: ${successfulParsed}`);
      console.log(`❌ Failed to parse: ${failedParsed}`);

      if (parsedPrograms.length > 0) {
        console.log('\nSample parsed programs:');
        parsedPrograms.slice(0, 3).forEach(prog => {
          console.log(`  - ID: ${prog.id}`);
          console.log(`    Channel: ${prog.channel_id}`);
          console.log(`    Title: ${prog.title}`);
          console.log(`    Start: ${prog.start_time}`);
          console.log(`    End: ${prog.end_time}`);
          console.log('');
        });
      }

      // CRITICAL ISSUE IDENTIFICATION
      console.log('\n💥 CRITICAL ISSUE ANALYSIS:');
      console.log('===========================');

      if (programmes.length === 0) {
        console.log('❌ ISSUE: No programmes found in XMLTV data');
      } else if (todayProgrammes.length === 0) {
        console.log('❌ ISSUE: No programmes for current date found');
        console.log('   This suggests the EPG data is outdated or date parsing is incorrect');
      } else if (parsedPrograms.length === 0) {
        console.log('❌ ISSUE: Programmes exist but parsing logic is failing');
        console.log('   This suggests the program parsing function has a bug');
      } else {
        console.log('✅ EPG parsing appears to work correctly');
        console.log('   The issue might be in database storage or channel mapping');
      }

      return {
        success: true,
        totalChannels: channels.length,
        totalProgrammes: programmes.length,
        todayProgrammes: todayProgrammes.length,
        parsedPrograms: parsedPrograms.length
      };

    } catch (error) {
      console.error('💥 EPG parsing test failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  normalizeArray(item) {
    return Array.isArray(item) ? item : [item];
  }

  extractText(element) {
    if (!element) return null;
    
    if (typeof element === 'string') {
      return element.trim();
    }
    
    if (Array.isArray(element)) {
      return element[0]?._ || element[0] || null;
    }
    
    return element._ || element || null;
  }

  parseProgram(programme) {
    // **CRITICAL FIX**: xml2js merges attributes into the main object when mergeAttrs: true
    if (!programme.channel || !programme.start || !programme.stop) {
      console.debug('Programme missing required fields', {
        hasChannel: !!programme.channel,
        hasStart: !!programme.start,
        hasStop: !!programme.stop,
        channel: programme.channel
      });
      return null;
    }

    try {
      const program = {
        id: `${programme.channel}_${programme.start}`,
        channel_id: programme.channel,
        title: this.extractText(programme.title) || 'Unknown',
        subtitle: this.extractText(programme['sub-title']) || null,
        description: this.extractText(programme.desc) || null,
        start_time: this.parseXMLTVTime(programme.start),
        end_time: this.parseXMLTVTime(programme.stop),
        category: this.extractText(programme.category) || null
      };

      return program;
    } catch (error) {
      console.warn('Failed to parse programme', {
        channel: programme.channel,
        start: programme.start,
        stop: programme.stop,
        title: this.extractText(programme.title),
        error: error.message
      });
      return null;
    }
  }

  parseXMLTVTime(timeStr) {
    // XMLTV time format: YYYYMMDDHHMMSS +TIMEZONE
    const match = timeStr.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?/);
    
    if (!match) {
      throw new Error(`Invalid XMLTV time format: ${timeStr}`);
    }

    const [, year, month, day, hour, minute, second, timezone] = match;
    
    // Create ISO string
    const isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
    
    if (timezone) {
      return new Date(isoString + timezone.replace(/(\d{2})(\d{2})/, '$1:$2')).toISOString();
    } else {
      return new Date(isoString + 'Z').toISOString();
    }
  }
}

// Run the test
async function main() {
  const tester = new EPGTestParser();
  const result = await tester.testEPGParsing();
  
  console.log('\n📋 TEST SUMMARY:');
  console.log('================');
  console.log(JSON.stringify(result, null, 2));
  
  process.exit(result.success ? 0 : 1);
}

main().catch(console.error);