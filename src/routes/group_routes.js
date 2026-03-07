const express = require("express");
const router = express.Router();
const {verifyToken} = require("../middlewares/auth_middleware");
const groupController = require("../controllers/group_controllers");

router.post("/", verifyToken, groupController.createGroup);
router.post("/join", verifyToken, groupController.joinGroup);
router.get("/", verifyToken, groupController.getGroups);
router.get("/:id", verifyToken, groupController.getGroupById);

module.exports = router;