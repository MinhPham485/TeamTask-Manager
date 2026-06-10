const {isGroupAdmin} = require('./task_permission_service');

const startOfToday = () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
};

const startOfTomorrow = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow;
};

const endOfNext7Days = () => {
    const next7Days = new Date();
    next7Days.setDate(next7Days.getDate() + 7);
    next7Days.setHours(23, 59, 59, 999);
    return next7Days;
};

const isTaskDone = (task) => {
    return task.priority === 'Done' || task.progress === 100;
};

const getDaysOverdue = (task) => {
    if (!task.dueDate || isTaskDone(task)) {
        return 0;
    }

    const dueDate = new Date(task.dueDate);
    const today = startOfToday();

    if (dueDate >= today) {
        return 0;
    }

    const dueDay = new Date(dueDate);
    dueDay.setHours(0, 0, 0, 0);

    return Math.floor((today - dueDay) / (1000 * 60 * 60 * 24));
};

const getDeadlineBucket = (task) => {
    if (!task.dueDate) {
        return 'noDue';
    }

    const dueDate = new Date(task.dueDate);
    const today = startOfToday();
    const tomorrow = startOfTomorrow();
    const next7DaysEnd = endOfNext7Days();

    if (dueDate < today && !isTaskDone(task)) {
        return 'overdue';
    }

    if (dueDate >= today && dueDate < tomorrow) {
        return 'today';
    }

    if (dueDate >= tomorrow && dueDate <= next7DaysEnd) {
        return 'week';
    }

    return 'later';
};

const withDeadlineMeta = (task) => {
    const daysOverdue = getDaysOverdue(task);

    return {
        ...task,
        deadlineBucket: getDeadlineBucket(task),
        isOverdue: daysOverdue > 0,
        daysOverdue
    };
};

const withChecklistSummary = (task) => {
    const checklistItems = task.checklistItems ?? [];
    const completed = checklistItems.filter((item) => item.isCompleted).length;
    const total = checklistItems.length;

    return {
        ...task,
        checklistSummary: {
            completed,
            total,
            percent: total > 0 ? Math.round((completed / total) * 100) : 0
        }
    };
};

const withDeadlineTaskMeta = (task) => {
    return withDeadlineMeta(withChecklistSummary(task));
};

const toDateKey = (date) => {
    const value = new Date(date);
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
};

const getCurrentMonthDateKeys = () => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const dateKeys = [];

    for (let date = new Date(firstDay); date <= lastDay; date.setDate(date.getDate() + 1)) {
        dateKeys.push(toDateKey(date));
    }

    return dateKeys;
};

const buildDeadlineWhere = ({groupId, userId, membership, query}) => {
    const {
        scope = 'all',
        assigneeId,
        leaderId,
        priority,
        search
    } = query;
    const admin = isGroupAdmin(membership);
    const andFilters = [];

    if (!admin || scope === 'mine') {
        andFilters.push({
            taskMemberships: {
                some: {
                    userId
                }
            }
        });
    }

    if (priority) {
        andFilters.push({
            priority
        });
    }

    if (search) {
        andFilters.push({
            OR: [
                {
                    title: {
                        contains: search,
                        mode: 'insensitive'
                    }
                },
                {
                    description: {
                        contains: search,
                        mode: 'insensitive'
                    }
                }
            ]
        });
    }

    if (assigneeId) {
        andFilters.push({
            taskMemberships: {
                some: {
                    userId: assigneeId
                }
            }
        });
    }

    if (leaderId) {
        andFilters.push({
            taskMemberships: {
                some: {
                    userId: leaderId,
                    role: 'leader'
                }
            }
        });
    }

    return {
        groupId,
        ...(andFilters.length > 0 ? {AND: andFilters} : {})
    };
};

const buildDeadlineSummary = ({tasks, isAdmin}) => {
    const bucketCounts = {
        overdue: 0,
        today: 0,
        week: 0,
        later: 0,
        noDue: 0
    };
    const statusCounts = {
        active: 0,
        done: 0
    };
    const calendarDayMap = getCurrentMonthDateKeys().reduce((accumulator, dateKey) => {
        accumulator[dateKey] = {
            date: dateKey,
            total: 0,
            overdue: 0,
            done: 0
        };
        return accumulator;
    }, {});
    const workloadMap = new Map();

    tasks.forEach((task) => {
        bucketCounts[task.deadlineBucket] += 1;

        if (isTaskDone(task)) {
            statusCounts.done += 1;
        } else {
            statusCounts.active += 1;
        }

        if (task.dueDate) {
            const dueDateKey = toDateKey(task.dueDate);
            const calendarDay = calendarDayMap[dueDateKey];

            if (calendarDay) {
                calendarDay.total += 1;

                if (task.isOverdue) {
                    calendarDay.overdue += 1;
                }

                if (isTaskDone(task)) {
                    calendarDay.done += 1;
                }
            }
        }

        if (isAdmin) {
            (task.taskMemberships ?? []).forEach((membershipItem) => {
                const user = membershipItem.user;

                if (!user) {
                    return;
                }

                if (!workloadMap.has(user.id)) {
                    workloadMap.set(user.id, {
                        userId: user.id,
                        username: user.username,
                        email: user.email,
                        total: 0,
                        overdue: 0,
                        dueThisWeek: 0,
                        active: 0,
                        done: 0
                    });
                }

                const workload = workloadMap.get(user.id);
                workload.total += 1;

                if (task.deadlineBucket === 'overdue') {
                    workload.overdue += 1;
                }

                if (task.deadlineBucket === 'today' || task.deadlineBucket === 'week') {
                    workload.dueThisWeek += 1;
                }

                if (isTaskDone(task)) {
                    workload.done += 1;
                } else {
                    workload.active += 1;
                }
            });
        }
    });

    return {
        bucketCounts,
        calendarDays: Object.values(calendarDayMap),
        statusCounts,
        workloadByMember: isAdmin
            ? [...workloadMap.values()].sort((first, second) => second.total - first.total || first.username.localeCompare(second.username))
            : []
    };
};

module.exports = {
    buildDeadlineSummary,
    buildDeadlineWhere,
    getDeadlineBucket,
    getDaysOverdue,
    isTaskDone,
    toDateKey,
    withChecklistSummary,
    withDeadlineMeta,
    withDeadlineTaskMeta
};
