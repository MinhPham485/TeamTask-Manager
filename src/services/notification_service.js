const {PrismaClient} = require('@prisma/client');

const prisma = new PrismaClient();

const NOTIFICATION_TYPES = {
    DEADLINE_TASK_ASSIGNED: 'DEADLINE_TASK_ASSIGNED'
};

const createNotification = async ({
    userId,
    actorId,
    type,
    title,
    body,
    deadlineTaskId,
    groupId
}) => {
    if (!userId) {
        throw new Error('Notification userId is required');
    }

    if (!type || !title || !body) {
        throw new Error('Notification type, title, and body are required');
    }

    return prisma.notification.create({
        data: {
            userId,
            actorId: actorId ?? null,
            type,
            title,
            body,
            deadlineTaskId: deadlineTaskId ?? null,
            groupId: groupId ?? null
        }
    });
};

const createDeadlineTaskAssignedNotification = async ({
    recipientId,
    actorId,
    deadlineTaskId,
    groupId,
    taskTitle
}) => {
    if (!recipientId || !deadlineTaskId || !taskTitle) {
        throw new Error('Missing required deadline task notification fields');
    }

    if (recipientId === actorId) {
        return null;
    }

    return createNotification({
        userId: recipientId,
        actorId,
        type: NOTIFICATION_TYPES.DEADLINE_TASK_ASSIGNED,
        title: 'Ban duoc them vao deadline task',
        body: `Ban vua duoc them vao "${taskTitle}"`,
        deadlineTaskId,
        groupId
    });
};

const listUserNotifications = async (userId, limit = 10) => {
    return prisma.notification.findMany({
        where: {userId},
        orderBy: {
            createdAt: 'desc'
        },
        take: limit,
        include: {
            actor: {
                select: {
                    id: true,
                    username: true,
                    email: true
                }
            }
        }
    });
};

const getUnreadNotificationCount = async (userId) => {
    return prisma.notification.count({
        where: {
            userId,
            isRead: false
        }
    });
};

const markAllNotificationsAsRead = async (userId) => {
    const result = await prisma.notification.updateMany({
        where: {
            userId,
            isRead: false
        },
        data: {
            isRead: true,
            readAt: new Date()
        }
    });

    return result.count;
};

module.exports = {
    NOTIFICATION_TYPES,
    createNotification,
    createDeadlineTaskAssignedNotification,
    listUserNotifications,
    getUnreadNotificationCount,
    markAllNotificationsAsRead
};
