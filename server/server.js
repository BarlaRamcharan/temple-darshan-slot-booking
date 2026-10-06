require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/db');
const { seedDatabase } = require('./data/seed');
const authRoutes = require('./routes/authRoutes');
const templeRoutes = require('./routes/templeRoutes');
const slotRoutes = require('./routes/slotRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Temple Darshan API is running.' });
});

app.use('/api/auth', authRoutes);
app.use('/api/temples', templeRoutes);
app.use('/api/slots', slotRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/admin', adminRoutes);

const clientRoot = path.join(__dirname, '../client');
const projectAssetsRoot = path.join(__dirname, '../assets');
app.use('/assets', express.static(projectAssetsRoot));
app.use(express.static(clientRoot));

app.get('/verify-booking/:token', (req, res) => {
  return res.sendFile(path.join(clientRoot, 'verify-booking.html'));
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ message: 'API route not found.' });
  }
  if (req.path === '/assets' || req.path.startsWith('/assets/')) {
    return res.status(404).end();
  }
  return res.sendFile(path.join(clientRoot, 'index.html'));
});

app.use((error, req, res, next) => {
  console.error('Request failed:', error.code || error.name || 'SERVER_ERROR');
  if (res.headersSent) {
    return next(error);
  }
  return res.status(500).json({ message: 'The request could not be completed. Please try again.' });
});

async function startServer() {
  await connectDB();
  await seedDatabase();

  app.listen(PORT, HOST, () => {
    console.log(`Temple Darshan server running on ${HOST}:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
