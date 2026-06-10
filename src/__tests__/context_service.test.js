const {buildGroupContext} = require('../services/context_service');

describe('context service', () => {
    const makePrisma = ({membership, tasks}) => ({
        groupMember: {
            findUnique: jest.fn().mockResolvedValue(membership)
        },
        group: {
            findUnique: jest.fn().mockResolvedValue({
                id: 'group-1',
                name: 'Demo Group',
                tasks
            })
        }
    });

    const task = (overrides = {}) => ({
        id: 'task-1',
        title: 'Build API',
        description: 'Finish backend',
        dueDate: new Date('2026-06-10T00:00:00.000Z'),
        assignedTo: 'user-1',
        progress: 50,
        priority: 'High',
        assignee: {username: 'Ada'},
        creator: {username: 'Manager'},
        list: {name: 'In Progress'},
        ...overrides
    });

    test('filters AI context to participating tasks for non-admin members', async () => {
        const prisma = makePrisma({
            membership: {id: 'membership-1', role: 'member'},
            tasks: [task()]
        });

        const result = await buildGroupContext({
            prisma,
            groupId: 'group-1',
            userId: 'user-1'
        });

        expect(result.error).toBeUndefined();
        expect(prisma.group.findUnique).toHaveBeenCalledWith(expect.objectContaining({
            select: expect.objectContaining({
                tasks: expect.objectContaining({
                    where: {
                        taskMemberships: {
                            some: {
                                userId: 'user-1'
                            }
                        }
                    }
                })
            })
        }));
        expect(result.data.metrics.totalTasks).toBe(1);
        expect(result.data.contextText).toContain('Build API');
    });

    test('includes all group tasks for managers', async () => {
        const prisma = makePrisma({
            membership: {id: 'membership-1', role: 'manager'},
            tasks: [
                task(),
                task({
                    id: 'task-2',
                    title: 'Ship demo',
                    progress: 100,
                    priority: 'Done',
                    list: {name: 'Done'}
                })
            ]
        });

        const result = await buildGroupContext({
            prisma,
            groupId: 'group-1',
            userId: 'manager-1'
        });

        expect(result.error).toBeUndefined();
        expect(prisma.group.findUnique).toHaveBeenCalledWith(expect.objectContaining({
            select: expect.objectContaining({
                tasks: expect.objectContaining({
                    where: {}
                })
            })
        }));
        expect(result.data.metrics).toMatchObject({
            totalTasks: 2,
            doneTasks: 1,
            unfinishedTasks: 1
        });
    });

    test('returns group not found error', async () => {
        const prisma = {
            groupMember: {
                findUnique: jest.fn().mockResolvedValue({id: 'membership-1', role: 'owner'})
            },
            group: {
                findUnique: jest.fn().mockResolvedValue(null)
            }
        };

        const result = await buildGroupContext({
            prisma,
            groupId: 'missing-group',
            userId: 'owner-1'
        });

        expect(result).toEqual({
            error: {
                code: 'GROUP_NOT_FOUND',
                message: 'Group not found'
            },
            status: 404
        });
    });
});
