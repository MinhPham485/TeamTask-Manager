const express = require("express");
const router = express.Router();
const {verifyToken} = require("../middlewares/auth_middleware");
const {isGroupMember, isGroupOwner} = require("../middlewares/group_middleware");
const groupController = require("../controllers/group_controllers");

router.post("/", verifyToken, groupController.createGroup);
router.post("/join", verifyToken, groupController.joinGroup);
router.get("/", verifyToken, groupController.getGroups);
router.put("/:id", verifyToken, isGroupOwner, groupController.updateGroup);
router.delete("/:id", verifyToken, isGroupOwner, groupController.deleteGroup);
router.delete("/:id/members/:userId", verifyToken, isGroupOwner, groupController.removeGroupMember);
router.get("/:id", verifyToken, isGroupMember, groupController.getGroupById);
router.get("/:id/members", verifyToken, isGroupMember, groupController.getGroupMembers);

module.exports = router;