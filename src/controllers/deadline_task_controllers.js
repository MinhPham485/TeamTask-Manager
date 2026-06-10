const {PrismaClient} = require('@prisma/client');
const {buildDeadlineSummary, withDeadlineTaskMeta} = require('../services/deadline_service');
const {getGroupMembership, isGroupAdmin} = require('../services/task_permission_service');

const prisma = new PrismaClient();
const ALLOWED_PRIORITIES = new Set(['Low', 'Medium', 'High', 'Done']);

const deadlineTaskInclude = {
    creator: {
        select: {
            id: true,
            username: true,
            email: true
        }
    },
    memberships: {
        include: {
            user: {
                select: {
                    id: true,
                    username: true,
                    email: true
                }
            }
        },
        orderBy: {
            createdAt: 'asc'
        }
    },
    checklistItems: {
        orderBy: [
            {position: 'asc'},
            {createdAt: 'asc'}
        ]
    }
};

const normalizePriority = (value) => {
    if (value === undefined) {
        return 'Low';
    }

    if (typeof value !== 'string' || !ALLOWED_PRIORITIES.has(value)) {
        return null;
    }

    return value;
};

const normalizeProgress = (value) => {
    if (value === undefined) {
        return 0;
    }

    if (!Number.isInteger(value) || value < 0 || value > 100) {
        return null;
    }

    return value;
};

const normalizeDueDate = (value) => {
    if (!value) {
        return null;
    }

    const dueDate = new Date(value);

    if (Number.isNaN(dueDate.getTime())) {
        return undefined;
    }

    return dueDate;
};

const toDeadlineTaskResponse = (task, viewerAccess = {}) => {
    const {memberships, checklistItems, ...rest} = task;

    return {
        ...rest,
        listId: 'deadline',
        position: 0,
        assignee: null,
        viewerCanOpen: Boolean(viewerAccess.canView),
        viewerCanManage: Boolean(viewerAccess.canManage),
        checklistItems: checklistItems ?? [],
        taskMemberships: (memberships ?? []).map((membership) => ({
            id: membership.id,
            taskId: task.id,
            userId: membership.userId,
            role: membership.role,
            completedAt: membership.completedAt,
            createdAt: membership.createdAt,
            user: membership.user
        }))
    };
};

const getViewerAccessForTask = ({task, userId, membership}) => {
    const taskMembership = (task.memberships ?? []).find((member) => member.userId === userId) ?? null;
    const admin = isGroupAdmin(membership);
    const leader = taskMembership?.role === 'leader';

    return {
        canView: admin || Boolean(taskMembership),
        canManage: admin || leader
    };
};

const toDeadlineTaskListResponse = ({task, userId, membership}) => {
    const access = getViewerAccessForTask({task, userId, membership});
    const response = toDeadlineTaskResponse(task, access);

    if (access.canView) {
        return response;
    }

    return {
        ...response,
        description: null,
        creator: null,
        checklistItems: [],
        taskMemberships: [],
        checklistSummary: {
            completed: 0,
            total: 0,
            percent: 0
        }
    };
};

const normalizeChecklistPositions = async (transaction, deadlineTaskId) => {
    const items = await transaction.deadlineChecklistItem.findMany({
        where: {deadlineTaskId},
        orderBy: [
            {position: 'asc'},
            {createdAt: 'asc'}
        ],
        select: {
            id: true
        }
    });

    await Promise.all(items.map((item, index) => transaction.deadlineChecklistItem.update({
        where: {id: item.id},
        data: {position: index}
    })));
};

const buildDeadlineTaskWhere = ({groupId}) => {
    return {groupId};
};

const getDeadlineTaskAccess = async (taskId, userId) => {
    const task = await prisma.deadlineTask.findUnique({
        where: {id: taskId},
        include: {
            memberships: {
                where: {userId},
                select: {
                    id: true,
                    role: true,
                    userId: true
                }
            }
        }
    });

    if (!task) {
        return {error: {status: 404, message: 'Deadline task not found'}};
    }

    const membership = await getGroupMembership(userId, task.groupId);

    if (!membership) {
        return {error: {status: 403, message: 'You do not have permission to access this deadline task'}};
    }

    const taskMembership = task.memberships[0] ?? null;
    const admin = isGroupAdmin(membership);
    const leader = taskMembership?.role === 'leader';

    return {
        task,
        membership,
        access: {
            canView: admin || Boolean(taskMembership),
            canManage: admin || leader
        }
    };
};

