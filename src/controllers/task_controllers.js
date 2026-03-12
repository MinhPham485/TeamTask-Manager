const {PrismaClient, TaskStatus} = require('@prisma/client');
require('dotenv').config();
const prisma = new PrismaClient();

const VALID_TASK_STATUSES = Object.values(TaskStatus);
const TASK_STATUS_ORDER = {
    TODO: 0,
    IN_PROGRESS: 1,
    DONE: 2
};

const isValidTaskStatus = (status) => VALID_TASK_STATUSES.includes(status);

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
        }
    }
});

exports.createTask = async (req, res) => {
    try {
        const {title, description, groupId, assignedTo} = req.body;
        const lastTask = await prisma.task.findFirst({
            where: {
                groupId,
                status: TaskStatus.TODO
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
                status: TaskStatus.TODO,
                position: (lastTask?.position ?? -1) + 1,
                assignedTo
            },
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
        res.status(201).json(task);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.getTasksByGroup = async (req, res) => {
    try {
        const {groupId} = req.params;
        const tasks = await prisma.task.findMany({
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
                }
            }
        });

        tasks.sort((firstTask, secondTask) => {
            const statusDifference = TASK_STATUS_ORDER[firstTask.status] - TASK_STATUS_ORDER[secondTask.status];

            if (statusDifference !== 0) {
                return statusDifference;
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
        const {title, description, assignedTo} = req.body;
        const task = await prisma.task.update({
            where: {id},
            data: {title, description, assignedTo}
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


exports.updateTaskStatus = async (req, res) => {
    try {
        const {id} = req.params;
        const {status} = req.body;
        const currentTask = req.task || await prisma.task.findUnique({
            where: { id }
        });

        if (!currentTask) {
            return res.status(404).json({error: 'Task not found'});
        }

        if (!isValidTaskStatus(status)) {
            return res.status(400).json({error: 'Invalid task status'});
        }

        if (currentTask.status === status) {
            const task = await getTaskWithAssignee(id);
            return res.json(task);
        }

        const targetLastTask = await prisma.task.findFirst({
            where: {
                groupId: currentTask.groupId,
                status,
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
                    status: currentTask.status,
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
                    status,
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
        const {status, position} = req.body;
        const currentTask = req.task || await prisma.task.findUnique({
            where: { id }
        });

        if (!currentTask) {
            return res.status(404).json({error: 'Task not found'});
        }

        const nextStatus = status || currentTask.status;

        if (!isValidTaskStatus(nextStatus)) {
            return res.status(400).json({error: 'Invalid task status'});
        }

        const targetTasks = await prisma.task.findMany({
            where: {
                groupId: currentTask.groupId,
                status: nextStatus,
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
            if (currentTask.status !== nextStatus) {
                const sourceTasks = await transaction.task.findMany({
                    where: {
                        groupId: currentTask.groupId,
                        status: currentTask.status,
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
                    status: nextStatus,
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
        const {groupId, status, taskIds} = req.body;

        if (!groupId) {
            return res.status(400).json({error: 'Group ID is required'});
        }

        if (!isValidTaskStatus(status)) {
            return res.status(400).json({error: 'Invalid task status'});
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
                groupId
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
                status,
                position: index
            }
        })));

        const updatedTasks = await prisma.task.findMany({
            where: {
                groupId,
                status
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