const dotenv = require("dotenv");
dotenv.config();
// Creates and configures the Express app

const express = require("express");
const cors = require("cors");


// Load environment variables


// Import route modules
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const groupRoutes = require("./routes/groupRoutes");
const payfastRoutes = require("./routes/payfastRoutes");
const memberRoutes  = require("./routes/memberRoutes");
const rateRoutes = require("./routes/rateRoutes");
const { getContributionCompliance, exportCompliancePDF, exportComplianceCSV } = require("./controllers/reportController");

//const notificationRoutes = require('./routes/notificationRoutes');



const app = express();

// Parse JSON and form data
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Configure CORS for frontend communication
app.use(
  cors({
    origin: function(origin, callback) {
      const allowedOrigins = [
        process.env.CLIENT_URL,
        "https://stokvel-frontend-agdyfaameebwe4f7.brazilsouth-01.azurewebsites.net"
      ];
      if (!origin || /^http:\/\/localhost(:\d+)?$/.test(origin) || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Simple health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});


// Mount route modules under API paths
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api", groupRoutes);
app.use("/api/payfast", payfastRoutes);
app.use("/api/members", memberRoutes);
app.use("/api/rates", rateRoutes);

// Report routes — mounted directly on app to avoid router-chain issues
app.get("/api/reports-test", (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.get("/api/reports/:groupId", (req, res) => {
  const fmt = req.query.format;
  if (fmt === "pdf") return exportCompliancePDF(req, res);
  if (fmt === "csv") return exportComplianceCSV(req, res);
  return getContributionCompliance(req, res);
});

//app.use('/api', notificationRoutes);




module.exports = app;
