const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { getTaskAccess, isGroupAdmin } = require('../services/task_permission_service');

const attachTaskAccess = async (req, res, next, requiredAccess, forbiddenMessage) => {
    try {
        const taskId = req.params.id || req.params.taskId || req.body?.taskId;

        if (!taskId) {
            return res.status(400).json({ error: 'Task ID is required' });
        }

        const taskResult = await getTaskAccess(taskId, req.user.userId);

        if (taskResult.error) {
            return res.status(taskResult.error.status).json({ error: taskResult.error.message });
        }

        if (!taskResult.access[requiredAccess]) {
            return res.status(403).json({ error: forbiddenMessage });
        }

        req.task = taskResult.task;
        req.taskAccess = taskResult.access;
        req.taskMembership = taskResult.taskMembership;
        req.groupMembership = taskResult.groupMembership;
        next();
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Authorization check failed' });
    }
};

const canManageTask = async (req, res, next) => {
    return attachTaskAccess(
        req,
        res,
        next,
        'canManageTask',
        'Only task leaders or group managers can manage this task'
    );
};

const canViewTask = async (req, res, next) => {
    return attachTaskAccess(
        req,
        res,
        next,
        'canView',
        'You do not have permission to access this task'
    );
};

const canParticipateInTask = async (req, res, next) => {
    return attachTaskAccess(
        req,
        res,
        next,
        'canParticipate',
        'Only task participants can update this task'
    );
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
        console.error(error);
        res.status(500).json({ error: 'Authorization check failed' });
    }
};

const canManageGroupTasks = async (req, res, next) => {
    try {
        const groupId = req.body?.groupId || req.params.groupId || req.params.id;

        if (!groupId) {
            return res.status(400).json({ error: 'Group ID is required' });
        }

        const membership = await prisma.groupMember.findUnique({
            where: {
                userId_groupId: {
                    userId: req.user.userId,
                    groupId
                }
            }
        });

        if (!isGroupAdmin(membership)) {
            return res.status(403).json({ error: 'Only group owner or manager can manage group tasks' });
        }

        req.groupMembership = membership;
        next();
    } catch (error) {
        console.error(error);
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
        console.error(error);
        res.status(500).json({ error: 'Authorization check failed' });
    }
};
module.exports = {
  isGroupMember,
  isGroupOwner,
  canManageTask,
  canViewTask,
  canParticipateInTask,
  canManageGroupTasks,
};
