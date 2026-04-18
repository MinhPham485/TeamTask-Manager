const express = require('express');
const router = express.Router();
const {verifyToken} = require('../middlewares/auth_middleware');
const {isGroupMember} = require('../middlewares/group_middleware');
const {validateAskQuestion} = require('../middlewares/ai_middleware');
const {aiMetricsMiddleware} = require('../services/metrics_service');
const aiController = require('../controllers/ai_controllers');

router.use(aiMetricsMiddleware);

router.post('/ask', verifyToken, validateAskQuestion, aiController.askAssistant);
router.post('/group/:groupId/ask', verifyToken, validateAskQuestion, isGroupMember, aiController.askGroupAssistant);

module.exports = router;
