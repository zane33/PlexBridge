/**
 * Plex-compatible EPG category mapping utility
 * Maps simple categories to Plex-recognized genre classifications
 */

/**
 * Plex recognizes these main content types and genres
 * Based on XMLTV standards and Plex's content classification system
 */
const PLEX_GENRES = {
  // Movie genres
  MOVIE_ACTION: 'Action',
  MOVIE_ADVENTURE: 'Adventure',
  MOVIE_ANIMATION: 'Animation',
  MOVIE_COMEDY: 'Comedy',
  MOVIE_CRIME: 'Crime',
  MOVIE_DOCUMENTARY: 'Documentary',
  MOVIE_DRAMA: 'Drama',
  MOVIE_FAMILY: 'Family',
  MOVIE_FANTASY: 'Fantasy',
  MOVIE_HORROR: 'Horror',
  MOVIE_MUSICAL: 'Musical',
  MOVIE_MYSTERY: 'Mystery',
  MOVIE_ROMANCE: 'Romance',
  MOVIE_SCIFI: 'Science Fiction',
  MOVIE_THRILLER: 'Thriller',
  MOVIE_WAR: 'War',
  MOVIE_WESTERN: 'Western',
  
  // TV/Series genres
  SERIES_ACTION: 'Action',
  SERIES_ADVENTURE: 'Adventure',
  SERIES_ANIMATION: 'Animation',
  SERIES_COMEDY: 'Comedy',
  SERIES_CRIME: 'Crime',
  SERIES_DOCUMENTARY: 'Documentary',
  SERIES_DRAMA: 'Drama',
  SERIES_FAMILY: 'Family',
  SERIES_FANTASY: 'Fantasy',
  SERIES_GAME_SHOW: 'Game show',
  SERIES_HORROR: 'Horror',
  SERIES_MYSTERY: 'Mystery',
  SERIES_NEWS: 'News',
  SERIES_REALITY: 'Reality',
  SERIES_ROMANCE: 'Romance',
  SERIES_SCIFI: 'Science Fiction',
  SERIES_SITCOM: 'Sitcom',
  SERIES_TALK: 'Talk show',
  SERIES_THRILLER: 'Thriller',
  
  // Sports categories
  SPORTS_EVENT: 'Sports event',
  SPORTS_MAGAZINE: 'Sports magazine',
  SPORTS_TALK: 'Sports talk',
  
  // News categories  
  NEWS_BULLETIN: 'News bulletin',
  NEWS_MAGAZINE: 'News magazine',
  NEWS_WEATHER: 'Weather',
  
  // Content type identifiers (primary categories)
  TYPE_MOVIE: 'Movie',
  TYPE_SERIES: 'Series',
  TYPE_SPORTS: 'Sports',
  TYPE_NEWS: 'News'
};

/**
 * Maps simple categories to multiple Plex-compatible category tags
 * Returns an array of category strings that Plex will recognize
 * 
 * @param {string} simpleCategory - The simple category from the database
 * @param {string} [title] - Optional program title to help determine subgenre
 * @param {string} [description] - Optional description to help determine subgenre
 * @param {string[]} [customSecondaryGenres] - Optional custom secondary genres from EPG source
 * @returns {string[]} Array of Plex-compatible category tags
 */
