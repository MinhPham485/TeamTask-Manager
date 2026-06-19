const {
    buildDeadlineSummary,
    buildMyDeadlineSummary,
    buildDeadlineWhere,
    getDeadlineBucket,
    getDaysOverdue,
    withChecklistSummary,
    withDeadlineTaskMeta
} = require('../services/deadline_service');

describe('deadline service', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date(2026, 5, 10, 10, 0, 0));
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    const atLocalNoon = (dayOffset) => {
        return new Date(2026, 5, 10 + dayOffset, 12, 0, 0);
    };

    test('buckets tasks without mutating overdue dueDate', () => {
        const overdueTask = {dueDate: atLocalNoon(-2), progress: 20, priority: 'High'};
        const doneOverdueTask = {dueDate: atLocalNoon(-2), progress: 100, priority: 'High'};

        expect(getDeadlineBucket({dueDate: null, progress: 0, priority: 'Low'})).toBe('noDue');
        expect(getDeadlineBucket(overdueTask)).toBe('overdue');
        expect(getDaysOverdue(overdueTask)).toBe(2);
        expect(getDeadlineBucket({dueDate: atLocalNoon(0), progress: 0, priority: 'Low'})).toBe('today');
        expect(getDeadlineBucket({dueDate: atLocalNoon(3), progress: 0, priority: 'Low'})).toBe('week');
        expect(getDeadlineBucket({dueDate: atLocalNoon(10), progress: 0, priority: 'Low'})).toBe('later');
        expect(getDeadlineBucket(doneOverdueTask)).toBe('later');
        expect(getDaysOverdue(doneOverdueTask)).toBe(0);
        expect(overdueTask.dueDate).toEqual(atLocalNoon(-2));
    });

    test('adds checklist summary and deadline metadata', () => {
        const task = withDeadlineTaskMeta({
            dueDate: atLocalNoon(-1),
            progress: 10,
            priority: 'Medium',
            checklistItems: [
                {isCompleted: true},
                {isCompleted: false},
                {isCompleted: true}
            ]
        });

        expect(task.deadlineBucket).toBe('overdue');
        expect(task.isOverdue).toBe(true);
        expect(task.daysOverdue).toBe(1);
        expect(task.checklistSummary).toEqual({
            completed: 2,
            total: 3,
            percent: 67
        });
    });

    test('builds deadline where filters without widening mine scope', () => {
        expect(buildDeadlineWhere({
            groupId: 'group-1',
            userId: 'member-1',
            membership: {role: 'member'},
            query: {
                scope: 'all',
                assigneeId: 'assignee-1',
                leaderId: 'leader-1',
                priority: 'High',
                search: 'api'
            }
        })).toEqual({
            groupId: 'group-1',
            AND: [
                {taskMemberships: {some: {userId: 'member-1'}}},
                {priority: 'High'},
                {
                    OR: [
                        {title: {contains: 'api', mode: 'insensitive'}},
                        {description: {contains: 'api', mode: 'insensitive'}}
                    ]
                },
                {taskMemberships: {some: {userId: 'assignee-1'}}},
                {taskMemberships: {some: {userId: 'leader-1', role: 'leader'}}}
            ]
        });

        expect(buildDeadlineWhere({
            groupId: 'group-1',
            userId: 'manager-1',
            membership: {role: 'manager'},
            query: {}
        })).toEqual({
            groupId: 'group-1'
        });

        expect(buildDeadlineWhere({
            groupId: 'group-1',
            userId: 'manager-1',
            membership: {role: 'manager'},
            query: {scope: 'mine'}
        })).toEqual({
            groupId: 'group-1',
            AND: [
                {taskMemberships: {some: {userId: 'manager-1'}}}
            ]
        });
    });

    test('builds summary counts, calendar days, and admin workload', () => {
        const tasks = [
            withDeadlineTaskMeta({
                dueDate: atLocalNoon(-1),
                progress: 20,
                priority: 'High',
                checklistItems: [],
                taskMemberships: [
                    {user: {id: 'user-1', username: 'Ada', email: 'ada@example.com'}}
                ]
            }),
            withDeadlineTaskMeta({
                dueDate: atLocalNoon(0),
                progress: 100,
                priority: 'Low',
                checklistItems: [],
                taskMemberships: [
                    {user: {id: 'user-1', username: 'Ada', email: 'ada@example.com'}},
                    {user: {id: 'user-2', username: 'Ben', email: 'ben@example.com'}}
                ]
            }),
            withDeadlineTaskMeta({
                dueDate: null,
                progress: 0,
                priority: 'Low',
                checklistItems: [],
                taskMemberships: [
                    {user: {id: 'user-2', username: 'Ben', email: 'ben@example.com'}}
                ]
            })
        ];

        const summary = buildDeadlineSummary({tasks, isAdmin: true});

        expect(summary.bucketCounts).toEqual({
            overdue: 1,
            today: 1,
            week: 0,
            later: 0,
            noDue: 1
        });
        expect(summary.statusCounts).toEqual({
            active: 2,
            done: 1
        });
        expect(summary.calendarDays).toContainEqual({
            date: '2026-06-10',
            total: 1,
            overdue: 0,
            done: 1
        });
        expect(summary.workloadByMember).toEqual([
            {
                userId: 'user-1',
                username: 'Ada',
                email: 'ada@example.com',
                total: 2,
                overdue: 1,
                dueThisWeek: 1,
                active: 1,
                done: 1
            },
            {
                userId: 'user-2',
                username: 'Ben',
                email: 'ben@example.com',
                total: 2,
                overdue: 0,
                dueThisWeek: 1,
                active: 1,
                done: 1
            }
        ]);
        expect(buildDeadlineSummary({tasks, isAdmin: false}).workloadByMember).toEqual([]);
    });

    test('builds my deadline summary for today and overdue buckets', () => {
        const tasks = [
            withDeadlineTaskMeta({
                dueDate: atLocalNoon(-1),
                progress: 20,
                priority: 'High',
                checklistItems: []
            }),
            withDeadlineTaskMeta({
                dueDate: atLocalNoon(0),
                progress: 50,
                priority: 'Medium',
                checklistItems: []
            }),
            withDeadlineTaskMeta({
                dueDate: atLocalNoon(2),
                progress: 0,
                priority: 'Low',
                checklistItems: []
            }),
            withDeadlineTaskMeta({
                dueDate: atLocalNoon(-3),
                progress: 100,
                priority: 'Done',
                checklistItems: []
            })
        ];

        expect(buildMyDeadlineSummary({tasks})).toEqual({
            todayCount: 1,
            overdueCount: 1
        });
    });

    test('handles empty checklist items', () => {
        expect(withChecklistSummary({}).checklistSummary).toEqual({
            completed: 0,
            total: 0,
            percent: 0
        });
    });
});
