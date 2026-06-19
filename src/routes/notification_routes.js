const express = require('express');
const router = express.Router();
const {verifyToken} = require('../middlewares/auth_middleware');
const notificationController = require('../controllers/notification_controllers');

router.get('/', verifyToken, notificationController.getMyNotifications);
router.get('/unread-count', verifyToken, notificationController.getMyUnreadNotificationCount);
router.patch('/read-all', verifyToken, notificationController.markMyNotificationsAsRead);

module.exports = router;
