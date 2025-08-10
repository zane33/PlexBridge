import React from 'react';
import { Box, Typography, Card, CardContent } from '@mui/material';

function EPGManager() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        EPG Manager
      </Typography>
      <Card>
        <CardContent>
          <Typography variant="body1">
            Electronic Program Guide management - Configure EPG sources, 
            map channels, and view program schedules.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}

export default EPGManager;
