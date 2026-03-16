const {PrismaClient} = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

const clampPosition = (position, maxPosition) => {
    if (!Number.isInteger(position)) {
        return null;
    }

    if (position < 0) {
        return 0;
    }

    if (position > maxPosition) {
        return maxPosition;
    }

    return position;
};

const ensureMembership = async (userId, groupId) => {
    const membership = await prisma.groupMember.findUnique({
        where: {
            userId_groupId: {
                userId,
                groupId
            }
        },
        select: {
            id: true
        }
    });

    return Boolean(membership);
};

const getTaskWithAccessCheck = async (taskId, userId) => {
    const task = await prisma.task.findUnique({
        where: {id: taskId},
        select: {
            id: true,
            groupId: true
        }
    });

    if (!task) {
        return {error: {status: 404, message: 'Task not found'}};
    }

    const hasAccess = await ensureMembership(userId, task.groupId);

    if (!hasAccess) {
        return {error: {status: 403, message: 'You do not have permission to access this task'}};
    }

    return {task};
};

const getChecklistWithAccessCheck = async (checklistId, userId) => {
    const checklist = await prisma.checklistItem.findUnique({
        where: {id: checklistId},
        select: {
            id: true,
            taskId: true,
            isCompleted: true,
            task: {
                select: {
                    groupId: true
                }
            }
        }
    });

    if (!checklist) {
        return {error: {status: 404, message: 'Checklist item not found'}};
    }

    const hasAccess = await ensureMembership(userId, checklist.task.groupId);

    if (!hasAccess) {
        return {error: {status: 403, message: 'You do not have permission to modify this checklist item'}};
    }

    return {checklist};
};

