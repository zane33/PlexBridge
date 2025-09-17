import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Box } from '@mui/material';
import Layout from './components/Layout/Layout';
import Dashboard from './components/Dashboard/Dashboard';
import ChannelManager from './components/ChannelManager/ChannelManager';
import StreamManager from './components/StreamManager/StreamManager';
import EPGManager from './components/EPGManager/EPGManager';
import FFmpegProfileManager from './components/FFmpegProfileManager/FFmpegProfileManager';
import LogViewer from './components/LogViewer/LogViewer';
import Settings from './components/Settings/Settings';
import BackupManager from './components/BackupManager/BackupManager';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import ConnectionMonitor from './components/ConnectionMonitor/ConnectionMonitor';

function App() {
  return (
    <ErrorBoundary>
      <ConnectionMonitor />
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
            <Route path="/ffmpeg-profiles" element={
              <ErrorBoundary>
                <FFmpegProfileManager />
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
            <Route path="/backup" element={
              <ErrorBoundary>
                <BackupManager />
              </ErrorBoundary>
            } />
          </Routes>
        </Layout>
      </Box>
    </ErrorBoundary>
  );
}

export default App;