const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const prisma = new PrismaClient();
const { getTaskAccessFilter, isGroupAdmin } = require('../services/task_permission_service');

const ALLOWED_PRIORITIES = new Set(['Low', 'Medium', 'High', 'Done']);

const normalizeProgress = (value) => {
    if (value === undefined) {
        return undefined;
    }

    if (!Number.isInteger(value) || value < 0 || value > 100) {
        return null;
    }

    return value;
};

const normalizePriority = (value) => {
    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== 'string' || !ALLOWED_PRIORITIES.has(value)) {
        return null;
    }

    return value;
};

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

const getTaskWithAssignee = (taskId) => prisma.task.findUnique({
    where: { id: taskId },
    include: {
        assignee: {
            select: {
                id: true,
                username: true,
                email: true
            }
        },
        creator: {
            select: {
                id: true,
                username: true,
                email: true
            }
        }
    }
});

const isGroupMember = async (userId, groupId) => {
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

const buildParticipantIds = ({ memberIds, assignedTo, leaderId }) => {
    if (memberIds !== undefined && !Array.isArray(memberIds)) {
        return null;
    }

    const participantIds = new Set();

    if (Array.isArray(memberIds)) {
        memberIds.forEach((userId) => {
            if (userId) {
                participantIds.add(userId);
            }
        });
    }

    if (assignedTo) {
        participantIds.add(assignedTo);
    }

    if (leaderId) {
        participantIds.add(leaderId);
    }

    return participantIds;
};

const validateParticipantsInGroup = async (participantIds, groupId) => {
    if (participantIds.size === 0) {
        return true;
    }

    const memberships = await prisma.groupMember.findMany({
        where: {
            groupId,
            userId: {
                in: [...participantIds]
            }
        },
        select: {
            userId: true
        }
    });

    return memberships.length === participantIds.size;
};

const getTaskWithMemberships = (taskId) => prisma.task.findUnique({
    where: { id: taskId },
    include: {
        assignee: {
            select: {
                id: true,
                username: true,
                email: true
            }
        },
        creator: {
            select: {
                id: true,
                username: true,
                email: true
            }
        },
        taskMemberships: {
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
        }
    }
});

exports.createTask = async (req, res) => {
    try {
        const { title, description, groupId, assignedTo, memberIds, leaderId, listId, progress, priority } = req.body;

        if (!groupId) {
            return res.status(400).json({ error: 'Group ID is required' });
        }

        const participantIds = buildParticipantIds({ memberIds, assignedTo, leaderId });

        if (participantIds === null) {
            return res.status(400).json({ error: 'memberIds must be an array' });
        }

        const participantsInGroup = await validateParticipantsInGroup(participantIds, groupId);

        if (!participantsInGroup) {
            return res.status(400).json({ error: 'All task members must be members of the group' });
        }

        let targetList = null;

        if (listId) {
            targetList = await prisma.list.findFirst({
                where: {
                    id: listId,
                    groupId
                },
                select: { id: true }
            });

            if (!targetList) {
                return res.status(400).json({ error: 'List not found in this group' });
            }
        } else {
            targetList = await prisma.list.findFirst({
                where: { groupId },
                orderBy: [
                    { position: 'asc' },
                    { createdAt: 'asc' }
                ],
                select: { id: true }
            });

            if (!targetList) {
                return res.status(400).json({ error: 'Group has no lists' });
            }
        }

        const lastTask = await prisma.task.findFirst({
            where: {
                groupId,
                listId: targetList.id
            },
            orderBy: {
                position: 'desc'
            },
            select: {
                position: true
            }
        });

        const normalizedProgress = normalizeProgress(progress);

        if (normalizedProgress === null) {
            return res.status(400).json({ error: 'Progress must be an integer from 0 to 100' });
        }

        const normalizedPriority = normalizePriority(priority);

        if (normalizedPriority === null) {
            return res.status(400).json({ error: 'Priority must be Low, Medium, High, or Done' });
        }

        const taskProgress = normalizedProgress ?? 0;
        const taskPriority = normalizedPriority ?? 'Low';

        const task = await prisma.$transaction(async (transaction) => {
            const createdTask = await transaction.task.create({
                data: {
                    title,
                    description,
                    groupId,
                    listId: targetList.id,
                    position: (lastTask?.position ?? -1) + 1,
                    assignedTo,
                    createdBy: req.user.userId,
                    progress: taskProgress,
                    priority: taskPriority
                }
            });

            if (participantIds.size > 0) {
                await transaction.taskMember.createMany({
                    data: [...participantIds].map((userId) => ({
                        taskId: createdTask.id,
                        userId,
                        role: userId === leaderId ? 'leader' : 'member'
                    })),
                    skipDuplicates: true
                });
            }

            return transaction.task.findUnique({
                where: { id: createdTask.id },
                include: {
                    assignee: {
                        select: { id: true, username: true, email: true }
                    },
                    creator: {
                        select: { id: true, username: true, email: true }
                    },
                    taskMemberships: {
                        include: {
                            user: {
                                select: { id: true, username: true, email: true }
                            }
                        },
                        orderBy: {
                            createdAt: 'asc'
                        }
                    }
                }
            });
        });
        res.status(201).json(task);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getTasksByGroup = async (req, res) => {
    try {
        const { groupId } = req.params;
        const accessFilter = getTaskAccessFilter({
            userId: req.user.userId,
            membership: req.groupMembership
        });
        const [tasks, lists] = await Promise.all([
            prisma.task.findMany({
                where: {
                    groupId,
                    ...accessFilter
                },
                orderBy: [
                    { position: 'asc' },
                    { createdAt: 'asc' }
                ],
                include: {
                    assignee: {
                        select: {
                            id: true,
                            username: true,
                            email: true
                        }
                    },
                    creator: {
                        select: {
                            id: true,
                            username: true,
                            email: true
                        }
                    },
                    checklistItems: {
                        orderBy: {
                            position: 'asc'
                        }
                    },
                    taskMemberships: {
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    username: true,
                                    email: true,
                                },
                            },
                        },
                        orderBy: {
                            createdAt: 'asc',
                        },
                    },
                }
            }),
            prisma.list.findMany({
                where: { groupId },
                select: {
                    id: true,
                    position: true
                }
            })
        ]);

        const listOrderMap = lists.reduce((accumulator, list) => {
            accumulator[list.id] = list.position;
            return accumulator;
        }, {});

        tasks.sort((firstTask, secondTask) => {
            const listPositionDifference = (listOrderMap[firstTask.listId] ?? Number.MAX_SAFE_INTEGER) - (listOrderMap[secondTask.listId] ?? Number.MAX_SAFE_INTEGER);

            if (listPositionDifference !== 0) {
                return listPositionDifference;
            }

            if (firstTask.position !== secondTask.position) {
                return firstTask.position - secondTask.position;
            }

            return new Date(firstTask.createdAt) - new Date(secondTask.createdAt);
        });

        res.json(tasks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.updateTaskMembers = async (req, res) => {
    try {
        const { id } = req.params;
        const { memberIds, leaderId } = req.body;
        const currentTask = req.task || await prisma.task.findUnique({
            where: { id },
            select: {
                id: true,
                groupId: true
            }
        });

        if (!currentTask) {
            return res.status(404).json({ error: 'Task not found' });
        }

        if (!Array.isArray(memberIds)) {
            return res.status(400).json({ error: 'memberIds must be an array' });
        }

        const participantIds = buildParticipantIds({ memberIds, leaderId });

        if (participantIds === null) {
            return res.status(400).json({ error: 'memberIds must be an array' });
        }

        const participantsInGroup = await validateParticipantsInGroup(participantIds, currentTask.groupId);

        if (!participantsInGroup) {
            return res.status(400).json({ error: 'All task members must be members of the group' });
        }

        await prisma.$transaction(async (transaction) => {
            await transaction.taskMember.deleteMany({
                where: {
                    taskId: id
                }
            });

            if (participantIds.size > 0) {
                await transaction.taskMember.createMany({
                    data: [...participantIds].map((userId) => ({
                        taskId: id,
                        userId,
                        role: userId === leaderId ? 'leader' : 'member'
                    })),
                    skipDuplicates: true
                });
            }
        });

        const task = await getTaskWithMemberships(id);
        res.json(task);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.updateTask = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, assignedTo, dueDate, progress, priority } = req.body;

        const currentTask = req.task || await prisma.task.findUnique({
            where: { id },
            select: {
                id: true,
                groupId: true
            }
        });

        if (!currentTask) {
            return res.status(404).json({ error: 'Task not found' });
        }

        if (assignedTo) {
            const assigneeInGroup = await isGroupMember(assignedTo, currentTask.groupId);

            if (!assigneeInGroup) {
                return res.status(400).json({ error: 'Assignee must be a member of the group' });
            }
        }
        const normalizedProgress = normalizeProgress(progress);

        if (normalizedProgress === null) {
            return res.status(400).json({ error: 'Progress must be an integer from 0 to 100' });
        }

        const normalizedPriority = normalizePriority(priority);

        if (normalizedPriority === null) {
            return res.status(400).json({ error: 'Priority must be Low, Medium, High, or Done' });
        }

        const data = { title, description, assignedTo };

        if (dueDate !== undefined) {
            data.dueDate = dueDate ? new Date(dueDate) : null;
        }

        if (normalizedProgress !== undefined) {
            data.progress = normalizedProgress;
        }

        if (normalizedPriority !== undefined) {
            data.priority = normalizedPriority;
        }

        const task = await prisma.task.update({
            where: { id },
            data,
            include: {
                assignee: {
                    select: {
                        id: true,
                        username: true,
                        email: true
                    }
                },
                creator: {
                    select: {
                        id: true,
                        username: true,
                        email: true
                    }
                }
            }
        });
        res.json(task);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.deleteTask = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.task.delete({ where: { id } });
        res.json({ message: 'Task deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.moveTaskToList = async (req, res) => {
    try {
        const { id } = req.params;
        const { listId } = req.body;

        if (!listId) {
            return res.status(400).json({ error: 'List ID is required' });
        }

        const currentTask = req.task || await prisma.task.findUnique({
            where: { id }
        });

        if (!currentTask) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const targetList = await prisma.list.findUnique({
            where: { id: listId },
            select: {
                id: true,
                groupId: true
            }
        });

        if (!targetList || targetList.groupId !== currentTask.groupId) {
            return res.status(400).json({ error: 'List does not belong to task group' });
        }

        if (currentTask.listId === listId) {
            const task = await getTaskWithAssignee(id);
            return res.json(task);
        }

        const targetLastTask = await prisma.task.findFirst({
            where: {
                groupId: currentTask.groupId,
                listId,
                NOT: {
                    id
                }
            },
            orderBy: {
                position: 'desc'
            },
            select: {
                position: true
            }
        });

        await prisma.$transaction(async (transaction) => {
            const remainingTasks = await transaction.task.findMany({
                where: {
                    groupId: currentTask.groupId,
                    listId: currentTask.listId,
                    NOT: {
                        id
                    }
                },
                orderBy: [
                    { position: 'asc' },
                    { createdAt: 'asc' }
                ],
                select: {
                    id: true
                }
            });

            await Promise.all(remainingTasks.map((task, index) => transaction.task.update({
                where: { id: task.id },
                data: { position: index }
            })));

            await transaction.task.update({
                where: { id },
                data: {
                    listId,
                    position: (targetLastTask?.position ?? -1) + 1
                }
            });
        });

        const task = await getTaskWithAssignee(id);
        res.json(task);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.updateTaskPosition = async (req, res) => {
    try {
        const { id } = req.params;
        const { listId, position } = req.body;
        const currentTask = req.task || await prisma.task.findUnique({
            where: { id }
        });

        if (!currentTask) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const nextListId = listId || currentTask.listId;
        const targetList = await prisma.list.findUnique({
            where: { id: nextListId },
            select: {
                id: true,
                groupId: true
            }
        });

        if (!targetList || targetList.groupId !== currentTask.groupId) {
            return res.status(400).json({ error: 'List does not belong to task group' });
        }

        const targetTasks = await prisma.task.findMany({
            where: {
                groupId: currentTask.groupId,
                listId: nextListId,
                NOT: {
                    id
                }
            },
            orderBy: [
                { position: 'asc' },
                { createdAt: 'asc' }
            ],
            select: {
                id: true
            }
        });

        const nextPosition = clampPosition(position, targetTasks.length);

        if (nextPosition === null) {
            return res.status(400).json({ error: 'Position must be an integer' });
        }

        await prisma.$transaction(async (transaction) => {
            if (currentTask.listId !== nextListId) {
                const sourceTasks = await transaction.task.findMany({
                    where: {
                        groupId: currentTask.groupId,
                        listId: currentTask.listId,
                        NOT: {
                            id
                        }
                    },
                    orderBy: [
                        { position: 'asc' },
                        { createdAt: 'asc' }
                    ],
                    select: {
                        id: true
                    }
                });

                await Promise.all(sourceTasks.map((task, index) => transaction.task.update({
                    where: { id: task.id },
                    data: { position: index }
                })));
            }

            const reorderedTaskIds = targetTasks.map((task) => task.id);
            reorderedTaskIds.splice(nextPosition, 0, id);

            await Promise.all(reorderedTaskIds.map((taskId, index) => transaction.task.update({
                where: { id: taskId },
                data: {
                    listId: nextListId,
                    position: index
                }
            })));
        });

        const task = await getTaskWithAssignee(id);
        res.json(task);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.reorderTasks = async (req, res) => {
    try {
        const { groupId, listId, taskIds } = req.body;

        if (!groupId) {
            return res.status(400).json({ error: 'Group ID is required' });
        }

        if (!listId) {
            return res.status(400).json({ error: 'List ID is required' });
        }

        if (!Array.isArray(taskIds) || taskIds.length === 0) {
            return res.status(400).json({ error: 'taskIds must be a non-empty array' });
        }

        const uniqueTaskIds = [...new Set(taskIds)];

        if (uniqueTaskIds.length !== taskIds.length) {
            return res.status(400).json({ error: 'taskIds must not contain duplicates' });
        }

        const tasks = await prisma.task.findMany({
            where: {
                id: {
                    in: taskIds
                },
                groupId,
                listId
            },
            select: {
                id: true
            }
        });

        if (tasks.length !== taskIds.length) {
            return res.status(400).json({ error: 'One or more tasks do not belong to the group' });
        }

        await prisma.$transaction(taskIds.map((taskId, index) => prisma.task.update({
            where: { id: taskId },
            data: {
                listId,
                position: index
            }
        })));

        const updatedTasks = await prisma.task.findMany({
            where: {
                groupId,
                listId
            },
            orderBy: [
                { position: 'asc' },
                { createdAt: 'asc' }
            ],
            include: {
                assignee: {
                    select: {
                        id: true,
                        username: true,
                        email: true
                    }
                }
            }
        });

        res.json(updatedTasks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.assignLabels = async (req, res) => {
    try {
        const { id } = req.params;
        const { labelIds } = req.body;

        if (!Array.isArray(labelIds)) {
            return res.status(400).json({ error: 'labelIds must be an array' });
        }

        const currentTask = req.task || await prisma.task.findUnique({
            where: { id },
            select: {
                id: true,
                groupId: true
            }
        });

        if (!currentTask) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const uniqueLabelIds = [...new Set(labelIds)];

        if (uniqueLabelIds.length !== labelIds.length) {
            return res.status(400).json({ error: 'labelIds must not contain duplicates' });
        }

        if (uniqueLabelIds.length > 0) {
            const labels = await prisma.label.findMany({
                where: {
                    id: {
                        in: uniqueLabelIds
                    },
                    groupId: currentTask.groupId
                },
                select: {
                    id: true
                }
            });

            if (labels.length !== uniqueLabelIds.length) {
                return res.status(400).json({ error: 'One or more labels do not belong to task group' });
            }
        }

        await prisma.$transaction(async (transaction) => {
            await transaction.taskLabel.deleteMany({
                where: {
                    taskId: id
                }
            });

            if (uniqueLabelIds.length > 0) {
                await transaction.taskLabel.createMany({
                    data: uniqueLabelIds.map((labelId) => ({
                        taskId: id,
                        labelId
                    }))
                });
            }
        });

        const updatedTask = await prisma.task.findUnique({
            where: { id },
            include: {
                assignee: {
                    select: {
                        id: true,
                        username: true,
                        email: true
                    }
                },
                taskLabels: {
                    include: {
                        label: true
                    }
                }
            }
        });

        res.json(updatedTask);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Deadline helpers keep dueDate immutable; overdue status is computed at read time.
const startOfToday = () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
};

const startOfTomorrow = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow;
};

const endOfNext7Days = () => {
    const next7Days = new Date();
    next7Days.setDate(next7Days.getDate() + 7);
    next7Days.setHours(23, 59, 59, 999);
    return next7Days;
};

const isTaskDone = (task) => {
    return task.priority === 'Done' || task.progress === 100;
};

const getDaysOverdue = (task) => {
    if (!task.dueDate || isTaskDone(task)) {
        return 0;
    }

    const dueDate = new Date(task.dueDate);
    const today = startOfToday();

    if (dueDate >= today) {
        return 0;
    }

    const dueDay = new Date(dueDate);
    dueDay.setHours(0, 0, 0, 0);

    return Math.floor((today - dueDay) / (1000 * 60 * 60 * 24));
};

const getDeadlineBucket = (task) => {
    if (!task.dueDate) {
        return 'noDue';
    }

    const dueDate = new Date(task.dueDate);
    const today = startOfToday();
    const tomorrow = startOfTomorrow();
    const next7DaysEnd = endOfNext7Days();

    if (dueDate < today && !isTaskDone(task)) {
        return 'overdue';
    }

    if (dueDate >= today && dueDate < tomorrow) {
        return 'today';
    }

    if (dueDate >= tomorrow && dueDate <= next7DaysEnd) {
        return 'week';
    }

    return 'later';
};

const withDeadlineMeta = (task) => {
    const daysOverdue = getDaysOverdue(task);

    return {
        ...task,
        deadlineBucket: getDeadlineBucket(task),
        isOverdue: daysOverdue > 0,
        daysOverdue
    };
};
const taskDeadlineInclude = {
    assignee: {
        select: {
            id: true,
            username: true,
            email: true
        }
    },
    creator: {
        select: {
            id: true,
            username: true,
            email: true
        }
    },
    taskMemberships: {
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
        orderBy: {
            position: 'asc'
        }
    }
};
// checklist summary
const withChecklistSummary = (task) => {
    const checklistItems = task.checklistItems ?? [];
    const completed = checklistItems.filter((item) => item.isCompleted).length;
    const total = checklistItems.length;

    return {
        ...task,
        checklistSummary: {
            completed,
            total,
            percent: total > 0 ? Math.round((completed / total) * 100) : 0
        }
    };
};
const withDeadlineTaskMeta = (task) => {
    return withDeadlineMeta(withChecklistSummary(task));
};

const toDateKey = (date) => {
    const value = new Date(date);
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
};

const getCurrentMonthDateKeys = () => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const dateKeys = [];

    for (let date = new Date(firstDay); date <= lastDay; date.setDate(date.getDate() + 1)) {
        dateKeys.push(toDateKey(date));
    }

    return dateKeys;
};

const buildDeadlineWhere = ({groupId, userId, membership, query}) => {
    const {
        scope = 'all',
        assigneeId,
        leaderId,
        priority,
        search
    } = query;
    const isAdmin = isGroupAdmin(membership);
    const andFilters = [];

    if (!isAdmin || scope === 'mine') {
        andFilters.push({
            taskMemberships: {
                some: {
                    userId
                }
            }
        });
    }

    if (priority) {
        andFilters.push({
            priority
        });
    }

    if (search) {
        andFilters.push({
            OR: [
                {
                    title: {
                        contains: search,
                        mode: 'insensitive'
                    }
                },
                {
                    description: {
                        contains: search,
                        mode: 'insensitive'
                    }
                }
            ]
        });
    }

    if (assigneeId) {
        andFilters.push({
            taskMemberships: {
                some: {
                    userId: assigneeId
                }
            }
        });
    }

    if (leaderId) {
        andFilters.push({
            taskMemberships: {
                some: {
                    userId: leaderId,
                    role: 'leader'
                }
            }
        });
    }

    return {
        groupId,
        ...(andFilters.length > 0 ? {AND: andFilters} : {})
    };
};

exports.getDeadlineTasks = async (req, res) => {
    try {
        const { groupId } = req.params;
        const { bucket = 'all' } = req.query;
        const membership = req.groupMembership;
        const where = buildDeadlineWhere({
            groupId,
            userId: req.user.userId,
            membership,
            query: req.query
        });

        const tasks = await prisma.task.findMany({
            where,
            include: taskDeadlineInclude,
            orderBy: [
                { dueDate: 'asc' },
                { createdAt: 'asc' }
            ]
        });

        const enrichedTasks = tasks.map(withDeadlineTaskMeta);
        const filteredTasks = bucket === 'all'
            ? enrichedTasks
            : enrichedTasks.filter((task) => task.deadlineBucket === bucket);

        res.json(filteredTasks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getDeadlineSummary = async (req, res) => {
    try {
        const { groupId } = req.params;
        const membership = req.groupMembership;
        const isAdmin = isGroupAdmin(membership);
        const where = buildDeadlineWhere({
            groupId,
            userId: req.user.userId,
            membership,
            query: req.query
        });

        const tasks = await prisma.task.findMany({
            where,
            include: taskDeadlineInclude,
            orderBy: [
                { dueDate: 'asc' },
                { createdAt: 'asc' }
            ]
        });
        const enrichedTasks = tasks.map(withDeadlineTaskMeta);
        const bucketCounts = {
            overdue: 0,
            today: 0,
            week: 0,
            later: 0,
            noDue: 0
        };
        const statusCounts = {
            active: 0,
            done: 0
        };
        const calendarDayMap = getCurrentMonthDateKeys().reduce((accumulator, dateKey) => {
            accumulator[dateKey] = {
                date: dateKey,
                total: 0,
                overdue: 0,
                done: 0
            };
            return accumulator;
        }, {});
        const workloadMap = new Map();

        enrichedTasks.forEach((task) => {
            bucketCounts[task.deadlineBucket] += 1;

            if (isTaskDone(task)) {
                statusCounts.done += 1;
            } else {
                statusCounts.active += 1;
            }

            if (task.dueDate) {
                const dueDateKey = toDateKey(task.dueDate);
                const calendarDay = calendarDayMap[dueDateKey];

                if (calendarDay) {
                    calendarDay.total += 1;

                    if (task.isOverdue) {
                        calendarDay.overdue += 1;
                    }

                    if (isTaskDone(task)) {
                        calendarDay.done += 1;
                    }
                }
            }

            if (isAdmin) {
                (task.taskMemberships ?? []).forEach((membershipItem) => {
                    const user = membershipItem.user;

                    if (!user) {
                        return;
                    }

                    if (!workloadMap.has(user.id)) {
                        workloadMap.set(user.id, {
                            userId: user.id,
                            username: user.username,
                            email: user.email,
                            total: 0,
                            overdue: 0,
                            dueThisWeek: 0,
                            active: 0,
                            done: 0
                        });
                    }

                    const workload = workloadMap.get(user.id);
                    workload.total += 1;

                    if (task.deadlineBucket === 'overdue') {
                        workload.overdue += 1;
                    }

                    if (task.deadlineBucket === 'today' || task.deadlineBucket === 'week') {
                        workload.dueThisWeek += 1;
                    }

                    if (isTaskDone(task)) {
                        workload.done += 1;
                    } else {
                        workload.active += 1;
                    }
                });
            }
        });

        res.json({
            bucketCounts,
            calendarDays: Object.values(calendarDayMap),
            statusCounts,
            workloadByMember: isAdmin
                ? [...workloadMap.values()].sort((first, second) => second.total - first.total || first.username.localeCompare(second.username))
                : []
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
