const express = require('express');
const router = express.Router();
const {verifyToken} = require('../middlewares/auth_middleware');
const messageController = require('../controllers/message_controllers');
const attachmentController = require('../controllers/attachment_controllers');

router.post('/attachments', verifyToken, attachmentController.createMessageWithAttachment);
router.post('/', verifyToken, messageController.createMessage);
router.get('/group/:groupId', verifyToken, messageController.getMessagesByGroup);
router.get('/:id/attachments', verifyToken, attachmentController.getMessageAttachments);
router.delete('/:id', verifyToken, messageController.deleteMessage);
router.get('/direct/threads', verifyToken, messageController.getDirectThreads);
router.post('/direct/threads', verifyToken, messageController.createOrGetDirectThread);
router.get('/direct/threads/:threadId/messages', verifyToken, messageController.getDirectMessagesByThread);
router.post('/direct/messages', verifyToken, messageController.createDirectMessage);

module.exports = router;
