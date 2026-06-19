const {PrismaClient} = require('@prisma/client');
const {buildDeadlineSummary, buildMyDeadlineSummary, withDeadlineTaskMeta} = require('../services/deadline_service');
const {createDeadlineTaskAssignedNotification} = require('../services/notification_service');
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
    checklistSections: {
        orderBy: [
            {position: 'asc'},
            {createdAt: 'asc'}
        ],
        include: {
            items: {
                orderBy: [
                    {position: 'asc'},
                    {createdAt: 'asc'}
                ]
            }
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
    const {memberships, checklistItems, checklistSections, ...rest} = task;
    const sectionAccess = Boolean(viewerAccess.canManageSections);
    const itemAccess = Boolean(viewerAccess.canManageItems);

    return {
        ...rest,
        listId: 'deadline',
        position: 0,
        assignee: null,
        viewerCanOpen: Boolean(viewerAccess.canView),
        viewerCanManage: Boolean(viewerAccess.canManage),
        viewerCanManageSections: sectionAccess,
        viewerCanManageItems: itemAccess,
        checklistItems: checklistItems ?? [],
        checklistSections: (checklistSections ?? []).map((section) => ({
            ...section,
            viewerCanManage: sectionAccess,
            items: (section.items ?? []).map((item) => ({
                ...item,
                viewerCanManage: itemAccess
            }))
        })),
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
        canManage: admin || leader,
        canManageSections: admin || leader,
        canManageItems: admin || Boolean(taskMembership)
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
        checklistSections: [],
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

const normalizeSectionPositions = async (transaction, deadlineTaskId) => {
    const sections = await transaction.deadlineChecklistSection.findMany({
        where: {deadlineTaskId},
        orderBy: [
            {position: 'asc'},
            {createdAt: 'asc'}
        ],
        select: {
            id: true
        }
    });

    await Promise.all(sections.map((section, index) => transaction.deadlineChecklistSection.update({
        where: {id: section.id},
        data: {position: index}
    })));
};

const normalizeSectionItemPositions = async (transaction, sectionId) => {
    const items = await transaction.deadlineChecklistItem.findMany({
        where: {sectionId},
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

const getOrCreateDefaultDeadlineSection = async (transaction, deadlineTaskId, userId) => {
    const existingSection = await transaction.deadlineChecklistSection.findFirst({
        where: {deadlineTaskId},
        orderBy: [
            {position: 'asc'},
            {createdAt: 'asc'}
        ]
    });

    if (existingSection) {
        return existingSection;
    }

    return transaction.deadlineChecklistSection.create({
        data: {
            deadlineTaskId,
            title: 'General',
            position: 0,
            createdBy: userId
        }
    });
};

const getDeadlineSection = async (sectionId) => {
    return prisma.deadlineChecklistSection.findUnique({
        where: {id: sectionId},
        select: {
            id: true,
            deadlineTaskId: true,
            position: true
        }
    });
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
            canManage: admin || leader,
            canManageSections: admin || leader,
            canManageItems: admin || Boolean(taskMembership)
        }
    };
};

const getDeadlineSectionAccess = async (deadlineTaskId, sectionId, userId) => {
    const accessResult = await getDeadlineTaskAccess(deadlineTaskId, userId);

    if (accessResult.error) {
        return accessResult;
    }

    const section = await getDeadlineSection(sectionId);

    if (!section || section.deadlineTaskId !== deadlineTaskId) {
        return {error: {status: 404, message: 'Checklist section not found'}};
    }

    return {
        section,
        access: accessResult.access
    };
};

const getDeadlineItemWithAccess = async (deadlineTaskId, itemId, userId) => {
    const accessResult = await getDeadlineTaskAccess(deadlineTaskId, userId);

    if (accessResult.error) {
        return accessResult;
    }

    const item = await prisma.deadlineChecklistItem.findFirst({
        where: {
            id: itemId,
            deadlineTaskId
        }
    });

    if (!item) {
        return {error: {status: 404, message: 'Checklist item not found'}};
    }

    return {
        item,
        access: accessResult.access
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

exports.getMyDeadlineTaskSummary = async (req, res) => {
    try {
        const tasks = await prisma.deadlineTask.findMany({
            where: {
                memberships: {
                    some: {
                        userId: req.user.userId
                    }
                }
            },
            include: deadlineTaskInclude,
            orderBy: [
                {dueDate: 'asc'},
                {createdAt: 'asc'}
            ]
        });

        const enrichedTasks = tasks
            .map((task) => toDeadlineTaskResponse(task, {
                canView: true,
                canManage: false
            }))
            .map(withDeadlineTaskMeta);

        res.json(buildMyDeadlineSummary({tasks: enrichedTasks}));
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

exports.createDeadlineChecklistSection = async (req, res) => {
    try {
        const {id} = req.params;
        const {title} = req.body || {};
        const accessResult = await getDeadlineTaskAccess(id, req.user.userId);

        if (accessResult.error) {
            return res.status(accessResult.error.status).json({error: accessResult.error.message});
        }

        if (!accessResult.access.canManageSections) {
            return res.status(403).json({error: 'Only deadline task leaders can manage checklist sections'});
        }

        if (!title?.trim()) {
            return res.status(400).json({error: 'Checklist section title is required'});
        }

        const lastSection = await prisma.deadlineChecklistSection.findFirst({
            where: {deadlineTaskId: id},
            orderBy: {position: 'desc'},
            select: {position: true}
        });

        const section = await prisma.deadlineChecklistSection.create({
            data: {
                deadlineTaskId: id,
                title: title.trim(),
                position: (lastSection?.position ?? -1) + 1,
                createdBy: req.user.userId
            },
            include: {
                items: {
                    orderBy: [
                        {position: 'asc'},
                        {createdAt: 'asc'}
                    ]
                }
            }
        });

        res.status(201).json({
            ...section,
            viewerCanManage: true
        });
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.updateDeadlineChecklistSection = async (req, res) => {
    try {
        const {id, sectionId} = req.params;
        const {title} = req.body || {};
        const sectionResult = await getDeadlineSectionAccess(id, sectionId, req.user.userId);

        if (sectionResult.error) {
            return res.status(sectionResult.error.status).json({error: sectionResult.error.message});
        }

        if (!sectionResult.access.canManageSections) {
            return res.status(403).json({error: 'Only deadline task leaders can manage checklist sections'});
        }

        if (!title?.trim()) {
            return res.status(400).json({error: 'Checklist section title is required'});
        }

        const updated = await prisma.deadlineChecklistSection.update({
            where: {id: sectionId},
            data: {
                title: title.trim()
            },
            include: {
                items: {
                    orderBy: [
                        {position: 'asc'},
                        {createdAt: 'asc'}
                    ]
                }
            }
        });

        res.json({
            ...updated,
            viewerCanManage: true
        });
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.deleteDeadlineChecklistSection = async (req, res) => {
    try {
        const {id, sectionId} = req.params;
        const sectionResult = await getDeadlineSectionAccess(id, sectionId, req.user.userId);

        if (sectionResult.error) {
            return res.status(sectionResult.error.status).json({error: sectionResult.error.message});
        }

        if (!sectionResult.access.canManageSections) {
            return res.status(403).json({error: 'Only deadline task leaders can manage checklist sections'});
        }

        await prisma.$transaction(async (transaction) => {
            await transaction.deadlineChecklistSection.delete({
                where: {id: sectionId}
            });

            await normalizeSectionPositions(transaction, id);
        });

        res.json({message: 'Checklist section deleted successfully'});
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.createDeadlineChecklistItem = async (req, res) => {
    try {
        const {id} = req.params;
        const {title, sectionId} = req.body || {};
        const accessResult = await getDeadlineTaskAccess(id, req.user.userId);

        if (accessResult.error) {
            return res.status(accessResult.error.status).json({error: accessResult.error.message});
        }

        if (!accessResult.access.canManageItems) {
            return res.status(403).json({error: 'Only deadline task members can edit checklist items'});
        }

        if (!title?.trim()) {
            return res.status(400).json({error: 'Checklist item title is required'});
        }

        let item = null;

        await prisma.$transaction(async (transaction) => {
            const targetSection = sectionId
                ? await transaction.deadlineChecklistSection.findUnique({
                    where: {id: sectionId},
                    select: {
                        id: true,
                        deadlineTaskId: true
                    }
                })
                : await getOrCreateDefaultDeadlineSection(transaction, id, req.user.userId);

            if (!targetSection || targetSection.deadlineTaskId !== id) {
                throw new Error('Checklist section not found');
            }

            const lastItem = await transaction.deadlineChecklistItem.findFirst({
                where: {sectionId: targetSection.id},
                orderBy: {position: 'desc'},
                select: {position: true}
            });

            item = await transaction.deadlineChecklistItem.create({
                data: {
                    deadlineTaskId: id,
                    sectionId: targetSection.id,
                    title: title.trim(),
                    position: (lastItem?.position ?? -1) + 1,
                    createdBy: req.user.userId
                }
            });
        });

        res.status(201).json({
            ...item,
            viewerCanManage: true
        });
    } catch (error) {
        const status = error.message === 'Checklist section not found' ? 404 : 500;
        res.status(status).json({error: error.message});
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

        const existingMembership = (accessResult.task.memberships ?? []).find((membership) => membership.userId === userId);

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

        if (!existingMembership && userId !== req.user.userId) {
            await createDeadlineTaskAssignedNotification({
                recipientId: userId,
                actorId: req.user.userId,
                deadlineTaskId: id,
                groupId: accessResult.task.groupId,
                taskTitle: accessResult.task.title
            });
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

exports.toggleDeadlineChecklistItem = async (req, res) => {
    try {
        const {id, itemId} = req.params;
        const itemResult = await getDeadlineItemWithAccess(id, itemId, req.user.userId);

        if (itemResult.error) {
            return res.status(itemResult.error.status).json({error: itemResult.error.message});
        }

        if (!itemResult.access.canManageItems) {
            return res.status(403).json({error: 'Only deadline task members can edit checklist items'});
        }

        const updated = await prisma.deadlineChecklistItem.update({
            where: {id: itemId},
            data: {
                isCompleted: !itemResult.item.isCompleted
            }
        });

        res.json({
            ...updated,
            viewerCanManage: true
        });
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.updateDeadlineChecklistItem = async (req, res) => {
    try {
        const {id, itemId} = req.params;
        const {title} = req.body || {};
        const itemResult = await getDeadlineItemWithAccess(id, itemId, req.user.userId);

        if (itemResult.error) {
            return res.status(itemResult.error.status).json({error: itemResult.error.message});
        }

        if (!itemResult.access.canManageItems) {
            return res.status(403).json({error: 'Only deadline task members can edit checklist items'});
        }

        if (!title?.trim()) {
            return res.status(400).json({error: 'Checklist item title is required'});
        }

        const updated = await prisma.deadlineChecklistItem.update({
            where: {id: itemId},
            data: {
                title: title.trim()
            }
        });

        res.json({
            ...updated,
            viewerCanManage: true
        });
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.deleteDeadlineChecklistItem = async (req, res) => {
    try {
        const {id, itemId} = req.params;
        const itemResult = await getDeadlineItemWithAccess(id, itemId, req.user.userId);

        if (itemResult.error) {
            return res.status(itemResult.error.status).json({error: itemResult.error.message});
        }

        if (!itemResult.access.canManageItems) {
            return res.status(403).json({error: 'Only deadline task members can edit checklist items'});
        }

        await prisma.$transaction(async (transaction) => {
            await transaction.deadlineChecklistItem.delete({
                where: {id: itemId}
            });

            await normalizeSectionItemPositions(transaction, itemResult.item.sectionId);
            await normalizeChecklistPositions(transaction, id);
        });

        res.json({message: 'Checklist item deleted successfully'});
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};