function mapToPlexCategories(simpleCategory, title = '', description = '', customSecondaryGenres = null) {
  const categories = [];
  const lowerTitle = title.toLowerCase();
  const lowerDesc = description.toLowerCase();
  
  // If custom secondary genres are provided and valid, use them instead of auto-detection
  const useCustomGenres = customSecondaryGenres && Array.isArray(customSecondaryGenres) && customSecondaryGenres.length > 0;
  
  switch (simpleCategory?.toLowerCase()) {
    case 'movie':
      // Always include the Movie content type
      categories.push(PLEX_GENRES.TYPE_MOVIE);
      
      if (useCustomGenres) {
        // Use custom secondary genres directly
        customSecondaryGenres.forEach(genre => {
          if (genre && typeof genre === 'string') {
            categories.push(genre);
          }
        });
      } else {
        // Fall back to auto-detection from title/description
        if (containsKeywords(lowerTitle, lowerDesc, ['action', 'explosive', 'chase', 'fight'])) {
          categories.push(PLEX_GENRES.MOVIE_ACTION);
        } else if (containsKeywords(lowerTitle, lowerDesc, ['comedy', 'funny', 'laugh', 'humor'])) {
          categories.push(PLEX_GENRES.MOVIE_COMEDY);
        } else if (containsKeywords(lowerTitle, lowerDesc, ['horror', 'scary', 'terror', 'nightmare'])) {
          categories.push(PLEX_GENRES.MOVIE_HORROR);
        } else if (containsKeywords(lowerTitle, lowerDesc, ['animated', 'animation', 'cartoon', 'pixar', 'disney'])) {
          categories.push(PLEX_GENRES.MOVIE_ANIMATION);
        } else if (containsKeywords(lowerTitle, lowerDesc, ['thriller', 'suspense', 'mystery'])) {
          categories.push(PLEX_GENRES.MOVIE_THRILLER);
        } else if (containsKeywords(lowerTitle, lowerDesc, ['romance', 'love', 'romantic'])) {
          categories.push(PLEX_GENRES.MOVIE_ROMANCE);
        } else if (containsKeywords(lowerTitle, lowerDesc, ['sci-fi', 'science fiction', 'space', 'alien', 'future'])) {
          categories.push(PLEX_GENRES.MOVIE_SCIFI);
        } else if (containsKeywords(lowerTitle, lowerDesc, ['documentary', 'true story', 'based on'])) {
          categories.push(PLEX_GENRES.MOVIE_DOCUMENTARY);
        } else if (containsKeywords(lowerTitle, lowerDesc, ['family', 'kids', 'children'])) {
          categories.push(PLEX_GENRES.MOVIE_FAMILY);
        } else {
          // Default to Drama if no specific genre detected
          categories.push(PLEX_GENRES.MOVIE_DRAMA);
        }
      }
      break;
      
    case 'series':
      // Always include the Series content type
      categories.push(PLEX_GENRES.TYPE_SERIES);
      
      if (useCustomGenres) {
        // Use custom secondary genres directly
        customSecondaryGenres.forEach(genre => {
          if (genre && typeof genre === 'string') {
            categories.push(genre);
          }
        });
      } else {
        // Fall back to auto-detection from title/description
        if (containsKeywords(lowerTitle, lowerDesc, ['comedy', 'funny', 'sitcom', 'laugh'])) {
          categories.push(PLEX_GENRES.SERIES_COMEDY);
        } else if (containsKeywords(lowerTitle, lowerDesc, ['crime', 'detective', 'police', 'investigation'])) {
          categories.push(PLEX_GENRES.SERIES_CRIME);
        } else if (containsKeywords(lowerTitle, lowerDesc, ['reality', 'real life', 'unscripted'])) {
          categories.push(PLEX_GENRES.SERIES_REALITY);
        } else if (containsKeywords(lowerTitle, lowerDesc, ['talk show', 'tonight', 'interview', 'host'])) {
          categories.push(PLEX_GENRES.SERIES_TALK);
        } else if (containsKeywords(lowerTitle, lowerDesc, ['game show', 'quiz', 'contestant', 'prize'])) {
          categories.push(PLEX_GENRES.SERIES_GAME_SHOW);
        } else if (containsKeywords(lowerTitle, lowerDesc, ['animated', 'animation', 'cartoon'])) {
          categories.push(PLEX_GENRES.SERIES_ANIMATION);
        } else if (containsKeywords(lowerTitle, lowerDesc, ['sci-fi', 'science fiction', 'space', 'alien', 'future'])) {
          categories.push(PLEX_GENRES.SERIES_SCIFI);
        } else if (containsKeywords(lowerTitle, lowerDesc, ['documentary', 'true', 'real'])) {
          categories.push(PLEX_GENRES.SERIES_DOCUMENTARY);
        } else if (containsKeywords(lowerTitle, lowerDesc, ['family', 'kids', 'children'])) {
          categories.push(PLEX_GENRES.SERIES_FAMILY);
        } else if (containsKeywords(lowerTitle, lowerDesc, ['action', 'adventure', 'thriller'])) {
          categories.push(PLEX_GENRES.SERIES_ACTION);
        } else {
          // Default to Drama if no specific genre detected
          categories.push(PLEX_GENRES.SERIES_DRAMA);
        }
      }
      break;
      
    case 'sports':
      // Always include the Sports content type
      categories.push(PLEX_GENRES.TYPE_SPORTS);
      
      if (useCustomGenres) {
        // Use custom secondary genres directly
        customSecondaryGenres.forEach(genre => {
          if (genre && typeof genre === 'string') {
            categories.push(genre);
          }
        });
      } else {
        // Fall back to auto-detection from title/description
        if (containsKeywords(lowerTitle, lowerDesc, ['talk', 'analysis', 'commentary', 'panel'])) {
          categories.push(PLEX_GENRES.SPORTS_TALK);
        } else if (containsKeywords(lowerTitle, lowerDesc, ['magazine', 'highlights', 'review', 'weekly'])) {
          categories.push(PLEX_GENRES.SPORTS_MAGAZINE);
        } else {
          // Default to sports event for live games/matches
          categories.push(PLEX_GENRES.SPORTS_EVENT);
        }
      }
      break;
      
    case 'news':
      // Always include the News content type
      categories.push(PLEX_GENRES.TYPE_NEWS);
      
      if (useCustomGenres) {
        // Use custom secondary genres directly
        customSecondaryGenres.forEach(genre => {
          if (genre && typeof genre === 'string') {
            categories.push(genre);
          }
        });
      } else {
        // Fall back to auto-detection from title/description
        if (containsKeywords(lowerTitle, lowerDesc, ['weather', 'forecast', 'temperature'])) {
          categories.push(PLEX_GENRES.NEWS_WEATHER);
        } else if (containsKeywords(lowerTitle, lowerDesc, ['magazine', 'weekly', 'special report', 'investigation'])) {
          categories.push(PLEX_GENRES.NEWS_MAGAZINE);
        } else {
          // Default to news bulletin for regular news programs
          categories.push(PLEX_GENRES.NEWS_BULLETIN);
        }
      }
      break;
      
    default:
      // If no category or unknown category, try to detect from content
      if (containsKeywords(lowerTitle, lowerDesc, ['news', 'report', 'breaking'])) {
        categories.push(PLEX_GENRES.TYPE_NEWS);
        categories.push(PLEX_GENRES.NEWS_BULLETIN);
      } else if (containsKeywords(lowerTitle, lowerDesc, ['sport', 'game', 'match', 'race'])) {
        categories.push(PLEX_GENRES.TYPE_SPORTS);
        categories.push(PLEX_GENRES.SPORTS_EVENT);
      } else if (containsKeywords(lowerTitle, lowerDesc, ['episode', 'season', 'series'])) {
        categories.push(PLEX_GENRES.TYPE_SERIES);
        categories.push(PLEX_GENRES.SERIES_DRAMA);
      } else {
        // Default fallback
        categories.push(PLEX_GENRES.TYPE_SERIES);
        categories.push(PLEX_GENRES.SERIES_DRAMA);
      }
      break;
  }
  
  return categories;
}

