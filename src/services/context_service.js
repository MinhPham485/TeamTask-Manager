const DEFAULT_TASK_LIMIT = 20;

const isDoneList = (listName) => {
    const normalized = String(listName || '').trim().toLowerCase();

    if (!normalized) {
        return false;
    }

    return normalized.includes('done') || normalized.includes('completed') || normalized.includes('hoan thanh') || normalized.includes('xong');
};

const formatDate = (value) => {
    if (!value) {
        return 'none';
    }

    return new Date(value).toISOString().slice(0, 10);
};

const buildGroupContext = async ({prisma, groupId, taskLimit = DEFAULT_TASK_LIMIT}) => {
    const group = await prisma.group.findUnique({
        where: {id: groupId},
        select: {
            id: true,
            name: true,
            tasks: {
                take: taskLimit,
                orderBy: {
                    createdAt: 'desc'
                },
                select: {
                    id: true,
                    title: true,
                    description: true,
                    dueDate: true,
                    assignedTo: true,
                    assignee: {
                        select: {
                            username: true
                        }
                    },
                    creator: {
                        select: {
                            username: true
                        }
                    },
                    list: {
                        select: {
                            name: true
                        }
                    }
                }
            }
        }
    });

    if (!group) {
        return {
            error: {
                code: 'GROUP_NOT_FOUND',
                message: 'Group not found'
            },
            status: 404
        };
    }

    const taskLines = group.tasks.map((task) => {
        const assignee = task.assignee?.username || 'unassigned';
        const creator = task.creator?.username || 'unknown';
        const listName = task.list?.name || 'unknown';
        const description = task.description?.trim() || 'none';

        return `- [${listName}] ${task.title} | assignee: ${assignee} | creator: ${creator} | due: ${formatDate(task.dueDate)} | description: ${description}`;
    });

    const tasksWithStatus = group.tasks.map((task) => {
        const listName = task.list?.name || 'unknown';

        return {
            id: task.id,
            title: task.title,
            description: task.description?.trim() || null,
            listName,
            assignee: task.assignee?.username || 'unassigned',
            creator: task.creator?.username || 'unknown',
            dueDate: formatDate(task.dueDate),
            isDone: isDoneList(listName)
        };
    });

    const unfinishedTasks = tasksWithStatus.filter((task) => !task.isDone);
    const unassignedTasks = unfinishedTasks.filter((task) => task.assignee === 'unassigned');
    const overdueTasks = unfinishedTasks.filter((task) => task.dueDate !== 'none' && new Date(task.dueDate) < new Date());

    const metrics = {
        totalTasks: tasksWithStatus.length,
        doneTasks: tasksWithStatus.length - unfinishedTasks.length,
        unfinishedTasks: unfinishedTasks.length,
        unassignedUnfinishedTasks: unassignedTasks.length,
        overdueUnfinishedTasks: overdueTasks.length
    };

    return {
        data: {
            groupName: group.name,
            metrics,
            tasks: tasksWithStatus,
            contextText: [
                `Group: ${group.name}`,
                `Task stats: total=${metrics.totalTasks}, done=${metrics.doneTasks}, unfinished=${metrics.unfinishedTasks}, unassigned_unfinished=${metrics.unassignedUnfinishedTasks}, overdue_unfinished=${metrics.overdueUnfinishedTasks}`,
                `Recent tasks (${group.tasks.length}):`,
                taskLines.length ? taskLines.join('\n') : '- No tasks available'
            ].join('\n')
        },
        status: 200
    };
};

module.exports = {
    buildGroupContext
};
