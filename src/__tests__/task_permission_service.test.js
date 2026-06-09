const mockPrisma = {
    task: {
        findUnique: jest.fn()
    },
    groupMember: {
        findUnique: jest.fn()
    }
};

jest.mock('@prisma/client', () => ({
    PrismaClient: jest.fn(() => mockPrisma)
}));

const {
    getTaskAccess,
    getTaskAccessFilter,
    isGroupAdmin
} = require('../services/task_permission_service');

describe('task permission service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const mockTask = ({role = 'member'} = {}) => ({
        id: 'task-1',
        groupId: 'group-1',
        listId: 'list-1',
        taskMemberships: role
            ? [{id: 'task-member-1', userId: 'user-1', role}]
            : []
    });

    test('group owner can view, manage, and participate in any task', async () => {
        mockPrisma.task.findUnique.mockResolvedValue(mockTask({role: null}));
        mockPrisma.groupMember.findUnique.mockResolvedValue({id: 'group-member-1', role: 'owner'});

        const result = await getTaskAccess('task-1', 'user-1');

        expect(result.error).toBeUndefined();
        expect(result.access).toMatchObject({
            canView: true,
            canManageTask: true,
            canManageSections: true,
            canParticipate: true,
            isGroupAdmin: true,
            isLeader: false,
            isParticipant: false
        });
    });

    test('task leader can view, manage task, manage sections, and participate', async () => {
        mockPrisma.task.findUnique.mockResolvedValue(mockTask({role: 'leader'}));
        mockPrisma.groupMember.findUnique.mockResolvedValue({id: 'group-member-1', role: 'member'});

        const result = await getTaskAccess('task-1', 'user-1');

        expect(result.error).toBeUndefined();
        expect(result.access).toMatchObject({
            canView: true,
            canManageTask: true,
            canManageSections: true,
            canParticipate: true,
            isGroupAdmin: false,
            isLeader: true,
            isParticipant: true
        });
    });

    test('task member can view and participate but cannot manage task or sections', async () => {
        mockPrisma.task.findUnique.mockResolvedValue(mockTask({role: 'member'}));
        mockPrisma.groupMember.findUnique.mockResolvedValue({id: 'group-member-1', role: 'member'});

        const result = await getTaskAccess('task-1', 'user-1');

        expect(result.error).toBeUndefined();
        expect(result.access).toMatchObject({
            canView: true,
            canManageTask: false,
            canManageSections: false,
            canParticipate: true,
            isGroupAdmin: false,
            isLeader: false,
            isParticipant: true
        });
    });

    test('group member outside the task cannot view or participate', async () => {
        mockPrisma.task.findUnique.mockResolvedValue(mockTask({role: null}));
        mockPrisma.groupMember.findUnique.mockResolvedValue({id: 'group-member-1', role: 'member'});

        const result = await getTaskAccess('task-1', 'user-1');

        expect(result.error).toBeUndefined();
        expect(result.access).toMatchObject({
            canView: false,
            canManageTask: false,
            canManageSections: false,
            canParticipate: false,
            isGroupAdmin: false,
            isLeader: false,
            isParticipant: false
        });
    });

    test('user outside group is blocked', async () => {
        mockPrisma.task.findUnique.mockResolvedValue(mockTask({role: null}));
        mockPrisma.groupMember.findUnique.mockResolvedValue(null);

        const result = await getTaskAccess('task-1', 'user-1');

        expect(result.error).toEqual({
            status: 403,
            message: 'You do not have permission to access this task'
        });
    });

    test('task access filter returns all tasks for admins and membership filter for employees', () => {
        expect(isGroupAdmin({role: 'manager'})).toBe(true);
        expect(getTaskAccessFilter({
            userId: 'manager-1',
            membership: {role: 'manager'}
        })).toEqual({});
        expect(getTaskAccessFilter({
            userId: 'member-1',
            membership: {role: 'member'}
        })).toEqual({
            taskMemberships: {
                some: {
                    userId: 'member-1'
                }
            }
        });
    });
});