/**
 * Helper function to check if text contains any of the keywords
 * @param {string} title - Title text to search
 * @param {string} description - Description text to search
 * @param {string[]} keywords - Array of keywords to look for
 * @returns {boolean} True if any keyword is found
 */
function containsKeywords(title, description, keywords) {
  const combinedText = `${title} ${description}`.toLowerCase();
  return keywords.some(keyword => combinedText.includes(keyword.toLowerCase()));
}

/**
 * Gets a formatted category string for XMLTV output
 * @param {string} category - The category value
 * @param {string} [lang] - Optional language code (default: 'en')
 * @returns {string} Formatted XMLTV category element
 */
function formatCategoryElement(category, lang = 'en') {
  return `    <category lang="${lang}">${escapeXml(category)}</category>`;
}

/**
 * Escapes XML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text safe for XML
 */
function escapeXml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates XMLTV category elements for a program
 * @param {string} simpleCategory - The simple category from the database
 * @param {string} [title] - Optional program title
 * @param {string} [description] - Optional program description
 * @param {string} [lang] - Optional language code (default: 'en')
 * @param {string[]} [customSecondaryGenres] - Optional custom secondary genres from EPG source
 * @returns {string} Multiple XMLTV category elements as a string
 */
function generateXMLTVCategories(simpleCategory, title = '', description = '', lang = 'en', customSecondaryGenres = null) {
  const categories = mapToPlexCategories(simpleCategory, title, description, customSecondaryGenres);
  return categories.map(cat => formatCategoryElement(cat, lang)).join('\n');
}

module.exports = {
  PLEX_GENRES,
  mapToPlexCategories,
  formatCategoryElement,
  generateXMLTVCategories,
  escapeXml
};