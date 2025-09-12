-- Insert test EPG channel data
INSERT OR REPLACE INTO epg_channels (epg_id, display_name, icon_url, source_id) VALUES 
('cnn.us', 'CNN International', 'https://example.com/cnn.png', '4e4bcbae-21a3-4445-9efc-a15a24ffb8e5'),
('bbc-news.uk', 'BBC News', 'https://example.com/bbc.png', '4e4bcbae-21a3-4445-9efc-a15a24ffb8e5');

-- Insert test EPG program data
-- CRITICAL: Note that channel_id here should be the EPG channel ID, not the internal database channel ID
INSERT OR REPLACE INTO epg_programs (id, channel_id, title, description, start_time, end_time, category) VALUES 
('prog1', 'cnn.us', 'CNN Breaking News', 'Latest breaking news coverage', '2025-08-19 03:00:00', '2025-08-19 04:00:00', 'News'),
('prog2', 'cnn.us', 'CNN World Report', 'International news analysis', '2025-08-19 04:00:00', '2025-08-19 05:00:00', 'News'),
('prog3', 'cnn.us', 'CNN Tonight', 'Evening news program', '2025-08-19 20:00:00', '2025-08-19 21:00:00', 'News'),
('prog4', 'bbc-news.uk', 'BBC World News', 'Global news update', '2025-08-19 03:00:00', '2025-08-19 03:30:00', 'News'),
('prog5', 'bbc-news.uk', 'BBC Business Live', 'Business and financial news', '2025-08-19 03:30:00', '2025-08-19 04:00:00', 'Business');