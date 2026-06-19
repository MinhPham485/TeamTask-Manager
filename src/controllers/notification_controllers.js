const {
    getUnreadNotificationCount,
    listUserNotifications,
    markAllNotificationsAsRead
} = require('../services/notification_service');

exports.getMyNotifications = async (req, res) => {
    try {
        const notifications = await listUserNotifications(req.user.userId, 10);
        res.json(notifications);
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.getMyUnreadNotificationCount = async (req, res) => {
    try {
        const count = await getUnreadNotificationCount(req.user.userId);
        res.json({count});
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.markMyNotificationsAsRead = async (req, res) => {
    try {
        const count = await markAllNotificationsAsRead(req.user.userId);
        res.json({count});
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};
