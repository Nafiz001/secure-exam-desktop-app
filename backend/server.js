const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { initializeSchema } = require('./models/schema');
const authRoutes = require('./routes/auth');
const examRoutes = require('./routes/exams');
const uploadRoutes = require('./routes/uploads');
const aiRoutes = require('./routes/ai');
const proctoringRoutes = require('./routes/proctoring');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware - Allow all origins for Electron app
app.use(cors({
  origin: true, // Accept all origins (needed for Electron file:// protocol)
  credentials: true
}));
// Raised from the 100kb default to comfortably fit base64 webcam snapshots
// and base64 question images (up to ~7MB encoded) in JSON request bodies.
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Static file serving for uploaded question images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/proctoring', proctoringRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Invigilo Backend API is running',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Initialize database and start server
const startServer = async () => {
  try {
    // Initialize database schema
    await initializeSchema();
    
    // Start server
    app.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════╗
║   Invigilo Backend API Server          ║
╠════════════════════════════════════════╣
║   Status: Running                      ║
║   Port: ${PORT}                        ║
║   Environment: ${process.env.NODE_ENV || 'development'}              ║
║   Database: PostgreSQL                 ║
╚════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
  process.exit(1);
});

// Start the server
startServer();
