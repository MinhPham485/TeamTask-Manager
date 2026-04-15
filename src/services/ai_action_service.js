const {PrismaClient} = require('@prisma/client');

const prisma = new PrismaClient();

const normalizeText = (value) => {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
};

const toTitleCase = (value) => {
    return String(value || '')
        .split(' ')
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ')
        .trim();
};

const extractNameAfterMarker = (question, markers) => {
    const raw = String(question || '').trim();

    for (const marker of markers) {
        const index = normalizeText(raw).indexOf(marker);

        if (index < 0) {
            continue;
        }

        const extracted = raw.slice(index + marker.length).trim().replace(/^[:\-\s]+/, '').replace(/[.?!]+$/, '').trim();

        if (extracted) {
            return extracted;
        }
    }

    return null;
};

const parseCreateGroupIntent = (question) => {
    const normalized = normalizeText(question);
    const asksCreate = normalized.includes('tao') || normalized.includes('create');
    const asksGroup = normalized.includes('nhom') || normalized.includes('group');

    if (!asksCreate || !asksGroup) {
        return null;
    }

    const name = extractNameAfterMarker(question, [
        'ten ',
        'named ',
        'name '
    ]);

    if (!name) {
        return {
            type: 'create_group',
            missingName: true
        };
    }

    return {
        type: 'create_group',
        name: toTitleCase(name)
    };
};

const parseCreateListIntent = (question) => {
    const normalized = normalizeText(question);
    const asksCreate = normalized.includes('tao') || normalized.includes('create') || normalized.includes('them') || normalized.includes('add');
    const asksList = normalized.includes('list') || normalized.includes('cot') || normalized.includes('column');

    if (!asksCreate || !asksList) {
        return null;
    }

    const name = extractNameAfterMarker(question, [
        'ten ',
        'named ',
        'name '
    ]);

    if (!name) {
        return {
            type: 'create_list',
            missingName: true
        };
    }

    return {
        type: 'create_list',
        name: toTitleCase(name)
    };
};

const parseCreateTaskIntent = (question) => {
    const normalized = normalizeText(question);
    const asksCreate = normalized.includes('tao') || normalized.includes('create') || normalized.includes('them') || normalized.includes('add');
    const asksTask = normalized.includes('task') || normalized.includes('cong viec');

    if (!asksCreate || !asksTask) {
        return null;
    }

    const title = extractNameAfterMarker(question, [
        'ten ',
        'title ',
        'named ',
        'name '
    ]);

    if (!title) {
        return {
            type: 'create_task',
            missingName: true
        };
    }

    return {
        type: 'create_task',
        title: title.trim()
    };
};

const parseActionIntent = (question) => {
    return parseCreateGroupIntent(question) || parseCreateListIntent(question) || parseCreateTaskIntent(question);
};

const findGroupByQuestion = (question, memberships) => {
    const normalizedQuestion = normalizeText(question);

    for (const membership of memberships) {
        const groupCode = normalizeText(membership.group?.groupCode);

        if (groupCode && normalizedQuestion.includes(groupCode)) {
            return membership;
        }
    }

    for (const membership of memberships) {
        const groupName = normalizeText(membership.group?.name);

        if (groupName && normalizedQuestion.includes(groupName)) {
            return membership;
        }
    }

    return null;
};

const resolveTargetGroup = ({question, requestedGroupId, memberships}) => {
    if (requestedGroupId) {
        const exact = memberships.find((item) => item.groupId === requestedGroupId);

        if (exact) {
            return exact;
        }
    }

    const mentioned = findGroupByQuestion(question, memberships);

    if (mentioned) {
        return mentioned;
    }

    return memberships[0] || null;
};

const createGroupWithDefaults = async ({userId, groupName}) => {
    const groupCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    const group = await prisma.$transaction(async (transaction) => {
        const createdGroup = await transaction.group.create({
            data: {
                name: groupName,
                groupCode,
                ownerId: userId
            }
        });

        await transaction.groupMember.create({
            data: {
                groupId: createdGroup.id,
                userId,
                role: 'owner'
            }
        });

        await transaction.list.createMany({
            data: [
                { name: 'To Do', position: 0, groupId: createdGroup.id },
                { name: 'In Progress', position: 1, groupId: createdGroup.id },
                { name: 'Done', position: 2, groupId: createdGroup.id }
            ]
        });

        return createdGroup;
    });

    return {
        answer: `Da tao group "${group.name}" voi ma ${group.groupCode}.`,
        meta: {
            action: 'create_group',
            groupId: group.id,
            groupCode: group.groupCode
        }
    };
};

