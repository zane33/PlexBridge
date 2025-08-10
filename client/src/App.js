import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Box } from '@mui/material';
import Layout from './components/Layout/Layout';
import Dashboard from './components/Dashboard/Dashboard';
import ChannelManager from './components/ChannelManager/ChannelManager';
import StreamManager from './components/StreamManager/StreamManager';
import EPGManager from './components/EPGManager/EPGManager';
import LogViewer from './components/LogViewer/LogViewer';
import Settings from './components/Settings/Settings';

function App() {
  return (
    <Box sx={{ display: 'flex' }}>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/channels" element={<ChannelManager />} />
          <Route path="/streams" element={<StreamManager />} />
          <Route path="/epg" element={<EPGManager />} />
          <Route path="/logs" element={<LogViewer />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </Box>
  );
}

export default App;
