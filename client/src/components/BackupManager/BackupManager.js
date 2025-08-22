import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Grid,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  FormControlLabel,
  Checkbox,
  CircularProgress,
  Alert,
  LinearProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  TextField,
  useTheme,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  GetApp as ExportIcon,
  Publish as ImportIcon,
  Settings as SettingsIcon,
  Storage as DatabaseIcon,
  Tv as ChannelIcon,
  PlayArrow as StreamIcon,
  Schedule as EpgIcon,
  Description as LogIcon,
  ExpandMore as ExpandMoreIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  CloudUpload as UploadIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Info as InfoIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { backupApi } from '../../services/api';

function BackupManager() {
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [exportOptions, setExportOptions] = useState({
    includeSettings: false,
    includePasswords: false,
    includeEpgData: false,
    includeLogs: false,
  });
  const [importOptions, setImportOptions] = useState({
    clearExisting: false,
    importChannels: true,
    importStreams: true,
    importEpgSources: true,
    importSettings: true,
    importEpgData: false,
  });
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [backupData, setBackupData] = useState(null);
  const [validation, setValidation] = useState(null);
  const [importResults, setImportResults] = useState(null);
  
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();

  // Export backup
  const handleExport = async () => {
    setLoading(true);
    try {
      await backupApi.downloadBackup(
        exportOptions.includeSettings,
        exportOptions.includePasswords,
        exportOptions.includeEpgData,
        exportOptions.includeLogs
      );
      enqueueSnackbar('Backup exported successfully! 📦', { variant: 'success' });
      setExportDialogOpen(false);
    } catch (error) {
      console.error('Export error:', error);
      enqueueSnackbar(
        error.response?.data?.error || 'Failed to export backup', 
        { variant: 'error' }
      );
    } finally {
      setLoading(false);
    }
  };

  // Handle file selection
  const handleFileSelect = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setImportFile(file);
    setBackupData(null);
    setValidation(null);
    setImportResults(null);

    try {
      setValidating(true);
      const data = await backupApi.parseBackupFile(file);
      setBackupData(data);

      // Validate the backup
      const validationResult = await backupApi.validateBackup(data);
      
      // Ensure validation result has proper structure
      const validation = {
        isValid: validationResult.isValid || false,
        errors: validationResult.errors || [],
        warnings: validationResult.warnings || [],
        summary: validationResult.summary || null
      };
      
      setValidation(validation);

      if (validation.isValid) {
        enqueueSnackbar('Backup file validated successfully ✅', { variant: 'success' });
      } else {
        enqueueSnackbar(
          `Backup validation failed: ${validation.errors.join(', ')}`, 
          { variant: 'error' }
        );
      }
    } catch (error) {
      console.error('File parsing error:', error);
      enqueueSnackbar(
        error.message || 'Failed to parse backup file', 
        { variant: 'error' }
      );
      setImportFile(null);
    } finally {
      setValidating(false);
    }
  }, [enqueueSnackbar]);

  // Import backup
  const handleImport = async () => {
    if (!backupData || !validation?.isValid) {
      enqueueSnackbar('Please select a valid backup file first', { variant: 'error' });
      return;
    }

    setImporting(true);
    try {
      const response = await backupApi.importBackup(backupData, importOptions);
      setImportResults(response.data);
      
      const { summary } = response.data;
      enqueueSnackbar(
        `Import completed! ${summary.totalImported} items imported, ${summary.totalSkipped} skipped, ${summary.totalErrors} errors`, 
        { variant: summary.totalErrors > 0 ? 'warning' : 'success' }
      );
      
      // Reset form
      setImportFile(null);
      setBackupData(null);
      setValidation(null);
      
    } catch (error) {
      console.error('Import error:', error);
      enqueueSnackbar(
        error.response?.data?.error || 'Failed to import backup', 
        { variant: 'error' }
      );
    } finally {
      setImporting(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp).toLocaleString();
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <DatabaseIcon color="primary" />
        Backup & Restore
      </Typography>
      
      <Typography variant="body1" color="text.secondary" gutterBottom>
        Export and import complete PlexBridge configurations including channels, streams, settings, EPG data, and logs.
      </Typography>

      <Grid container spacing={3} sx={{ mt: 2 }}>
        {/* Export Section */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ExportIcon color="primary" />
                Export Backup
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Create a complete backup of your PlexBridge configuration.
              </Typography>
              
              <Box sx={{ mt: 3 }}>
                <Button
                  variant="contained"
                  startIcon={<ExportIcon />}
                  onClick={() => setExportDialogOpen(true)}
                  size="large"
                  fullWidth
                  sx={{ mb: 2 }}
                >
                  Create Backup
                </Button>
                
                <Alert severity="info" sx={{ fontSize: '0.875rem' }}>
                  <strong>What's included:</strong> Channels, Streams, Settings, EPG Sources
                  <br />
                  <strong>Optional:</strong> Authentication credentials, EPG data, logs
                </Alert>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Import Section */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ImportIcon color="primary" />
                Import Backup
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Restore your PlexBridge configuration from a backup file.
              </Typography>
              
              <Box sx={{ mt: 3 }}>
                <Button
                  variant="contained"
                  startIcon={<ImportIcon />}
                  onClick={() => setImportDialogOpen(true)}
                  size="large"
                  fullWidth
                  sx={{ mb: 2 }}
                  color="secondary"
                >
                  Import Backup
                </Button>
                
                <Alert severity="warning" sx={{ fontSize: '0.875rem' }}>
                  <strong>Caution:</strong> Importing will modify your current configuration.
                  <br />
                  <strong>Tip:</strong> Create a backup before importing to ensure you can revert changes.
                </Alert>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Export Dialog */}
      <Dialog 
        open={exportDialogOpen} 
        onClose={() => setExportDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ExportIcon color="primary" />
            Export Backup Configuration
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Choose what data to include in your backup file:
          </Typography>

          <Box sx={{ mt: 2 }}>
            <Paper sx={{ p: 2, backgroundColor: 'grey.50' }}>
              <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
                Always Included:
              </Typography>
              <List dense>
                <ListItem disablePadding>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <ChannelIcon fontSize="small" color="primary" />
                  </ListItemIcon>
                  <ListItemText primary="Channels" secondary="All TV channels and their settings" />
                </ListItem>
                <ListItem disablePadding>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <StreamIcon fontSize="small" color="primary" />
                  </ListItemIcon>
                  <ListItemText primary="Streams" secondary="Stream URLs and configurations" />
                </ListItem>
                <ListItem disablePadding>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <EpgIcon fontSize="small" color="primary" />
                  </ListItemIcon>
                  <ListItemText primary="EPG Sources" secondary="Electronic Program Guide sources" />
                </ListItem>
              </List>
            </Paper>

            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
                Optional Data:
              </Typography>
              
              <FormControlLabel
                control={
                  <Checkbox
                    checked={exportOptions.includeSettings}
                    onChange={(e) => setExportOptions(prev => ({ 
                      ...prev, 
                      includeSettings: e.target.checked 
                    }))}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2">Include Application Settings</Typography>
                    <Typography variant="caption" color="text.secondary">
                      System configuration and preferences (recommended)
                    </Typography>
                  </Box>
                }
              />
              
              <FormControlLabel
                control={
                  <Checkbox
                    checked={exportOptions.includePasswords}
                    onChange={(e) => setExportOptions(prev => ({ 
                      ...prev, 
                      includePasswords: e.target.checked 
                    }))}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2">Include Authentication Passwords</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Stream authentication passwords (security risk if sharing backup)
                    </Typography>
                  </Box>
                }
              />
              
              <FormControlLabel
                control={
                  <Checkbox
                    checked={exportOptions.includeEpgData}
                    onChange={(e) => setExportOptions(prev => ({ 
                      ...prev, 
                      includeEpgData: e.target.checked 
                    }))}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2">Include EPG Program Data</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Channel listings and program schedules (increases backup size)
                    </Typography>
                  </Box>
                }
              />
              
              <FormControlLabel
                control={
                  <Checkbox
                    checked={exportOptions.includeLogs}
                    onChange={(e) => setExportOptions(prev => ({ 
                      ...prev, 
                      includeLogs: e.target.checked 
                    }))}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2">Include Recent Logs</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Last 1000 log entries for troubleshooting (increases backup size)
                    </Typography>
                  </Box>
                }
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportDialogOpen(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleExport} 
            variant="contained"
            disabled={loading}
            startIcon={loading ? <CircularProgress size={20} /> : <SaveIcon />}
          >
            {loading ? 'Exporting...' : 'Export Backup'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Import Dialog */}
      <Dialog 
        open={importDialogOpen} 
        onClose={() => setImportDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ImportIcon color="secondary" />
            Import Backup Configuration
          </Box>
        </DialogTitle>
        <DialogContent>
          {!importFile && (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <input
                accept=".json"
                style={{ display: 'none' }}
                id="backup-file-input"
                type="file"
                onChange={handleFileSelect}
              />
              <label htmlFor="backup-file-input">
                <Button
                  variant="outlined"
                  component="span"
                  startIcon={<UploadIcon />}
                  size="large"
                  sx={{ mb: 2 }}
                >
                  Select Backup File
                </Button>
              </label>
              <Typography variant="body2" color="text.secondary">
                Choose a PlexBridge backup file (.json) to import
              </Typography>
            </Box>
          )}

          {validating && (
            <Box sx={{ textAlign: 'center', py: 2 }}>
              <CircularProgress sx={{ mb: 2 }} />
              <Typography>Validating backup file...</Typography>
            </Box>
          )}

          {validation && (
            <Box sx={{ mt: 2 }}>
              <Accordion defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {validation.isValid ? (
                      <CheckCircleIcon color="success" />
                    ) : (
                      <ErrorIcon color="error" />
                    )}
                    <Typography variant="h6">
                      Backup Validation {validation.isValid ? 'Successful' : 'Failed'}
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  {validation.summary && (
                    <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell><strong>Data Type</strong></TableCell>
                            <TableCell align="right"><strong>Count</strong></TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          <TableRow>
                            <TableCell>Channels</TableCell>
                            <TableCell align="right">{validation.summary.channels}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Streams</TableCell>
                            <TableCell align="right">{validation.summary.streams}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>EPG Sources</TableCell>
                            <TableCell align="right">{validation.summary.epgSources}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Settings</TableCell>
                            <TableCell align="right">{validation.summary.settings}</TableCell>
                          </TableRow>
                          {validation.summary.epgChannels > 0 && (
                            <TableRow>
                              <TableCell>EPG Channels</TableCell>
                              <TableCell align="right">{validation.summary.epgChannels}</TableCell>
                            </TableRow>
                          )}
                          {validation.summary.epgPrograms > 0 && (
                            <TableRow>
                              <TableCell>EPG Programs</TableCell>
                              <TableCell align="right">{validation.summary.epgPrograms}</TableCell>
                            </TableRow>
                          )}
                          {validation.summary.logs > 0 && (
                            <TableRow>
                              <TableCell>Log Entries</TableCell>
                              <TableCell align="right">{validation.summary.logs}</TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}

                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2"><strong>Version:</strong> {validation.summary?.version}</Typography>
                    <Typography variant="body2"><strong>Created:</strong> {formatTimestamp(validation.summary?.timestamp)}</Typography>
                    <Typography variant="body2"><strong>Includes Passwords:</strong> {validation.summary?.includesPasswords ? 'Yes' : 'No'}</Typography>
                  </Box>

                  {validation.errors && validation.errors.length > 0 && (
                    <Alert severity="error" sx={{ mb: 1 }}>
                      <Typography variant="subtitle2" gutterBottom>Validation Errors:</Typography>
                      <ul style={{ margin: 0, paddingLeft: '20px' }}>
                        {validation.errors.map((error, index) => (
                          <li key={index}>{error}</li>
                        ))}
                      </ul>
                    </Alert>
                  )}

                  {validation.warnings && validation.warnings.length > 0 && (
                    <Alert severity="warning">
                      <Typography variant="subtitle2" gutterBottom>Warnings:</Typography>
                      <ul style={{ margin: 0, paddingLeft: '20px' }}>
                        {validation.warnings.map((warning, index) => (
                          <li key={index}>{warning}</li>
                        ))}
                      </ul>
                    </Alert>
                  )}
                </AccordionDetails>
              </Accordion>

              {validation.isValid && (
                <Box sx={{ mt: 3 }}>
                  <Typography variant="h6" gutterBottom>Import Options</Typography>
                  
                  <Paper sx={{ p: 2, mb: 2, bgcolor: 'error.light', color: 'error.contrastText' }}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={importOptions.clearExisting}
                          onChange={(e) => setImportOptions(prev => ({ 
                            ...prev, 
                            clearExisting: e.target.checked 
                          }))}
                          sx={{ color: 'error.contrastText' }}
                        />
                      }
                      label={
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                            Clear Existing Data (Dangerous!)
                          </Typography>
                          <Typography variant="caption">
                            This will DELETE all existing data before importing. Use with extreme caution!
                          </Typography>
                        </Box>
                      }
                    />
                  </Paper>

                  <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                    <Typography variant="subtitle2" gutterBottom>Data to Import:</Typography>
                    
                    <Grid container spacing={1}>
                      <Grid item xs={6}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={importOptions.importChannels}
                              onChange={(e) => setImportOptions(prev => ({ 
                                ...prev, 
                                importChannels: e.target.checked 
                              }))}
                            />
                          }
                          label="Channels"
                        />
                      </Grid>
                      <Grid item xs={6}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={importOptions.importStreams}
                              onChange={(e) => setImportOptions(prev => ({ 
                                ...prev, 
                                importStreams: e.target.checked 
                              }))}
                            />
                          }
                          label="Streams"
                        />
                      </Grid>
                      <Grid item xs={6}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={importOptions.importEpgSources}
                              onChange={(e) => setImportOptions(prev => ({ 
                                ...prev, 
                                importEpgSources: e.target.checked 
                              }))}
                            />
                          }
                          label="EPG Sources"
                        />
                      </Grid>
                      <Grid item xs={6}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={importOptions.importSettings}
                              onChange={(e) => setImportOptions(prev => ({ 
                                ...prev, 
                                importSettings: e.target.checked 
                              }))}
                            />
                          }
                          label="Settings"
                        />
                      </Grid>
                      {validation.summary?.epgChannels > 0 && (
                        <Grid item xs={12}>
                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={importOptions.importEpgData}
                                onChange={(e) => setImportOptions(prev => ({ 
                                  ...prev, 
                                  importEpgData: e.target.checked 
                                }))}
                              />
                            }
                            label={
                              <Box>
                                <Typography variant="body2">Import EPG Program Data</Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {validation.summary.epgChannels} channels, {validation.summary.epgPrograms} programs
                                </Typography>
                              </Box>
                            }
                          />
                        </Grid>
                      )}
                    </Grid>
                  </Paper>
                </Box>
              )}
            </Box>
          )}

          {importResults && (
            <Accordion defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {importResults.summary.totalErrors === 0 ? (
                    <CheckCircleIcon color="success" />
                  ) : (
                    <WarningIcon color="warning" />
                  )}
                  <Typography variant="h6">Import Results</Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell><strong>Data Type</strong></TableCell>
                        <TableCell align="right"><strong>Imported</strong></TableCell>
                        <TableCell align="right"><strong>Skipped</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.entries(importResults.imported).map(([key, value]) => (
                        <TableRow key={key}>
                          <TableCell>{key.charAt(0).toUpperCase() + key.slice(1)}</TableCell>
                          <TableCell align="right">
                            <Chip label={value} color="success" size="small" />
                          </TableCell>
                          <TableCell align="right">
                            <Chip label={importResults.skipped[key]} color="default" size="small" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>

                {importResults.errors.length > 0 && (
                  <Alert severity="error">
                    <Typography variant="subtitle2" gutterBottom>Import Errors:</Typography>
                    <ul style={{ margin: 0, paddingLeft: '20px' }}>
                      {importResults.errors.map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </Alert>
                )}
              </AccordionDetails>
            </Accordion>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setImportDialogOpen(false);
            setImportFile(null);
            setBackupData(null);
            setValidation(null);
            setImportResults(null);
          }}>
            {importResults ? 'Close' : 'Cancel'}
          </Button>
          
          {importFile && !importResults && (
            <Button onClick={() => {
              setImportFile(null);
              setBackupData(null);
              setValidation(null);
            }}>
              Choose Different File
            </Button>
          )}

          {validation?.isValid && !importResults && (
            <Button 
              onClick={handleImport} 
              variant="contained"
              color="secondary"
              disabled={importing}
              startIcon={importing ? <CircularProgress size={20} /> : <ImportIcon />}
            >
              {importing ? 'Importing...' : 'Import Backup'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default BackupManager;