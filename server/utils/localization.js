const moment = require('moment-timezone');
const logger = require('./logger');

class LocalizationService {
  constructor() {
    // Default settings - these will be updated from database settings
    this.settings = {
      timezone: 'UTC',
      locale: 'en-US',
      dateFormat: 'YYYY-MM-DD',
      timeFormat: '24h',
      firstDayOfWeek: 1
    };
    
    // Moment.js format mappings
    this.dateFormatMap = {
      'YYYY-MM-DD': 'YYYY-MM-DD',
      'MM/DD/YYYY': 'MM/DD/YYYY',
      'DD/MM/YYYY': 'DD/MM/YYYY',
      'DD.MM.YYYY': 'DD.MM.YYYY'
    };
    
    this.timeFormatMap = {
      '12h': 'h:mm:ss A',
      '24h': 'HH:mm:ss'
    };
    
    this.dateTimeFormatMap = {
      '12h': 'YYYY-MM-DD h:mm:ss A',
      '24h': 'YYYY-MM-DD HH:mm:ss'
    };
  }
  
  /**
   * Update localization settings
   * @param {Object} settings - Localization settings object
   */
  updateSettings(settings) {
    if (settings && settings.localization) {
      this.settings = { ...this.settings, ...settings.localization };
      logger.info('Localization settings updated:', this.settings);
    }
  }
  
  /**
   * Get current localization settings
   * @returns {Object} Current settings
   */
  getSettings() {
    return { ...this.settings };
  }
  
  /**
   * Format a date according to current locale settings
   * @param {Date|string} date - Date to format
   * @param {string} [format] - Override format (optional)
   * @returns {string} Formatted date string
   */
  formatDate(date, format = null) {
    try {
      const targetFormat = format || this.dateFormatMap[this.settings.dateFormat];
      return moment(date).tz(this.settings.timezone).format(targetFormat);
    } catch (error) {
      logger.error('Date formatting error:', error);
      return moment(date).format('YYYY-MM-DD');
    }
  }
  
  /**
   * Format a time according to current locale settings
   * @param {Date|string} date - Date to format time from
   * @param {string} [format] - Override format (optional)
   * @returns {string} Formatted time string
   */
  formatTime(date, format = null) {
    try {
      const targetFormat = format || this.timeFormatMap[this.settings.timeFormat];
      return moment(date).tz(this.settings.timezone).format(targetFormat);
    } catch (error) {
      logger.error('Time formatting error:', error);
      return moment(date).format('HH:mm:ss');
    }
  }
  
  /**
   * Format a date and time according to current locale settings
   * @param {Date|string} date - Date to format
   * @param {string} [format] - Override format (optional)
   * @returns {string} Formatted datetime string
   */
  formatDateTime(date, format = null) {
    try {
      if (format) {
        return moment(date).tz(this.settings.timezone).format(format);
      }
      
      const dateFormat = this.dateFormatMap[this.settings.dateFormat];
      const timeFormat = this.timeFormatMap[this.settings.timeFormat];
      const fullFormat = `${dateFormat} ${timeFormat}`;
      
      return moment(date).tz(this.settings.timezone).format(fullFormat);
    } catch (error) {
      logger.error('DateTime formatting error:', error);
      return moment(date).format('YYYY-MM-DD HH:mm:ss');
    }
  }
  
  /**
   * Format timestamp for logging (always uses consistent format)
   * @param {Date|string} date - Date to format
   * @returns {string} Formatted timestamp string
   */
  formatLogTimestamp(date = new Date()) {
    try {
      return moment(date).tz(this.settings.timezone).format('YYYY-MM-DD HH:mm:ss');
    } catch (error) {
      return moment(date).format('YYYY-MM-DD HH:mm:ss');
    }
  }
  
  /**
   * Format relative time (e.g., "2 hours ago", "in 30 minutes")
   * @param {Date|string} date - Date to format
   * @returns {string} Relative time string
   */
  formatRelativeTime(date) {
    try {
      return moment(date).tz(this.settings.timezone).fromNow();
    } catch (error) {
      logger.error('Relative time formatting error:', error);
      return moment(date).fromNow();
    }
  }
  
  /**
   * Get timezone-aware current time
   * @returns {Object} Moment object in current timezone
   */
  now() {
    return moment().tz(this.settings.timezone);
  }
  
  /**
   * Convert UTC time to local timezone
   * @param {Date|string} utcDate - UTC date to convert
   * @returns {Object} Moment object in local timezone
   */
  toLocalTime(utcDate) {
    return moment.utc(utcDate).tz(this.settings.timezone);
  }
  
  /**
   * Convert local time to UTC
   * @param {Date|string} localDate - Local date to convert
   * @returns {Object} Moment object in UTC
   */
  toUTC(localDate) {
    return moment.tz(localDate, this.settings.timezone).utc();
  }
  
  /**
   * Get list of available timezones
   * @returns {Array} Array of timezone names
   */
  getAvailableTimezones() {
    return moment.tz.names();
  }
  
  /**
   * Get common timezone groups for UI
   * @returns {Object} Grouped timezones
   */
  getTimezoneGroups() {
    const timezones = moment.tz.names();
    const groups = {};
    
    timezones.forEach(tz => {
      const parts = tz.split('/');
      if (parts.length > 1) {
        const region = parts[0];
        if (!groups[region]) {
          groups[region] = [];
        }
        groups[region].push({
          value: tz,
          label: tz.replace(/[/_]/g, ' '),
          offset: moment.tz(tz).format('Z')
        });
      }
    });
    
    // Sort each group
    Object.keys(groups).forEach(region => {
      groups[region].sort((a, b) => a.label.localeCompare(b.label));
    });
    
    return groups;
  }
  
  /**
   * Validate timezone string
   * @param {string} timezone - Timezone to validate
   * @returns {boolean} True if valid timezone
   */
  isValidTimezone(timezone) {
    return moment.tz.names().includes(timezone);
  }
  
  /**
   * Get current timezone offset
   * @returns {string} Timezone offset (e.g., "+05:00")
   */
  getTimezoneOffset() {
    return moment().tz(this.settings.timezone).format('Z');
  }
}

// Create singleton instance
const localizationService = new LocalizationService();

module.exports = localizationService;