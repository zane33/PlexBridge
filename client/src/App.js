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
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <Box sx={{ display: 'flex' }}>
        <Layout>
          <Routes>
            <Route path="/" element={
              <ErrorBoundary>
                <Dashboard />
              </ErrorBoundary>
            } />
            <Route path="/channels" element={
              <ErrorBoundary>
                <ChannelManager />
              </ErrorBoundary>
            } />
            <Route path="/streams" element={
              <ErrorBoundary>
                <StreamManager />
              </ErrorBoundary>
            } />
            <Route path="/epg" element={
              <ErrorBoundary>
                <EPGManager />
              </ErrorBoundary>
            } />
            <Route path="/logs" element={
              <ErrorBoundary>
                <LogViewer />
              </ErrorBoundary>
            } />
            <Route path="/settings" element={
              <ErrorBoundary>
                <Settings />
              </ErrorBoundary>
            } />
          </Routes>
        </Layout>
      </Box>
    </ErrorBoundary>
  );
}

export default App;
