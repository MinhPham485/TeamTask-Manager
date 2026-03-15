const express = require('express');
const router = express.Router();
const {verifyToken} = require('../middlewares/auth_middleware');
const messageController = require('../controllers/message_controllers');

router.post('/', verifyToken, messageController.createMessage);
router.get('/group/:groupId', verifyToken, messageController.getMessagesByGroup);
router.delete('/:id', verifyToken, messageController.deleteMessage);

module.exports = router;