exports.createChecklistItem = async (req, res) => {
    try {
        const {taskId, title, position} = req.body;

        if (!taskId || !title) {
            return res.status(400).json({error: 'Task ID and title are required'});
        }

        const taskResult = await getTaskWithAccessCheck(taskId, req.user.userId);

        if (taskResult.error) {
            return res.status(taskResult.error.status).json({error: taskResult.error.message});
        }

        const existingItems = await prisma.checklistItem.findMany({
            where: {taskId},
            orderBy: [
                {position: 'asc'},
                {createdAt: 'asc'}
            ],
            select: {
                id: true
            }
        });

        const targetPosition = Number.isInteger(position)
            ? clampPosition(position, existingItems.length)
            : existingItems.length;

        if (targetPosition === null) {
            return res.status(400).json({error: 'Position must be an integer'});
        }

        let createdItem = null;

        await prisma.$transaction(async (transaction) => {
            const reorderedIds = existingItems.map((item) => item.id);
            reorderedIds.splice(targetPosition, 0, '__new__');

            await Promise.all(reorderedIds
                .filter((itemId) => itemId !== '__new__')
                .map((itemId, index) => transaction.checklistItem.update({
                    where: {id: itemId},
                    data: {position: index >= targetPosition ? index + 1 : index}
                })));

            createdItem = await transaction.checklistItem.create({
                data: {
                    taskId,
                    title,
                    position: targetPosition
                }
            });

            const normalized = await transaction.checklistItem.findMany({
                where: {taskId},
                orderBy: [
                    {position: 'asc'},
                    {createdAt: 'asc'}
                ],
                select: {
                    id: true
                }
            });

            await Promise.all(normalized.map((item, index) => transaction.checklistItem.update({
                where: {id: item.id},
                data: {position: index}
            })));
        });

        res.status(201).json(createdItem);
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.getChecklistByTask = async (req, res) => {
    try {
        const {taskId} = req.params;

        const taskResult = await getTaskWithAccessCheck(taskId, req.user.userId);

        if (taskResult.error) {
            return res.status(taskResult.error.status).json({error: taskResult.error.message});
        }

        const items = await prisma.checklistItem.findMany({
            where: {taskId},
            orderBy: [
                {position: 'asc'},
                {createdAt: 'asc'}
            ]
        });

        res.json(items);
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.updateChecklistItem = async (req, res) => {
    try {
        const {id} = req.params;
        const {title, isCompleted} = req.body;

        const checklistResult = await getChecklistWithAccessCheck(id, req.user.userId);

        if (checklistResult.error) {
            return res.status(checklistResult.error.status).json({error: checklistResult.error.message});
        }

        const updated = await prisma.checklistItem.update({
            where: {id},
            data: {
                title,
                isCompleted
            }
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.toggleChecklistItem = async (req, res) => {
    try {
        const {id} = req.params;

        const checklistResult = await getChecklistWithAccessCheck(id, req.user.userId);

        if (checklistResult.error) {
            return res.status(checklistResult.error.status).json({error: checklistResult.error.message});
        }

        const updated = await prisma.checklistItem.update({
            where: {id},
            data: {
                isCompleted: !checklistResult.checklist.isCompleted
            }
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.updateChecklistPosition = async (req, res) => {
    try {
        const {id} = req.params;
        const {position} = req.body;

        const checklistResult = await getChecklistWithAccessCheck(id, req.user.userId);

        if (checklistResult.error) {
            return res.status(checklistResult.error.status).json({error: checklistResult.error.message});
        }

        const taskId = checklistResult.checklist.taskId;
        const siblings = await prisma.checklistItem.findMany({
            where: {
                taskId,
                NOT: {id}
            },
            orderBy: [
                {position: 'asc'},
                {createdAt: 'asc'}
            ],
            select: {
                id: true
            }
        });

        const nextPosition = clampPosition(position, siblings.length);

        if (nextPosition === null) {
            return res.status(400).json({error: 'Position must be an integer'});
        }

        await prisma.$transaction(async (transaction) => {
            const reorderedIds = siblings.map((item) => item.id);
            reorderedIds.splice(nextPosition, 0, id);

            await Promise.all(reorderedIds.map((itemId, index) => transaction.checklistItem.update({
                where: {id: itemId},
                data: {position: index}
            })));
        });

        const updated = await prisma.checklistItem.findUnique({
            where: {id}
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.reorderChecklistItems = async (req, res) => {
    try {
        const {taskId, itemIds} = req.body;

        if (!taskId) {
            return res.status(400).json({error: 'Task ID is required'});
        }

        if (!Array.isArray(itemIds) || itemIds.length === 0) {
            return res.status(400).json({error: 'itemIds must be a non-empty array'});
        }

        const taskResult = await getTaskWithAccessCheck(taskId, req.user.userId);

        if (taskResult.error) {
            return res.status(taskResult.error.status).json({error: taskResult.error.message});
        }

        const uniqueIds = [...new Set(itemIds)];

        if (uniqueIds.length !== itemIds.length) {
            return res.status(400).json({error: 'itemIds must not contain duplicates'});
        }

        const items = await prisma.checklistItem.findMany({
            where: {
                id: {
                    in: itemIds
                },
                taskId
            },
            select: {
                id: true
            }
        });

        if (items.length !== itemIds.length) {
            return res.status(400).json({error: 'One or more items do not belong to the task'});
        }

        await prisma.$transaction(itemIds.map((itemId, index) => prisma.checklistItem.update({
            where: {id: itemId},
            data: {position: index}
        })));

        const updatedItems = await prisma.checklistItem.findMany({
            where: {taskId},
            orderBy: [
                {position: 'asc'},
                {createdAt: 'asc'}
            ]
        });

        res.json(updatedItems);
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.deleteChecklistItem = async (req, res) => {
    try {
        const {id} = req.params;

        const checklistResult = await getChecklistWithAccessCheck(id, req.user.userId);

        if (checklistResult.error) {
            return res.status(checklistResult.error.status).json({error: checklistResult.error.message});
        }

        const taskId = checklistResult.checklist.taskId;

        await prisma.$transaction(async (transaction) => {
            await transaction.checklistItem.delete({
                where: {id}
            });

            const remaining = await transaction.checklistItem.findMany({
                where: {taskId},
                orderBy: [
                    {position: 'asc'},
                    {createdAt: 'asc'}
                ],
                select: {
                    id: true
                }
            });

            await Promise.all(remaining.map((item, index) => transaction.checklistItem.update({
                where: {id: item.id},
                data: {position: index}
            })));
        });

        res.json({message: 'Checklist item deleted successfully'});
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};
