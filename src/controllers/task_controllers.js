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

exports.createTask = async (req, res) => {
    try {
        const {title, description, groupId, assignedTo, listId} = req.body;

        if (!groupId) {
            return res.status(400).json({ error: 'Group ID is required' });
        }

        if (assignedTo) {
            const assigneeInGroup = await isGroupMember(assignedTo, groupId);

            if (!assigneeInGroup) {
                return res.status(400).json({ error: 'Assignee must be a member of the group' });
            }
        }

        let targetList = null;

        if (listId) {
            targetList = await prisma.list.findFirst({
                where: {
                    id: listId,
                    groupId
                },
                select: {
                    id: true
                }
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
                select: {
                    id: true
                }
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

        const task = await prisma.task.create({
            data: {
                title,
                description,
                groupId,
                listId: targetList.id,
                position: (lastTask?.position ?? -1) + 1,
                assignedTo,
                createdBy: req.user.userId
            },
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
        res.status(201).json(task);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getTasksByGroup = async (req, res) => {
    try {
        const {groupId} = req.params;
        const [tasks, lists] = await Promise.all([
            prisma.task.findMany({
                where: { groupId },
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
                    }
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

exports.updateTask = async (req, res) => {
    try {
        const {id} = req.params;
        const {title, description, assignedTo, dueDate} = req.body;

        const currentTask = req.task || await prisma.task.findUnique({
            where: {id},
            select: {
                id: true,
                groupId: true
            }
        });

        if (!currentTask) {
            return res.status(404).json({error: 'Task not found'});
        }

        if (assignedTo) {
            const assigneeInGroup = await isGroupMember(assignedTo, currentTask.groupId);

            if (!assigneeInGroup) {
                return res.status(400).json({error: 'Assignee must be a member of the group'});
            }
        }

        const task = await prisma.task.update({
            where: {id},
            data: {title, description, assignedTo, dueDate},
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
        res.status(500).json({error: error.message});
    }
};

exports.deleteTask = async (req, res) => {
    try {
        const {id} = req.params;
        await prisma.task.delete({where: {id}});
        res.json({message: 'Task deleted successfully'});
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.moveTaskToList = async (req, res) => {
    try {
        const {id} = req.params;
        const {listId} = req.body;

        if (!listId) {
            return res.status(400).json({error: 'List ID is required'});
        }

        const currentTask = req.task || await prisma.task.findUnique({
            where: { id }
        });

        if (!currentTask) {
            return res.status(404).json({error: 'Task not found'});
        }

        const targetList = await prisma.list.findUnique({
            where: { id: listId },
            select: {
                id: true,
                groupId: true
            }
        });

        if (!targetList || targetList.groupId !== currentTask.groupId) {
            return res.status(400).json({error: 'List does not belong to task group'});
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
        res.status(500).json({error: error.message});
    }
};

exports.updateTaskPosition = async (req, res) => {
    try {
        const {id} = req.params;
        const {listId, position} = req.body;
        const currentTask = req.task || await prisma.task.findUnique({
            where: { id }
        });

        if (!currentTask) {
            return res.status(404).json({error: 'Task not found'});
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
            return res.status(400).json({error: 'List does not belong to task group'});
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
            return res.status(400).json({error: 'Position must be an integer'});
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
        res.status(500).json({error: error.message});
    }
};

exports.reorderTasks = async (req, res) => {
    try {
        const {groupId, listId, taskIds} = req.body;

        if (!groupId) {
            return res.status(400).json({error: 'Group ID is required'});
        }

        if (!listId) {
            return res.status(400).json({error: 'List ID is required'});
        }

        if (!Array.isArray(taskIds) || taskIds.length === 0) {
            return res.status(400).json({error: 'taskIds must be a non-empty array'});
        }

        const uniqueTaskIds = [...new Set(taskIds)];

        if (uniqueTaskIds.length !== taskIds.length) {
            return res.status(400).json({error: 'taskIds must not contain duplicates'});
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
            return res.status(400).json({error: 'One or more tasks do not belong to the group'});
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
        res.status(500).json({error: error.message});
    }
};

exports.assignLabels = async (req, res) => {
    try {
        const {id} = req.params;
        const {labelIds} = req.body;

        if (!Array.isArray(labelIds)) {
            return res.status(400).json({error: 'labelIds must be an array'});
        }

        const currentTask = req.task || await prisma.task.findUnique({
            where: { id },
            select: {
                id: true,
                groupId: true
            }
        });

        if (!currentTask) {
            return res.status(404).json({error: 'Task not found'});
        }

        const uniqueLabelIds = [...new Set(labelIds)];

        if (uniqueLabelIds.length !== labelIds.length) {
            return res.status(400).json({error: 'labelIds must not contain duplicates'});
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
                return res.status(400).json({error: 'One or more labels do not belong to task group'});
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
            where: {id},
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
        res.status(500).json({error: error.message});
    }
};