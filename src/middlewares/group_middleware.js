const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { isGroupAdmin } = require('../services/task_permission_service');

const canManageTask = async (req, res, next) => {
    try {
        const taskId = req.params.id;

        const task = await prisma.task.findUnique({
            where: { id: taskId },
            select: {
                id: true,
                groupId: true,
            },
        });

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const membership = await prisma.groupMember.findUnique({
            where: {
                userId_groupId: {
                    userId: req.user.userId,
                    groupId: task.groupId,
                },
            },
        });

        if (!isGroupAdmin(membership)) {
            return res.status(403).json({ error: 'Only group owner or manager can manage this task' });
        }

        req.task = task;
        req.groupMembership = membership;
        next();
    } catch (error) {
        res.status(500).json({ error: 'Authorization check failed' });
    }
};
const isGroupMember = async (req, res, next) => {
    try {
        const groupId = req.body?.groupId || req.params.groupId || req.params.id;

        if (!groupId) {
            return res.status(400).json({ error: 'Group ID is required' });
        }

        const membership = await prisma.groupMember.findUnique({
            where: {
                userId_groupId: {
                    userId: req.user.userId,
                    groupId: groupId
                }
            }
        });

        if (!membership) {
            return res.status(403).json({ error: 'You are not a member of this group' });
        }

        req.groupMembership = membership;
        next();
    } catch (error) {
        res.status(500).json({ error: 'Authorization check failed' });
    }
};

const isGroupOwner = async (req, res, next) => {
    try {
        const groupId = req.params.id || req.params.groupId;

        const group = await prisma.group.findUnique({
            where: { id: groupId }
        });

        if (!group) {
            return res.status(404).json({ error: 'Group not found' });
        }

        if (group.ownerId !== req.user.userId) {
            return res.status(403).json({ error: 'Only group owner can perform this action' });
        }

        next();
    } catch (error) {
        res.status(500).json({ error: 'Authorization check failed' });
    }
};
module.exports = {
  isGroupMember,
  isGroupOwner,
  canManageTask,
};
