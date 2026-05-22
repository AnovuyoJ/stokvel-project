const express = require("express");
const router = express.Router();

const Rate = require("../models/rate");

router.get("/", async (req, res) => {
    try {
        const rate = await Rate.findOne().sort({ lastUpdated: -1 });
        res.json(rate);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});


module.exports = router;
