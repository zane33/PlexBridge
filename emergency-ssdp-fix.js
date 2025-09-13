// EMERGENCY: Clean /livetv/sessions/ endpoint to fix syntax error

// This replaces the corrupted endpoint in ssdp.js
router.get('/livetv/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { offset } = req.query;
    
    logger.info('Plex /livetv/sessions/ request - XML response', { 
      sessionId,
      query: req.query,
      userAgent: req.get('User-Agent')
    });
    
    // Update session activity to prevent consumer timeout
    const sessionManager = getSessionManager();
    if (sessionId && sessionManager) {
      sessionManager.updateSessionActivity(sessionId);
      
      const sessionStatus = sessionManager.getSessionStatus(sessionId);
      if (!sessionStatus.exists) {
        sessionManager.createSession('livetv', sessionId, '', {
          userAgent: req.get('User-Agent'),
          isLiveTVSession: true,
          keepAlive: true
        });
      }
    }

    // Return proper XML MediaContainer that Plex expects
    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'no-cache'
    });
    
    const mediaContainerXML = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="1" identifier="com.plexapp.plugins.library" mediaTagPrefix="/system/bundle/media/flags/" mediaTagVersion="${Math.floor(Date.now() / 1000)}">
  <Video sessionKey="${sessionId}" key="/library/metadata/live-${sessionId}" ratingKey="live-${sessionId}" type="episode" title="Live TV Stream" duration="86400000" viewOffset="${offset || 0}" live="1" addedAt="${Math.floor(Date.now() / 1000)}" updatedAt="${Math.floor(Date.now() / 1000)}">
    <Media duration="86400000" container="mpegts" videoCodec="h264" audioCodec="aac" width="1920" height="1080" aspectRatio="1.78" bitrate="5000" audioChannels="2" videoFrameRate="25">
      <Part key="/stream/${sessionId}" file="/stream/${sessionId}" container="mpegts" duration="86400000" size="999999999" />
    </Media>
  </Video>
</MediaContainer>`;

    res.send(mediaContainerXML);

  } catch (error) {
    logger.error('Live TV session XML error:', error);
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><MediaContainer size="0" />');
  }
});