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

module.exports = {
    NOTIFICATION_TYPES,
    createNotification
};
