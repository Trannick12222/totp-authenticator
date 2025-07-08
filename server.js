const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');

const app = express();

// CORS configuration - CHO PHÉP TẤT CẢ DOMAIN
app.use(cors({
  origin: '*', // Hoặc chỉ định domain cụ thể: ['https://otp.nicktran.org']
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Serve static files from React build
app.use(express.static(path.join(__dirname, 'build')));

// Debug: Log environment variables
console.log('MySQL Config:', {
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT,
  password: process.env.MYSQLPASSWORD ? '***HIDDEN***' : 'NOT SET'
});

// Kết nối pool dùng biến môi trường Railway tự inject
const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Test database connection
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Connected to MySQL successfully!');
    
    // Test if table exists, create if not
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS accounts (
        id VARCHAR(255) PRIMARY KEY,
        label VARCHAR(255) NOT NULL,
        secret VARCHAR(255) NOT NULL,
        issuer VARCHAR(255) DEFAULT '',
        digits INT DEFAULT 6,
        period INT DEFAULT 30,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Table accounts ready!');
    
    connection.release();
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
  }
};

// Test connection on startup
testConnection();

app.get('/api/accounts', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM accounts ORDER BY created_at DESC');
    console.log('GET /api/accounts:', rows.length, 'accounts found');
    res.json(rows);
  } catch (error) {
    console.error('GET /api/accounts error:', error);
    res.status(500).json({ error: 'Failed to get accounts', detail: error.message });
  }
});

app.post('/api/accounts', async (req, res) => {
  try {
    const accounts = req.body;
    console.log('POST /api/accounts, incoming:', accounts.length, 'accounts');
    
    // Delete all existing accounts
    await pool.query('DELETE FROM accounts');
    
    // Insert new accounts
    for (const acc of accounts) {
      await pool.query(
        'INSERT INTO accounts (id, label, secret, issuer, digits, period) VALUES (?, ?, ?, ?, ?, ?)',
        [acc.id, acc.label, acc.secret, acc.issuer || '', acc.digits || 6, acc.period || 30]
      );
    }
    
    console.log('✅ Saved', accounts.length, 'accounts to database');
    res.json({ success: true });
  } catch (error) {
    console.error('POST /api/accounts error:', error);
    res.status(500).json({ error: 'Failed to save accounts', detail: error.message });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'OK', database: 'Connected' });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', database: 'Disconnected', error: error.message });
  }
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});