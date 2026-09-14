const express = require('express');
const path = require('path');
const apiRoutes = require('./src/routes/api');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware Body Parser (Wajib untuk menerima input JSON & Form)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Folder Statis Public
app.use(express.static(path.join(__dirname, 'public')));

// Register Router API
app.use('/api', apiRoutes);

// Fallback Route Serves Frontend index.html (Sintaks Standar Aman)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Server SupplySync berjalan di http://localhost:${PORT}`);
});