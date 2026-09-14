const express = require('express');
const path = require('path');
const apiRoutes = require('./src/routes/api');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware Body Parser (Wajib untuk menerima input form JSON)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Folder Statis Public
app.use(express.static(path.join(__dirname, 'public')));

// Register Router API
app.use('/api', apiRoutes);

// Route Utama Serve Frontend HTML
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Server SupplySync berjalan di http://localhost:${PORT}`);
});