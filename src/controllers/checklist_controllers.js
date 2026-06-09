const { PrismaClient } = require('@prisma/client');
require('dotenv').config();
const { getTaskAccess } = require('../services/task_permission_service');

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


const getSectionWithAccess = async (sectionId, userId) => {
    const section = await prisma.checklistSection.findUnique({
        where: { id: sectionId },
        select: {
            id: true,
            taskId: true,
            task: {
                select: {
                    groupId: true
                }
            }
        }
    });

    if (!section) {
        return { error: { status: 404, message: 'Checklist section not found' } };
    }

    const taskResult = await getTaskAccess(section.taskId, userId);

    if (taskResult.error) {
        return taskResult;
    }

    return {
        section,
        access: taskResult.access
    };
};

const getItemWithAccess = async (itemId, userId) => {
    const item = await prisma.checklistItem.findUnique({
        where: { id: itemId },
        select: {
            id: true,
            taskId: true,
            sectionId: true,
            isCompleted: true
        }
    });

    if (!item) {
        return { error: { status: 404, message: 'Checklist item not found' } };
    }

    const taskResult = await getTaskAccess(item.taskId, userId);

    if (taskResult.error) {
        return taskResult;
    }

    return {
        item,
        access: taskResult.access
    };
};

const normalizeSectionPositions = async (transaction, taskId) => {
    const sections = await transaction.checklistSection.findMany({
        where: { taskId },
        orderBy: [
            { position: 'asc' },
            { createdAt: 'asc' }
        ],
        select: {
            id: true
        }
    });

    await Promise.all(sections.map((section, index) => transaction.checklistSection.update({
        where: { id: section.id },
        data: { position: index }
    })));
};

const normalizeItemPositions = async (transaction, sectionId) => {
    const items = await transaction.checklistItem.findMany({
        where: { sectionId },
        orderBy: [
            { position: 'asc' },
            { createdAt: 'asc' }
        ],
        select: {
            id: true
        }
    });

    await Promise.all(items.map((item, index) => transaction.checklistItem.update({
        where: { id: item.id },
        data: { position: index }
    })));
};

const getOrCreateDefaultSection = async (transaction, taskId, userId) => {
    const existingSection = await transaction.checklistSection.findFirst({
        where: { taskId },
        orderBy: [
            { position: 'asc' },
            { createdAt: 'asc' }
        ]
    });

    if (existingSection) {
        return existingSection;
    }

    return transaction.checklistSection.create({
        data: {
            taskId,
            title: 'General',
            position: 0,
            createdBy: userId
        }
    });
};

