require('dotenv').config({
    path: process.env.NODE_ENV === 'test'
        ? '.env.test'
        : '.env'
});

const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

module.exports = pool;