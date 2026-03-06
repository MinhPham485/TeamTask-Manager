const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth_middleware");

router.get("/profile", authMiddleware, (req, res) => {
    res.json({
        message: "Access granted",
        user: req.user
    });
});

module.exports = router;