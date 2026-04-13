const express = require('express');
const router = express.Router();
const {verifyToken} = require('../middlewares/auth_middleware');
const {isGroupMember} = require('../middlewares/group_middleware');
const {validateAskQuestion, rateLimitAskQuestion} = require('../middlewares/ai_middleware');
const aiController = require('../controllers/ai_controllers');

router.post('/group/:groupId/ask', verifyToken, validateAskQuestion, isGroupMember, rateLimitAskQuestion, aiController.askGroupAssistant);

module.exports = router;
