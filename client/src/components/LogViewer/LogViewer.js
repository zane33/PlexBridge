import React from 'react';
import { Box, Typography, Card, CardContent } from '@mui/material';

function LogViewer() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Log Viewer
      </Typography>
      <Card>
        <CardContent>
          <Typography variant="body1">
            Real-time application logs with filtering and search capabilities.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}

export default LogViewer;
