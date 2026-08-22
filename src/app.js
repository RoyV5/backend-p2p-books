// src/index.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const shelfRoutes = require('./routes/shelf');
const settingsRoutes = require('./routes/settings')
const searchRoutes = require('./routes/search')
const loansRoutes = require('./routes/loans')
const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use((req, res, next) => {
  console.log(req.method, req.url);
  next();
});
app.use('/api/auth', authRoutes);   
app.use('/api/shelf', shelfRoutes);  
app.use('/api/settings', settingsRoutes)
app.use('/api/search', searchRoutes)
app.use('/api/loans', loansRoutes)

module.exports = app;