// Entry point: connects to database and starts server
require('dotenv').config( );
const mongoose = require("mongoose");
const app = require("./app");


const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("Database connected successfully");
    require("./services/rateService");
  })
  .catch((err) => {
    console.error("Database connection failed:", err.message);
  });
