jest.mock('../services/notification_service', () => ({
    listUserNotifications: jest.fn(),
    getUnreadNotificationCount: jest.fn(),
    markAllNotificationsAsRead: jest.fn()
}));

const {
    listUserNotifications,
    getUnreadNotificationCount,
    markAllNotificationsAsRead
} = require('../services/notification_service');
const notificationController = require('../controllers/notification_controllers');

const createResponse = () => {
    const res = {
        status: jest.fn(() => res),
        json: jest.fn()
    };

    return res;
};

describe('notification controller', () => {
    beforeEach(() => {
        listUserNotifications.mockReset();
        getUnreadNotificationCount.mockReset();
        markAllNotificationsAsRead.mockReset();
    });

    test('lists current user notifications', async () => {
        const req = {
            user: {userId: 'user-1'}
        };
        const res = createResponse();
        const notifications = [
            {id: 'notification-1', title: 'Ban duoc them vao deadline task'}
        ];

        listUserNotifications.mockResolvedValue(notifications);

        await notificationController.getMyNotifications(req, res);

        expect(listUserNotifications).toHaveBeenCalledWith('user-1', 10);
        expect(res.json).toHaveBeenCalledWith(notifications);
    });

    test('returns unread notification count for current user', async () => {
        const req = {
            user: {userId: 'user-1'}
        };
        const res = createResponse();

        getUnreadNotificationCount.mockResolvedValue(3);

        await notificationController.getMyUnreadNotificationCount(req, res);

        expect(getUnreadNotificationCount).toHaveBeenCalledWith('user-1');
        expect(res.json).toHaveBeenCalledWith({count: 3});
    });

    test('marks all current user notifications as read', async () => {
        const req = {
            user: {userId: 'user-1'}
        };
        const res = createResponse();

        markAllNotificationsAsRead.mockResolvedValue(2);

        await notificationController.markMyNotificationsAsRead(req, res);

        expect(markAllNotificationsAsRead).toHaveBeenCalledWith('user-1');
        expect(res.json).toHaveBeenCalledWith({count: 2});
    });
});
