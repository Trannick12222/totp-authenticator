const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

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

app.get('/api/accounts', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM accounts');
    console.log('GET /api/accounts:', rows);
    res.json(rows);
  } catch (error) {
    console.error('GET /api/accounts error:', error);
    res.status(500).json({ error: 'Failed to get accounts', detail: error.message });
  }
});

app.post('/api/accounts', async (req, res) => {
  try {
    const accounts = req.body;
    console.log('POST /api/accounts, incoming:', accounts);
    await pool.query('DELETE FROM accounts');
    for (const acc of accounts) {
      await pool.query(
        'INSERT INTO accounts (id, label, secret, issuer, digits, period) VALUES (?, ?, ?, ?, ?, ?)',
        [acc.id, acc.label, acc.secret, acc.issuer, acc.digits, acc.period]
      );
    }
    res.json({ success: true });
  } catch (error) {
    console.error('POST /api/accounts error:', error);
    res.status(500).json({ error: 'Failed to save accounts', detail: error.message });
  }
});

app.listen(3001, () => {
  console.log('Server running on port 3001');
});
