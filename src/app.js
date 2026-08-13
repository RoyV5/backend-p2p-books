// src/index.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const shelfRoutes = require('./routes/shelf');
const settingsRoutes = require('./routes/settings')
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

module.exports = app;
