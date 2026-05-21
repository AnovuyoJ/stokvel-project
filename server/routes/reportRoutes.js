const express = require("express")
const router = express.Router()

const {
  getContributionCompliance,
  exportCompliancePDF,
  exportComplianceCSV,
} = require("../controllers/reportController")

// GET /api/reports/:groupId          → JSON
// GET /api/reports/:groupId?format=pdf → PDF download
// GET /api/reports/:groupId?format=csv → CSV download
router.get("/:groupId", async (req, res) => {
  const format = req.query.format
  if (format === "pdf") return exportCompliancePDF(req, res)
  if (format === "csv") return exportComplianceCSV(req, res)
  return getContributionCompliance(req, res)
})

module.exports = router
