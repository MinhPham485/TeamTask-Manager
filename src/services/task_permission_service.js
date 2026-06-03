const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const GROUP_ADMIN_ROLES = new Set(['owner', 'manager']);

const isGroupAdmin = (membership) => {
    return membership && GROUP_ADMIN_ROLES.has(membership.role);
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

module.exports = {
    isGroupAdmin,
    getGroupMembership,
};
