import React from 'react';
import { Box, Typography, Card, CardContent } from '@mui/material';

function StreamManager() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Stream Manager
      </Typography>
      <Card>
        <CardContent>
          <Typography variant="body1">
            Stream management interface - Add, edit, and test IPTV streams.
            Supports HLS, DASH, RTSP, RTMP, UDP, HTTP, MMS, and SRT protocols.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}

export default StreamManager;