exports.getDeadlineTasksByGroup = async (req, res) => {
    try {
        const {groupId} = req.params;
        const where = buildDeadlineTaskWhere({
            groupId
        });

        const tasks = await prisma.deadlineTask.findMany({
            where,
            include: deadlineTaskInclude,
            orderBy: [
                {dueDate: 'asc'},
                {createdAt: 'asc'}
            ]
        });

        res.json(tasks
            .map((task) => toDeadlineTaskListResponse({
                task,
                userId: req.user.userId,
                membership: req.groupMembership
            }))
            .map(withDeadlineTaskMeta));
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.getDeadlineTaskSummary = async (req, res) => {
    try {
        const {groupId} = req.params;
        const isAdmin = isGroupAdmin(req.groupMembership);
        const where = buildDeadlineTaskWhere({
            groupId
        });
        const tasks = await prisma.deadlineTask.findMany({
            where,
            include: deadlineTaskInclude,
            orderBy: [
                {dueDate: 'asc'},
                {createdAt: 'asc'}
            ]
        });
        const enrichedTasks = tasks.map((task) => toDeadlineTaskResponse(task, {
            canView: true,
            canManage: isAdmin
        })).map(withDeadlineTaskMeta);

        res.json(buildDeadlineSummary({
            tasks: enrichedTasks,
            isAdmin
        }));
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.createDeadlineTask = async (req, res) => {
    try {
        const {title, description, groupId, dueDate, progress, priority} = req.body || {};

        if (!groupId) {
            return res.status(400).json({error: 'Group ID is required'});
        }

        if (!title?.trim()) {
            return res.status(400).json({error: 'Task title is required'});
        }

        const normalizedDueDate = normalizeDueDate(dueDate);

        if (normalizedDueDate === undefined) {
            return res.status(400).json({error: 'Due date is invalid'});
        }

        const normalizedProgress = normalizeProgress(progress);

        if (normalizedProgress === null) {
            return res.status(400).json({error: 'Progress must be an integer from 0 to 100'});
        }

        const normalizedPriority = normalizePriority(priority);

        if (normalizedPriority === null) {
            return res.status(400).json({error: 'Priority must be Low, Medium, High, or Done'});
        }

        const createdTask = await prisma.$transaction(async (transaction) => {
            const task = await transaction.deadlineTask.create({
                data: {
                    title: title.trim(),
                    description,
                    groupId,
                    dueDate: normalizedDueDate,
                    progress: normalizedProgress,
                    priority: normalizedPriority,
                    createdBy: req.user.userId
                }
            });

            await transaction.deadlineTaskMember.create({
                data: {
                    deadlineTaskId: task.id,
                    userId: req.user.userId,
                    role: 'leader'
                }
            });

            return transaction.deadlineTask.findUnique({
                where: {id: task.id},
                include: deadlineTaskInclude
            });
        });

        res.status(201).json(withDeadlineTaskMeta(toDeadlineTaskResponse(createdTask, {
            canView: true,
            canManage: true
        })));
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.deleteDeadlineTask = async (req, res) => {
    try {
        const {id} = req.params;
        const accessResult = await getDeadlineTaskAccess(id, req.user.userId);

        if (accessResult.error) {
            return res.status(accessResult.error.status).json({error: accessResult.error.message});
        }

        if (!accessResult.access.canManage) {
            return res.status(403).json({error: 'Only deadline task leaders or group managers can delete this task'});
        }

        await prisma.deadlineTask.delete({
            where: {id}
        });

        res.json({message: 'Deadline task deleted successfully'});
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.getDeadlineTask = async (req, res) => {
    try {
        const {id} = req.params;
        const accessResult = await getDeadlineTaskAccess(id, req.user.userId);

        if (accessResult.error) {
            return res.status(accessResult.error.status).json({error: accessResult.error.message});
        }

        if (!accessResult.access.canView) {
            return res.status(403).json({error: 'You do not have permission to access this deadline task'});
        }

        const task = await prisma.deadlineTask.findUnique({
            where: {id},
            include: deadlineTaskInclude
        });

        res.json(withDeadlineTaskMeta(toDeadlineTaskResponse(task, accessResult.access)));
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.createDeadlineChecklistItem = async (req, res) => {
    try {
        const {id} = req.params;
        const {title} = req.body || {};
        const accessResult = await getDeadlineTaskAccess(id, req.user.userId);

        if (accessResult.error) {
            return res.status(accessResult.error.status).json({error: accessResult.error.message});
        }

        if (!accessResult.access.canView) {
            return res.status(403).json({error: 'You do not have permission to edit this deadline task'});
        }

        if (!title?.trim()) {
            return res.status(400).json({error: 'Checklist item title is required'});
        }

        const lastItem = await prisma.deadlineChecklistItem.findFirst({
            where: {deadlineTaskId: id},
            orderBy: {position: 'desc'},
            select: {position: true}
        });

        const item = await prisma.deadlineChecklistItem.create({
            data: {
                deadlineTaskId: id,
                title: title.trim(),
                position: (lastItem?.position ?? -1) + 1,
                createdBy: req.user.userId
            }
        });

        res.status(201).json(item);
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.addDeadlineTaskMember = async (req, res) => {
    try {
        const {id} = req.params;
        const {userId, role} = req.body || {};
        const accessResult = await getDeadlineTaskAccess(id, req.user.userId);

        if (accessResult.error) {
            return res.status(accessResult.error.status).json({error: accessResult.error.message});
        }

        if (!accessResult.access.canManage) {
            return res.status(403).json({error: 'Only deadline task leaders or group managers can add task members'});
        }

        if (!userId) {
            return res.status(400).json({error: 'User ID is required'});
        }

        const normalizedRole = role === 'leader' ? 'leader' : 'member';
        const groupMembership = await getGroupMembership(userId, accessResult.task.groupId);

        if (!groupMembership) {
            return res.status(400).json({error: 'User is not a member of this group'});
        }

        await prisma.deadlineTaskMember.upsert({
            where: {
                deadlineTaskId_userId: {
                    deadlineTaskId: id,
                    userId
                }
            },
            update: {
                role: normalizedRole
            },
            create: {
                deadlineTaskId: id,
                userId,
                role: normalizedRole
            }
        });

        const task = await prisma.deadlineTask.findUnique({
            where: {id},
            include: deadlineTaskInclude
        });

        res.json(withDeadlineTaskMeta(toDeadlineTaskResponse(task, accessResult.access)));
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.toggleDeadlineChecklistItem = async (req, res) => {
    try {
        const {id, itemId} = req.params;
        const accessResult = await getDeadlineTaskAccess(id, req.user.userId);

        if (accessResult.error) {
            return res.status(accessResult.error.status).json({error: accessResult.error.message});
        }

        if (!accessResult.access.canView) {
            return res.status(403).json({error: 'You do not have permission to edit this deadline task'});
        }

        const item = await prisma.deadlineChecklistItem.findFirst({
            where: {
                id: itemId,
                deadlineTaskId: id
            }
        });

        if (!item) {
            return res.status(404).json({error: 'Checklist item not found'});
        }

        const updated = await prisma.deadlineChecklistItem.update({
            where: {id: itemId},
            data: {
                isCompleted: !item.isCompleted
            }
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.deleteDeadlineChecklistItem = async (req, res) => {
    try {
        const {id, itemId} = req.params;
        const accessResult = await getDeadlineTaskAccess(id, req.user.userId);

        if (accessResult.error) {
            return res.status(accessResult.error.status).json({error: accessResult.error.message});
        }

        if (!accessResult.access.canView) {
            return res.status(403).json({error: 'You do not have permission to edit this deadline task'});
        }

        const item = await prisma.deadlineChecklistItem.findFirst({
            where: {
                id: itemId,
                deadlineTaskId: id
            }
        });

        if (!item) {
            return res.status(404).json({error: 'Checklist item not found'});
        }

        await prisma.$transaction(async (transaction) => {
            await transaction.deadlineChecklistItem.delete({
                where: {id: itemId}
            });

            await normalizeChecklistPositions(transaction, id);
        });

        res.json({message: 'Checklist item deleted successfully'});
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};
