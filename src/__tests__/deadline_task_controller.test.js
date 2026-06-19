const mockPrisma = {
    deadlineTask: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn()
    },
    deadlineTaskMember: {
        upsert: jest.fn()
    },
    deadlineChecklistItem: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn()
    },
    $transaction: jest.fn()
};

jest.mock('@prisma/client', () => ({
    PrismaClient: jest.fn(() => mockPrisma)
}));

jest.mock('../services/task_permission_service', () => ({
    getGroupMembership: jest.fn(),
    isGroupAdmin: jest.fn((membership) => ['owner', 'manager'].includes(membership?.role))
}));

jest.mock('../services/notification_service', () => ({
    createDeadlineTaskAssignedNotification: jest.fn()
}));

const {getGroupMembership} = require('../services/task_permission_service');
const {createDeadlineTaskAssignedNotification} = require('../services/notification_service');
const deadlineTaskController = require('../controllers/deadline_task_controllers');

const createResponse = () => {
    const res = {
        status: jest.fn(() => res),
        json: jest.fn()
    };

    return res;
};

describe('deadline task controller permissions', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date(2026, 5, 10, 10, 0, 0));
        mockPrisma.deadlineTask.findMany.mockReset();
        mockPrisma.deadlineTask.findUnique.mockReset();
        mockPrisma.deadlineTask.delete.mockReset();
        mockPrisma.deadlineTaskMember.upsert.mockReset();
        mockPrisma.deadlineChecklistItem.findMany.mockReset();
        mockPrisma.deadlineChecklistItem.findFirst.mockReset();
        mockPrisma.deadlineChecklistItem.create.mockReset();
        mockPrisma.deadlineChecklistItem.update.mockReset();
        mockPrisma.deadlineChecklistItem.delete.mockReset();
        mockPrisma.$transaction.mockReset();
        getGroupMembership.mockReset();
        createDeadlineTaskAssignedNotification.mockReset();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('group members can list every deadline task in the group without private detail', async () => {
        const task = {
            id: 'deadline-1',
            title: 'Release demo',
            groupId: 'group-1',
            description: 'Private implementation notes',
            progress: 0,
            priority: 'Medium',
            memberships: [],
            checklistItems: [{id: 'checklist-1', isCompleted: false}]
        };
        const req = {
            params: {groupId: 'group-1'},
            user: {userId: 'member-1'},
            groupMembership: {role: 'member'}
        };
        const res = createResponse();

        mockPrisma.deadlineTask.findMany.mockResolvedValue([task]);

        await deadlineTaskController.getDeadlineTasksByGroup(req, res);

        expect(mockPrisma.deadlineTask.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: {groupId: 'group-1'}
        }));
        expect(res.json).toHaveBeenCalledWith([expect.objectContaining({
            id: 'deadline-1',
            listId: 'deadline',
            title: 'Release demo',
            description: null,
            viewerCanOpen: false,
            viewerCanManage: false,
            taskMemberships: [],
            checklistItems: []
        })]);
    });

    test('group members cannot open deadline task detail when not assigned to the task', async () => {
        const accessTask = {
            id: 'deadline-1',
            groupId: 'group-1',
            memberships: []
        };
        const fullTask = {
            id: 'deadline-1',
            title: 'Release demo',
            groupId: 'group-1',
            progress: 0,
            priority: 'Medium',
            memberships: [],
            checklistItems: []
        };
        const req = {
            params: {id: 'deadline-1'},
            user: {userId: 'member-1'}
        };
        const res = createResponse();

        mockPrisma.deadlineTask.findUnique
            .mockResolvedValueOnce(accessTask)
            .mockResolvedValueOnce(fullTask);
        getGroupMembership.mockResolvedValue({id: 'group-member-1', role: 'member'});

        await deadlineTaskController.getDeadlineTask(req, res);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
            error: 'You do not have permission to access this deadline task'
        });
    });

    test('assigned task members can open deadline task detail', async () => {
        const accessTask = {
            id: 'deadline-1',
            groupId: 'group-1',
            memberships: [{id: 'task-member-1', userId: 'member-1', role: 'member'}]
        };
        const fullTask = {
            id: 'deadline-1',
            title: 'Release demo',
            groupId: 'group-1',
            progress: 0,
            priority: 'Medium',
            memberships: [{id: 'task-member-1', userId: 'member-1', role: 'member'}],
            checklistItems: []
        };
        const req = {
            params: {id: 'deadline-1'},
            user: {userId: 'member-1'}
        };
        const res = createResponse();

        mockPrisma.deadlineTask.findUnique
            .mockResolvedValueOnce(accessTask)
            .mockResolvedValueOnce(fullTask);
        getGroupMembership.mockResolvedValue({id: 'group-member-1', role: 'member'});

        await deadlineTaskController.getDeadlineTask(req, res);

        expect(res.status).not.toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            id: 'deadline-1',
            viewerCanOpen: true,
            viewerCanManage: false
        }));
    });

    test('task leaders can add group members to deadline tasks', async () => {
        const accessTask = {
            id: 'deadline-1',
            title: 'Release demo',
            groupId: 'group-1',
            memberships: [{id: 'task-member-1', userId: 'leader-1', role: 'leader'}]
        };
        const fullTask = {
            id: 'deadline-1',
            title: 'Release demo',
            groupId: 'group-1',
            progress: 0,
            priority: 'Medium',
            memberships: [
                {id: 'task-member-1', userId: 'leader-1', role: 'leader'},
                {id: 'task-member-2', userId: 'member-1', role: 'member'}
            ],
            checklistItems: []
        };
        const req = {
            params: {id: 'deadline-1'},
            user: {userId: 'leader-1'},
            body: {userId: 'member-1'}
        };
        const res = createResponse();

        mockPrisma.deadlineTask.findUnique
            .mockResolvedValueOnce(accessTask)
            .mockResolvedValueOnce(fullTask);
        getGroupMembership
            .mockResolvedValueOnce({id: 'leader-group-member-1', role: 'member'})
            .mockResolvedValueOnce({id: 'target-group-member-1', role: 'member'});

        await deadlineTaskController.addDeadlineTaskMember(req, res);

        expect(mockPrisma.deadlineTaskMember.upsert).toHaveBeenCalledWith(expect.objectContaining({
            create: expect.objectContaining({
                deadlineTaskId: 'deadline-1',
                userId: 'member-1',
                role: 'member'
            })
        }));
        expect(createDeadlineTaskAssignedNotification).toHaveBeenCalledWith({
            recipientId: 'member-1',
            actorId: 'leader-1',
            deadlineTaskId: 'deadline-1',
            groupId: 'group-1',
            taskTitle: 'Release demo'
        });
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            id: 'deadline-1',
            viewerCanManage: true
        }));
    });

    test('returns personal deadline summary for current user', async () => {
        const req = {
            user: {userId: 'member-1'}
        };
        const res = createResponse();

        mockPrisma.deadlineTask.findMany.mockResolvedValue([
            {
                id: 'deadline-1',
                title: 'Today task',
                groupId: 'group-1',
                dueDate: '2026-06-10T12:00:00.000Z',
                progress: 10,
                priority: 'Medium',
                memberships: [{id: 'task-member-1', userId: 'member-1', role: 'member', user: {id: 'member-1', username: 'Minh', email: 'minh@example.com'}}],
                checklistItems: [],
                checklistSections: []
            },
            {
                id: 'deadline-2',
                title: 'Overdue task',
                groupId: 'group-1',
                dueDate: '2026-06-08T12:00:00.000Z',
                progress: 20,
                priority: 'High',
                memberships: [{id: 'task-member-2', userId: 'member-1', role: 'member', user: {id: 'member-1', username: 'Minh', email: 'minh@example.com'}}],
                checklistItems: [],
                checklistSections: []
            },
            {
                id: 'deadline-3',
                title: 'Later task',
                groupId: 'group-1',
                dueDate: '2026-06-12T12:00:00.000Z',
                progress: 0,
                priority: 'Low',
                memberships: [{id: 'task-member-3', userId: 'member-1', role: 'member', user: {id: 'member-1', username: 'Minh', email: 'minh@example.com'}}],
                checklistItems: [],
                checklistSections: []
            }
        ]);

        await deadlineTaskController.getMyDeadlineTaskSummary(req, res);

        expect(mockPrisma.deadlineTask.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: {
                memberships: {
                    some: {
                        userId: 'member-1'
                    }
                }
            }
        }));
        expect(res.json).toHaveBeenCalledWith({
            todayCount: 1,
            overdueCount: 1
        });
    });

    test('does not create notification when member already exists on the deadline task', async () => {
        const accessTask = {
            id: 'deadline-1',
            title: 'Release demo',
            groupId: 'group-1',
            memberships: [
                {id: 'task-member-1', userId: 'leader-1', role: 'leader'},
                {id: 'task-member-2', userId: 'member-1', role: 'member'}
            ]
        };
        const fullTask = {
            id: 'deadline-1',
            title: 'Release demo',
            groupId: 'group-1',
            progress: 0,
            priority: 'Medium',
            memberships: accessTask.memberships,
            checklistItems: []
        };
        const req = {
            params: {id: 'deadline-1'},
            user: {userId: 'leader-1'},
            body: {userId: 'member-1'}
        };
        const res = createResponse();

        mockPrisma.deadlineTask.findUnique
            .mockResolvedValueOnce(accessTask)
            .mockResolvedValueOnce(fullTask);
        getGroupMembership
            .mockResolvedValueOnce({id: 'leader-group-member-1', role: 'member'})
            .mockResolvedValueOnce({id: 'target-group-member-1', role: 'member'});

        await deadlineTaskController.addDeadlineTaskMember(req, res);

        expect(createDeadlineTaskAssignedNotification).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            id: 'deadline-1'
        }));
    });

    test('does not create notification when users add themselves to the deadline task', async () => {
        const accessTask = {
            id: 'deadline-1',
            title: 'Release demo',
            groupId: 'group-1',
            memberships: [{id: 'task-member-1', userId: 'leader-1', role: 'leader'}]
        };
        const fullTask = {
            id: 'deadline-1',
            title: 'Release demo',
            groupId: 'group-1',
            progress: 0,
            priority: 'Medium',
            memberships: [
                {id: 'task-member-1', userId: 'leader-1', role: 'leader'}
            ],
            checklistItems: []
        };
        const req = {
            params: {id: 'deadline-1'},
            user: {userId: 'leader-1'},
            body: {userId: 'leader-1'}
        };
        const res = createResponse();

        mockPrisma.deadlineTask.findUnique
            .mockResolvedValueOnce(accessTask)
            .mockResolvedValueOnce(fullTask);
        getGroupMembership
            .mockResolvedValueOnce({id: 'leader-group-member-1', role: 'member'})
            .mockResolvedValueOnce({id: 'leader-group-member-1', role: 'member'});

        await deadlineTaskController.addDeadlineTaskMember(req, res);

        expect(createDeadlineTaskAssignedNotification).not.toHaveBeenCalled();
    });
});
