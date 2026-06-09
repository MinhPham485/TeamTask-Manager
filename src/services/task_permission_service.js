const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const GROUP_ADMIN_ROLES = new Set(['owner', 'manager']);

const isGroupAdmin = (membership) => {
    return Boolean(membership && GROUP_ADMIN_ROLES.has(membership.role));
};

const isTaskLeader = (taskMembership) => {
    return taskMembership?.role === 'leader';
};

const hasTaskParticipation = (taskMembership) => {
    return Boolean(taskMembership);
};

const getGroupMembership = async (userId, groupId) => {
    return prisma.groupMember.findUnique({
        where: {
            userId_groupId: {
                userId,
                groupId,
            },
        },
    });
};

const getTaskAccess = async (taskId, userId) => {
    const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: {
            id: true,
            groupId: true,
            listId: true,
            taskMemberships: {
                where: { userId },
                select: {
                    id: true,
                    role: true,
                    userId: true
                }
            }
        }
    });

    if (!task) {
        return { error: { status: 404, message: 'Task not found' } };
    }

    const groupMembership = await getGroupMembership(userId, task.groupId);

    if (!groupMembership) {
        return { error: { status: 403, message: 'You do not have permission to access this task' } };
    }

    const taskMembership = task.taskMemberships[0] ?? null;
    const groupAdmin = isGroupAdmin(groupMembership);
    const leader = isTaskLeader(taskMembership);
    const participant = hasTaskParticipation(taskMembership);

    return {
        task: {
            id: task.id,
            groupId: task.groupId,
            listId: task.listId
        },
        groupMembership,
        taskMembership,
        access: {
            canView: groupAdmin || participant,
            canManageTask: groupAdmin || leader,
            canManageSections: groupAdmin || leader,
            canParticipate: groupAdmin || participant,
            isParticipant: participant,
            isLeader: leader,
            isGroupAdmin: groupAdmin
        }
    };
};

const getTaskAccessFilter = ({ userId, membership }) => {
    if (isGroupAdmin(membership)) {
        return {};
    }

    return {
        taskMemberships: {
            some: {
                userId
            }
        }
    };
};

module.exports = {
    isGroupAdmin,
    isTaskLeader,
    hasTaskParticipation,
    getGroupMembership,
    getTaskAccess,
    getTaskAccessFilter,
};