const createListInGroup = async ({groupId, listName}) => {
    const group = await prisma.group.findUnique({
        where: { id: groupId },
        select: {
            id: true,
            name: true
        }
    });

    if (!group) {
        return {
            error: {
                code: 'GROUP_NOT_FOUND',
                message: 'Khong tim thay group de tao list'
            },
            status: 404
        };
    }

    const lastList = await prisma.list.findFirst({
        where: { groupId },
        orderBy: {
            position: 'desc'
        },
        select: {
            position: true
        }
    });

    const createdList = await prisma.list.create({
        data: {
            groupId,
            name: listName,
            position: (lastList?.position ?? -1) + 1
        }
    });

    return {
        answer: `Da tao list "${createdList.name}" trong group "${group.name}".`,
        meta: {
            action: 'create_list',
            groupId,
            listId: createdList.id
        }
    };
};

const createTaskInGroup = async ({groupId, userId, title}) => {
    const targetList = await prisma.list.findFirst({
        where: { groupId },
        orderBy: [
            { position: 'asc' },
            { createdAt: 'asc' }
        ],
        select: {
            id: true,
            name: true
        }
    });

    if (!targetList) {
        return {
            error: {
                code: 'LIST_REQUIRED',
                message: 'Group chua co list de tao task'
            },
            status: 400
        };
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
            groupId,
            listId: targetList.id,
            position: (lastTask?.position ?? -1) + 1,
            createdBy: userId
        }
    });

    return {
        answer: `Da tao task "${task.title}" trong list "${targetList.name}".`,
        meta: {
            action: 'create_task',
            groupId,
            listId: targetList.id,
            taskId: task.id
        }
    };
};

const handleAiActionIntent = async ({userId, question, requestedGroupId}) => {
    const intent = parseActionIntent(question);

    if (!intent) {
        return null;
    }

    if (intent.missingName) {
        return {
            data: {
                answer: 'Minh can ten cu the de tao. Ban hay noi ro ten group/list/task.',
                suggestions: [],
                meta: {
                    source: 'ai-action',
                    action: intent.type,
                    status: 'missing-name'
                }
            },
            status: 200
        };
    }

    if (intent.type === 'create_group') {
        const created = await createGroupWithDefaults({
            userId,
            groupName: intent.name
        });

        return {
            data: {
                answer: created.answer,
                suggestions: [],
                meta: {
                    source: 'ai-action',
                    ...created.meta
                }
            },
            status: 200
        };
    }

    const memberships = await prisma.groupMember.findMany({
        where: {
            userId
        },
        select: {
            groupId: true,
            group: {
                select: {
                    id: true,
                    name: true,
                    groupCode: true
                }
            }
        }
    });

    const targetGroup = resolveTargetGroup({
        question,
        requestedGroupId,
        memberships
    });

    if (!targetGroup) {
        return {
            data: {
                answer: 'Ban chua co group nao. Hay tao group truoc, vi du: tao group ten Team ABC.',
                suggestions: [],
                meta: {
                    source: 'ai-action',
                    action: intent.type,
                    status: 'no-group'
                }
            },
            status: 200
        };
    }

    if (intent.type === 'create_list') {
        const created = await createListInGroup({
            groupId: targetGroup.groupId,
            listName: intent.name
        });

        if (created.error) {
            return created;
        }

        return {
            data: {
                answer: created.answer,
                suggestions: [],
                meta: {
                    source: 'ai-action',
                    ...created.meta
                }
            },
            status: 200
        };
    }

    if (intent.type === 'create_task') {
        const created = await createTaskInGroup({
            groupId: targetGroup.groupId,
            userId,
            title: intent.title
        });

        if (created.error) {
            return created;
        }

        return {
            data: {
                answer: created.answer,
                suggestions: [],
                meta: {
                    source: 'ai-action',
                    ...created.meta
                }
            },
            status: 200
        };
    }

    return null;
};

module.exports = {
    handleAiActionIntent
};
