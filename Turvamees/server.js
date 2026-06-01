const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// Give the browser all files from the public folder: HTML, CSS, JS and sounds.
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`App is running: http://localhost:${PORT}`);
});
