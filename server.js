const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Dùng biến môi trường DATABASE_URL Railway cung cấp
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Tạo table accounts (chạy lệnh này 1 lần trên database của bạn):
// CREATE TABLE accounts (id VARCHAR(32) PRIMARY KEY, label VARCHAR(255), secret VARCHAR(255), issuer VARCHAR(255), digits INT, period INT);

app.get('/api/accounts', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM accounts');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get accounts' });
  }
});

app.post('/api/accounts', async (req, res) => {
  try {
    const accounts = req.body;
    await pool.query('DELETE FROM accounts');
    for (const acc of accounts) {
      await pool.query(
        'INSERT INTO accounts (id, label, secret, issuer, digits, period) VALUES ($1, $2, $3, $4, $5, $6)',
        [acc.id, acc.label, acc.secret, acc.issuer, acc.digits, acc.period]
      );
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save accounts' });
  }
});

app.listen(3001, () => {
  console.log('Server running on port 3001');
});