exports.createChecklistSection = async (req, res) => {
    try {
        const { taskId, title, position } = req.body;

        if (!taskId || !title?.trim()) {
            return res.status(400).json({ error: 'Task ID and title are required' });
        }

        const taskResult = await getTaskAccess(taskId, req.user.userId);

        if (taskResult.error) {
            return res.status(taskResult.error.status).json({ error: taskResult.error.message });
        }

        if (!taskResult.access.canManageSections) {
            return res.status(403).json({ error: 'Only task leaders or group managers can manage checklist sections' });
        }

        const existingSections = await prisma.checklistSection.findMany({
            where: { taskId },
            orderBy: [
                { position: 'asc' },
                { createdAt: 'asc' }
            ],
            select: {
                id: true
            }
        });
        const targetPosition = Number.isInteger(position)
            ? clampPosition(position, existingSections.length)
            : existingSections.length;

        if (targetPosition === null) {
            return res.status(400).json({ error: 'Position must be an integer' });
        }

        let createdSection = null;

        await prisma.$transaction(async (transaction) => {
            const reorderedIds = existingSections.map((section) => section.id);
            reorderedIds.splice(targetPosition, 0, '__new__');

            await Promise.all(reorderedIds
                .filter((sectionId) => sectionId !== '__new__')
                .map((sectionId, index) => transaction.checklistSection.update({
                    where: { id: sectionId },
                    data: { position: index >= targetPosition ? index + 1 : index }
                })));

            createdSection = await transaction.checklistSection.create({
                data: {
                    taskId,
                    title: title.trim(),
                    position: targetPosition,
                    createdBy: req.user.userId
                },
                include: {
                    items: {
                        orderBy: [
                            { position: 'asc' },
                            { createdAt: 'asc' }
                        ]
                    }
                }
            });

            await normalizeSectionPositions(transaction, taskId);
        });

        res.status(201).json(createdSection);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getChecklistSectionsByTask = async (req, res) => {
    try {
        const { taskId } = req.params;
        const taskResult = await getTaskAccess(taskId, req.user.userId);

        if (taskResult.error) {
            return res.status(taskResult.error.status).json({ error: taskResult.error.message });
        }

        const sections = await prisma.checklistSection.findMany({
            where: { taskId },
            orderBy: [
                { position: 'asc' },
                { createdAt: 'asc' }
            ],
            include: {
                items: {
                    orderBy: [
                        { position: 'asc' },
                        { createdAt: 'asc' }
                    ]
                }
            }
        });

        res.json(sections);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.updateChecklistSection = async (req, res) => {
    try {
        const { id } = req.params;
        const { title } = req.body;
        const sectionResult = await getSectionWithAccess(id, req.user.userId);

        if (sectionResult.error) {
            return res.status(sectionResult.error.status).json({ error: sectionResult.error.message });
        }

        if (!sectionResult.access.canManageSections) {
            return res.status(403).json({ error: 'Only task leaders or group managers can manage checklist sections' });
        }

        if (!title?.trim()) {
            return res.status(400).json({ error: 'Section title is required' });
        }

        const updated = await prisma.checklistSection.update({
            where: { id },
            data: {
                title: title.trim()
            },
            include: {
                items: {
                    orderBy: [
                        { position: 'asc' },
                        { createdAt: 'asc' }
                    ]
                }
            }
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.updateChecklistSectionPosition = async (req, res) => {
    try {
        const { id } = req.params;
        const { position } = req.body;
        const sectionResult = await getSectionWithAccess(id, req.user.userId);

        if (sectionResult.error) {
            return res.status(sectionResult.error.status).json({ error: sectionResult.error.message });
        }

        if (!sectionResult.access.canManageSections) {
            return res.status(403).json({ error: 'Only task leaders or group managers can manage checklist sections' });
        }

        const siblings = await prisma.checklistSection.findMany({
            where: {
                taskId: sectionResult.section.taskId,
                NOT: { id }
            },
            orderBy: [
                { position: 'asc' },
                { createdAt: 'asc' }
            ],
            select: {
                id: true
            }
        });
        const nextPosition = clampPosition(position, siblings.length);

        if (nextPosition === null) {
            return res.status(400).json({ error: 'Position must be an integer' });
        }

        await prisma.$transaction(async (transaction) => {
            const reorderedIds = siblings.map((section) => section.id);
            reorderedIds.splice(nextPosition, 0, id);

            await Promise.all(reorderedIds.map((sectionId, index) => transaction.checklistSection.update({
                where: { id: sectionId },
                data: { position: index }
            })));
        });

        const updated = await prisma.checklistSection.findUnique({
            where: { id },
            include: {
                items: {
                    orderBy: [
                        { position: 'asc' },
                        { createdAt: 'asc' }
                    ]
                }
            }
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.reorderChecklistSections = async (req, res) => {
    try {
        const { taskId, sectionIds } = req.body;

        if (!taskId) {
            return res.status(400).json({ error: 'Task ID is required' });
        }

        if (!Array.isArray(sectionIds) || sectionIds.length === 0) {
            return res.status(400).json({ error: 'sectionIds must be a non-empty array' });
        }

        const taskResult = await getTaskAccess(taskId, req.user.userId);

        if (taskResult.error) {
            return res.status(taskResult.error.status).json({ error: taskResult.error.message });
        }

        if (!taskResult.access.canManageSections) {
            return res.status(403).json({ error: 'Only task leaders or group managers can manage checklist sections' });
        }

        const uniqueIds = [...new Set(sectionIds)];

        if (uniqueIds.length !== sectionIds.length) {
            return res.status(400).json({ error: 'sectionIds must not contain duplicates' });
        }

        const sections = await prisma.checklistSection.findMany({
            where: {
                id: {
                    in: sectionIds
                },
                taskId
            },
            select: {
                id: true
            }
        });

        if (sections.length !== sectionIds.length) {
            return res.status(400).json({ error: 'One or more sections do not belong to the task' });
        }

        await prisma.$transaction(sectionIds.map((sectionId, index) => prisma.checklistSection.update({
            where: { id: sectionId },
            data: { position: index }
        })));

        const updatedSections = await prisma.checklistSection.findMany({
            where: { taskId },
            orderBy: [
                { position: 'asc' },
                { createdAt: 'asc' }
            ],
            include: {
                items: {
                    orderBy: [
                        { position: 'asc' },
                        { createdAt: 'asc' }
                    ]
                }
            }
        });

        res.json(updatedSections);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.deleteChecklistSection = async (req, res) => {
    try {
        const { id } = req.params;
        const sectionResult = await getSectionWithAccess(id, req.user.userId);

        if (sectionResult.error) {
            return res.status(sectionResult.error.status).json({ error: sectionResult.error.message });
        }

        if (!sectionResult.access.canManageSections) {
            return res.status(403).json({ error: 'Only task leaders or group managers can manage checklist sections' });
        }

        await prisma.$transaction(async (transaction) => {
            await transaction.checklistSection.delete({
                where: { id }
            });

            await normalizeSectionPositions(transaction, sectionResult.section.taskId);
        });

        res.json({ message: 'Checklist section deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.createChecklistItem = async (req, res) => {
    try {
        const { taskId, sectionId, title, position } = req.body;

        if (!title?.trim()) {
            return res.status(400).json({ error: 'Checklist item title is required' });
        }

        let targetSection = null;
        let targetTaskId = taskId;

        if (sectionId) {
            targetSection = await prisma.checklistSection.findUnique({
                where: { id: sectionId },
                select: {
                    id: true,
                    taskId: true
                }
            });

            if (!targetSection) {
                return res.status(404).json({ error: 'Checklist section not found' });
            }

            if (taskId && taskId !== targetSection.taskId) {
                return res.status(400).json({ error: 'Section does not belong to task' });
            }

            targetTaskId = targetSection.taskId;
        }

        if (!targetTaskId) {
            return res.status(400).json({ error: 'Task ID or section ID is required' });
        }

        const taskResult = await getTaskAccess(targetTaskId, req.user.userId);

        if (taskResult.error) {
            return res.status(taskResult.error.status).json({ error: taskResult.error.message });
        }

        if (!taskResult.access.canParticipate) {
            return res.status(403).json({ error: 'Only task participants can edit checklist items' });
        }

        let createdItem = null;

        await prisma.$transaction(async (transaction) => {
            if (!targetSection) {
                targetSection = await getOrCreateDefaultSection(transaction, targetTaskId, req.user.userId);
            }

            const existingItems = await transaction.checklistItem.findMany({
                where: { sectionId: targetSection.id },
                orderBy: [
                    { position: 'asc' },
                    { createdAt: 'asc' }
                ],
                select: {
                    id: true
                }
            });
            const targetPosition = Number.isInteger(position)
                ? clampPosition(position, existingItems.length)
                : existingItems.length;

            if (targetPosition === null) {
                throw new Error('Position must be an integer');
            }

            const reorderedIds = existingItems.map((item) => item.id);
            reorderedIds.splice(targetPosition, 0, '__new__');

            await Promise.all(reorderedIds
                .filter((itemId) => itemId !== '__new__')
                .map((itemId, index) => transaction.checklistItem.update({
                    where: { id: itemId },
                    data: { position: index >= targetPosition ? index + 1 : index }
                })));

            createdItem = await transaction.checklistItem.create({
                data: {
                    taskId: targetTaskId,
                    sectionId: targetSection.id,
                    title: title.trim(),
                    position: targetPosition,
                    createdBy: req.user.userId
                }
            });

            await normalizeItemPositions(transaction, targetSection.id);
        });

        res.status(201).json(createdItem);
    } catch (error) {
        const status = error.message === 'Position must be an integer' ? 400 : 500;
        res.status(status).json({ error: error.message });
    }
};

exports.getChecklistByTask = async (req, res) => {
    try {
        const { taskId } = req.params;
        const taskResult = await getTaskAccess(taskId, req.user.userId);

        if (taskResult.error) {
            return res.status(taskResult.error.status).json({ error: taskResult.error.message });
        }

        const items = await prisma.checklistItem.findMany({
            where: { taskId },
            orderBy: [
                { section: { position: 'asc' } },
                { position: 'asc' },
                { createdAt: 'asc' }
            ],
            include: {
                section: true
            }
        });

        res.json(items);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.updateChecklistItem = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, isCompleted } = req.body;
        const itemResult = await getItemWithAccess(id, req.user.userId);

        if (itemResult.error) {
            return res.status(itemResult.error.status).json({ error: itemResult.error.message });
        }

        if (!itemResult.access.canParticipate) {
            return res.status(403).json({ error: 'Only task participants can edit checklist items' });
        }

        const data = {};

        if (title !== undefined) {
            if (!title?.trim()) {
                return res.status(400).json({ error: 'Checklist item title is required' });
            }

            data.title = title.trim();
        }

        if (isCompleted !== undefined) {
            data.isCompleted = Boolean(isCompleted);
        }

        const updated = await prisma.checklistItem.update({
            where: { id },
            data
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.toggleChecklistItem = async (req, res) => {
    try {
        const { id } = req.params;
        const itemResult = await getItemWithAccess(id, req.user.userId);

        if (itemResult.error) {
            return res.status(itemResult.error.status).json({ error: itemResult.error.message });
        }

        if (!itemResult.access.canParticipate) {
            return res.status(403).json({ error: 'Only task participants can edit checklist items' });
        }

        const updated = await prisma.checklistItem.update({
            where: { id },
            data: {
                isCompleted: !itemResult.item.isCompleted
            }
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.updateChecklistPosition = async (req, res) => {
    try {
        const { id } = req.params;
        const { sectionId, position } = req.body;
        const itemResult = await getItemWithAccess(id, req.user.userId);

        if (itemResult.error) {
            return res.status(itemResult.error.status).json({ error: itemResult.error.message });
        }

        if (!itemResult.access.canParticipate) {
            return res.status(403).json({ error: 'Only task participants can edit checklist items' });
        }

        const nextSectionId = sectionId || itemResult.item.sectionId;

        if (sectionId) {
            const section = await prisma.checklistSection.findUnique({
                where: { id: sectionId },
                select: {
                    id: true,
                    taskId: true
                }
            });

            if (!section || section.taskId !== itemResult.item.taskId) {
                return res.status(400).json({ error: 'Section does not belong to task' });
            }
        }

        const siblings = await prisma.checklistItem.findMany({
            where: {
                sectionId: nextSectionId,
                NOT: { id }
            },
            orderBy: [
                { position: 'asc' },
                { createdAt: 'asc' }
            ],
            select: {
                id: true
            }
        });
        const nextPosition = clampPosition(position, siblings.length);

        if (nextPosition === null) {
            return res.status(400).json({ error: 'Position must be an integer' });
        }

        await prisma.$transaction(async (transaction) => {
            const reorderedIds = siblings.map((item) => item.id);
            reorderedIds.splice(nextPosition, 0, id);

            await Promise.all(reorderedIds.map((itemId, index) => transaction.checklistItem.update({
                where: { id: itemId },
                data: {
                    sectionId: nextSectionId,
                    position: index
                }
            })));

            if (itemResult.item.sectionId !== nextSectionId) {
                await normalizeItemPositions(transaction, itemResult.item.sectionId);
            }
        });

        const updated = await prisma.checklistItem.findUnique({
            where: { id }
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.reorderChecklistItems = async (req, res) => {
    try {
        const { taskId, sectionId, itemIds } = req.body;

        if (!Array.isArray(itemIds) || itemIds.length === 0) {
            return res.status(400).json({ error: 'itemIds must be a non-empty array' });
        }

        let targetSectionId = sectionId;
        let targetTaskId = taskId;

        if (sectionId) {
            const section = await prisma.checklistSection.findUnique({
                where: { id: sectionId },
                select: {
                    id: true,
                    taskId: true
                }
            });

            if (!section) {
                return res.status(404).json({ error: 'Checklist section not found' });
            }

            targetTaskId = section.taskId;
        }

        if (!targetTaskId) {
            return res.status(400).json({ error: 'Task ID or section ID is required' });
        }

        const taskResult = await getTaskAccess(targetTaskId, req.user.userId);

        if (taskResult.error) {
            return res.status(taskResult.error.status).json({ error: taskResult.error.message });
        }

        if (!taskResult.access.canParticipate) {
            return res.status(403).json({ error: 'Only task participants can edit checklist items' });
        }

        if (!targetSectionId) {
            const firstItem = await prisma.checklistItem.findFirst({
                where: {
                    id: {
                        in: itemIds
                    },
                    taskId: targetTaskId
                },
                select: {
                    sectionId: true
                }
            });

            if (!firstItem) {
                return res.status(400).json({ error: 'One or more items do not belong to the task' });
            }

            targetSectionId = firstItem.sectionId;
        }

        const uniqueIds = [...new Set(itemIds)];

        if (uniqueIds.length !== itemIds.length) {
            return res.status(400).json({ error: 'itemIds must not contain duplicates' });
        }

        const items = await prisma.checklistItem.findMany({
            where: {
                id: {
                    in: itemIds
                },
                taskId: targetTaskId,
                sectionId: targetSectionId
            },
            select: {
                id: true
            }
        });

        if (items.length !== itemIds.length) {
            return res.status(400).json({ error: 'One or more items do not belong to the section' });
        }

        await prisma.$transaction(itemIds.map((itemId, index) => prisma.checklistItem.update({
            where: { id: itemId },
            data: {
                sectionId: targetSectionId,
                position: index
            }
        })));

        const updatedItems = await prisma.checklistItem.findMany({
            where: { sectionId: targetSectionId },
            orderBy: [
                { position: 'asc' },
                { createdAt: 'asc' }
            ]
        });

        res.json(updatedItems);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.deleteChecklistItem = async (req, res) => {
    try {
        const { id } = req.params;
        const itemResult = await getItemWithAccess(id, req.user.userId);

        if (itemResult.error) {
            return res.status(itemResult.error.status).json({ error: itemResult.error.message });
        }

        if (!itemResult.access.canParticipate) {
            return res.status(403).json({ error: 'Only task participants can edit checklist items' });
        }

        await prisma.$transaction(async (transaction) => {
            await transaction.checklistItem.delete({
                where: { id }
            });

            await normalizeItemPositions(transaction, itemResult.item.sectionId);
        });

        res.json({ message: 'Checklist item deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
