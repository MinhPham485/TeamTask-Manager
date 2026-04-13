const DEFAULT_TASK_LIMIT = 20;

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
                    dueDate: true,
                    assignedTo: true,
                    assignee: {
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
        const listName = task.list?.name || 'unknown';

        return `- [${listName}] ${task.title} | assignee: ${assignee} | due: ${formatDate(task.dueDate)}`;
    });

    return {
        data: {
            groupName: group.name,
            contextText: [
                `Group: ${group.name}`,
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
