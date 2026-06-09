const {PrismaClient} = require('@prisma/client');
const {buildGroupContext} = require('./context_service');

const prisma = new PrismaClient();
const DEFAULT_MODEL = 'llama-3.1-8b-instant';
const PRIORITY_ORDER = ['High', 'Medium', 'Low', 'Done'];

const isAiFeatureEnabled = () => {
    const value = String(process.env.AI_FEATURE_ENABLED || 'false').toLowerCase();
    return value === 'true' || value === '1' || value === 'yes';
};

const canUseMockWithoutKey = () => {
    const value = String(process.env.AI_ALLOW_MOCK_WHEN_NO_KEY || 'false').toLowerCase();
    return value === 'true' || value === '1' || value === 'yes';
};

const extractAnswerText = (payload) => {
    const content = payload?.choices?.[0]?.message?.content;

    if (typeof content !== 'string') {
        return null;
    }

    const text = content.trim();

    return text || null;
};

const getProviderConfig = () => {
    return {
        apiKey: process.env.GROQ_API_KEY,
        model: process.env.GROQ_MODEL || DEFAULT_MODEL
    };
};

const callGroqProvider = async ({apiKey, model, prompt}) => {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            messages: [
                {
                    role: 'system',
                    content: 'You are TeamTask Assistant. Reply with concise and practical guidance.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ]
        })
    });

    if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        return {
            error: {
                code: 'AI_PROVIDER_ERROR',
                message: errorPayload?.error?.message || 'Groq request failed'
            },
            status: 502
        };
    }

    const payload = await response.json();
    const answer = extractAnswerText(payload);

    if (!answer) {
        return {
            error: {
                code: 'AI_EMPTY_RESPONSE',
                message: 'AI provider returned empty answer'
            },
            status: 502
        };
    }

    return {
        data: {
            answer,
            suggestions: []
        },
        status: 200
    };
};

const buildMockResponse = ({groupName, question, groupId, userId, questionLength}) => {
    return {
        data: {
            answer: `Demo mode is enabled for ${groupName}. Your question was: "${question}". Add GROQ_API_KEY to get real model responses.`,
            suggestions: [
                'Set GROQ_API_KEY in backend env',
                'Ask for overdue and unassigned tasks',
                'Ask for a short action plan for this week'
            ],
            meta: {
                groupId,
                userId,
                questionLength,
                source: 'mock-no-key',
                model: 'none'
            }
        },
        status: 200
    };
};

const isUnfinishedCountQuestion = (question) => {
    const normalized = String(question || '').trim().toLowerCase();

    if (!normalized) {
        return false;
    }

    const asksHowMany = normalized.includes('bao nhieu') || normalized.includes('how many') || normalized.includes('so luong');
    const asksUnfinished =
        normalized.includes('chua xong') ||
        normalized.includes('chua hoan thanh') ||
        normalized.includes('not done') ||
        normalized.includes('unfinished') ||
        normalized.includes('pending');

    return asksHowMany && asksUnfinished;
};

const normalizeText = (value) => {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
};

const pickReferencedTask = (question, tasks = []) => {
    const normalizedQuestion = normalizeText(question);

    if (!normalizedQuestion || tasks.length === 0) {
        return null;
    }

    const exactMatch = tasks.find((task) => {
        const normalizedTitle = normalizeText(task.title);
        return normalizedTitle && normalizedQuestion.includes(normalizedTitle);
    });

    if (exactMatch) {
        return exactMatch;
    }

    const asksThisTask =
        normalizedQuestion.includes('task nay') ||
        normalizedQuestion.includes('task nay la') ||
        normalizedQuestion.includes('task nay ai') ||
        normalizedQuestion.includes('this task');

    if (asksThisTask && tasks.length === 1) {
        return tasks[0];
    }

    return null;
};

const asksTaskAssignee = (question) => {
    const normalizedQuestion = normalizeText(question);

    return (
        normalizedQuestion.includes('ai lam') ||
        normalizedQuestion.includes('nguoi lam') ||
        normalizedQuestion.includes('who is assigned') ||
        normalizedQuestion.includes('assignee')
    );
};

const asksTaskDescription = (question) => {
    const normalizedQuestion = normalizeText(question);

    return normalizedQuestion.includes('mo ta') || normalizedQuestion.includes('description');
};

const asksTaskCreator = (question) => {
    const normalizedQuestion = normalizeText(question);

    return (
        normalizedQuestion.includes('nguoi tao') ||
        normalizedQuestion.includes('created by') ||
        normalizedQuestion.includes('creator')
    );
};

const formatTaskList = (tasks, formatter) => {
    if (tasks.length === 0) {
        return '';
    }

    return tasks.slice(0, 5).map(formatter).join('; ');
};

const asksPriorityQuestion = (question) => {
    const normalizedQuestion = normalizeText(question);

    return (
        normalizedQuestion.includes('priority') ||
        normalizedQuestion.includes('priorities') ||
        normalizedQuestion.includes('uu tien') ||
        normalizedQuestion.includes('high priority') ||
        normalizedQuestion.includes('highest priority')
    );
};

const getRequestedPriority = (question) => {
    const normalizedQuestion = normalizeText(question);

    if (normalizedQuestion.includes('high') || normalizedQuestion.includes('cao')) {
        return 'High';
    }

    if (normalizedQuestion.includes('medium') || normalizedQuestion.includes('trung binh')) {
        return 'Medium';
    }

    if (normalizedQuestion.includes('low') || normalizedQuestion.includes('thap')) {
        return 'Low';
    }

    if (normalizedQuestion.includes('done') || normalizedQuestion.includes('xong') || normalizedQuestion.includes('hoan thanh')) {
        return 'Done';
    }

    return null;
};

const buildPriorityAnswer = ({question, tasks, groupId, userId}) => {
    if (!asksPriorityQuestion(question)) {
        return null;
    }

    const requestedPriority = getRequestedPriority(question);
    const targetPriority = requestedPriority || PRIORITY_ORDER.find((priority) => tasks.some((task) => task.priority === priority)) || 'High';
    const matchingTasks = tasks.filter((task) => task.priority === targetPriority);
    const details = formatTaskList(
        matchingTasks,
        (task) => `${task.title} (${task.progress}% progress, ${task.listName})`
    );

    const answer = details
        ? `${targetPriority} priority tasks: ${details}.`
        : `No ${targetPriority} priority tasks found in this group.`;

    return {
        data: {
            answer,
            suggestions: [],
            meta: {
                groupId,
                userId,
                questionLength: question.length,
                source: 'rule-based-priority',
                model: 'none'
            }
        },
        status: 200
    };
};

const asksProgressQuestion = (question) => {
    const normalizedQuestion = normalizeText(question);

    return (
        normalizedQuestion.includes('progress') ||
        normalizedQuestion.includes('percent') ||
        normalizedQuestion.includes('percentage') ||
        normalizedQuestion.includes('%') ||
        normalizedQuestion.includes('phan tram') ||
        normalizedQuestion.includes('tien do')
    );
};

const extractProgressThreshold = (question) => {
    const match = String(question || '').match(/(?:over|above|more than|greater than|>=|at least|tren|hon|tu)\s*(\d{1,3})\s*%?/i);

    if (!match) {
        return null;
    }

    const threshold = Number(match[1]);

    if (!Number.isInteger(threshold)) {
        return null;
    }

    return Math.max(0, Math.min(100, threshold));
};

const buildProgressAnswer = ({question, tasks, groupId, userId}) => {
    if (!asksProgressQuestion(question)) {
        return null;
    }

    const threshold = extractProgressThreshold(question);
    const sortedTasks = [...tasks].sort((firstTask, secondTask) => secondTask.progress - firstTask.progress);
    const matchingTasks = threshold === null
        ? sortedTasks
        : sortedTasks.filter((task) => task.progress >= threshold);

    const details = formatTaskList(
        matchingTasks,
        (task) => `${task.title} (${task.progress}%, ${task.priority} priority, ${task.listName})`
    );

    const answer = details
        ? threshold === null
            ? `Highest progress tasks: ${details}.`
            : `Tasks at or above ${threshold}% progress: ${details}.`
        : threshold === null
            ? 'No tasks with progress data found in this group.'
            : `No tasks found at or above ${threshold}% progress.`;

    return {
        data: {
            answer,
            suggestions: [],
            meta: {
                groupId,
                userId,
                questionLength: question.length,
                source: 'rule-based-progress',
                model: 'none'
            }
        },
        status: 200
    };
};

const asksGroupSummaryQuestion = (question) => {
    const normalizedQuestion = normalizeText(question);

    return (
        normalizedQuestion.includes('summary') ||
        normalizedQuestion.includes('summarize') ||
        normalizedQuestion.includes('overview') ||
        normalizedQuestion.includes('group overview') ||
        normalizedQuestion.includes('dashboard summary') ||
        normalizedQuestion.includes('tom tat') ||
        normalizedQuestion.includes('tom luoc') ||
        normalizedQuestion.includes('tong hop') ||
        normalizedQuestion.includes('tong ket') ||
        normalizedQuestion.includes('tong quan')
    );
};

const getAverageProgress = (tasks) => {
    if (tasks.length === 0) {
        return 0;
    }

    const totalProgress = tasks.reduce((total, task) => total + task.progress, 0);

    return Math.round(totalProgress / tasks.length);
};

const countByPriority = (tasks) => {
    return PRIORITY_ORDER.reduce((result, priority) => {
        result[priority] = tasks.filter((task) => task.priority === priority).length;
        return result;
    }, {});
};

const pickFocusTask = (tasks) => {
    return tasks.find((task) => task.priority === 'High' && !task.isDone)
        || tasks.find((task) => !task.isDone)
        || tasks[0]
        || null;
};

const pickFollowUpTask = (tasks) => {
    const today = new Date();
    const overdueTask = tasks.find((task) => task.dueDate !== 'none' && new Date(task.dueDate) < today && !task.isDone);

    return overdueTask
        || tasks.find((task) => task.assignee === 'unassigned' && !task.isDone)
        || null;
};

const pickNearCompletionTask = (tasks) => {
    return [...tasks]
        .filter((task) => !task.isDone)
        .sort((firstTask, secondTask) => secondTask.progress - firstTask.progress)[0] || null;
};

const buildGroupSummaryAnswer = ({question, groupName, metrics, tasks, groupId, userId}) => {
    if (!asksGroupSummaryQuestion(question)) {
        return null;
    }

    const priorityCounts = countByPriority(tasks);
    const averageProgress = getAverageProgress(tasks);
    const nearCompletionCount = tasks.filter((task) => task.progress >= 80 && !task.isDone).length;
    const earlyProgressCount = tasks.filter((task) => task.progress < 30 && !task.isDone).length;
    const focusTask = pickFocusTask(tasks);
    const followUpTask = pickFollowUpTask(tasks);
    const nearCompletionTask = pickNearCompletionTask(tasks);

    const answer = [
        `Group Summary: ${groupName}`,
        '',
        'Overview',
        `- Total tasks: ${metrics.totalTasks}`,
        `- Done: ${metrics.doneTasks}`,
        `- Unfinished: ${metrics.unfinishedTasks}`,
        `- Overdue: ${metrics.overdueUnfinishedTasks}`,
        `- Unassigned: ${metrics.unassignedUnfinishedTasks}`,
        '',
        'Priority Focus',
        `- High: ${priorityCounts.High || 0} tasks`,
        `- Medium: ${priorityCounts.Medium || 0} tasks`,
        `- Low: ${priorityCounts.Low || 0} tasks`,
        `- Done priority: ${priorityCounts.Done || 0} tasks`,
        '',
        'Progress',
        `- Average progress: ${averageProgress}%`,
        `- Near completion: ${nearCompletionCount} tasks at 80%+`,
        `- Stuck/early: ${earlyProgressCount} tasks under 30%`,
        '',
        'Recommended Next Steps',
        `1. Focus on: ${focusTask ? `${focusTask.title} (${focusTask.priority}, ${focusTask.progress}%)` : 'No task available'}`,
        `2. Follow up on: ${followUpTask ? `${followUpTask.title} (${followUpTask.assignee}, due ${followUpTask.dueDate})` : 'No overdue or unassigned task found'}`,
        `3. Move forward: ${nearCompletionTask ? `${nearCompletionTask.title} (${nearCompletionTask.progress}% complete)` : 'No active task found'}`
    ].join('\n');

    return {
        data: {
            answer,
            suggestions: [],
            meta: {
                groupId,
                userId,
                questionLength: question.length,
                source: 'rule-based-group-summary',
                model: 'none'
            }
        },
        status: 200
    };
};

const buildTaskDetailAnswer = ({question, tasks, groupId, userId}) => {
    const needsAssignee = asksTaskAssignee(question);
    const needsDescription = asksTaskDescription(question);
    const needsCreator = asksTaskCreator(question);

    if (!needsAssignee && !needsDescription && !needsCreator) {
        return null;
    }

    const referencedTask = pickReferencedTask(question, tasks);

    if (!referencedTask) {
        const suggestions = tasks.slice(0, 5).map((task) => task.title).join(', ');
        return {
            data: {
                answer: suggestions
                    ? `Khong xac dinh duoc task cu the. Thu ghi ro ten task, vi du: ${suggestions}.`
                    : 'Khong co task de doi chieu. Hay tao task hoac chi ro group/task can hoi.',
                suggestions: [],
                meta: {
                    groupId,
                    userId,
                    questionLength: question.length,
                    source: 'rule-based-task-detail',
                    model: 'none'
                }
            },
            status: 200
        };
    }

    const chunks = [];

    if (needsAssignee) {
        chunks.push(`Nguoi lam "${referencedTask.title}": ${referencedTask.assignee || 'unassigned'}.`);
    }

    if (needsDescription) {
        chunks.push(`Mo ta "${referencedTask.title}": ${referencedTask.description || 'Khong co mo ta'}.`);
    }

    if (needsCreator) {
        chunks.push(`Nguoi tao "${referencedTask.title}": ${referencedTask.creator || 'unknown'}.`);
    }

    return {
        data: {
            answer: chunks.join(' '),
            suggestions: [],
            meta: {
                groupId,
                userId,
                questionLength: question.length,
                source: 'rule-based-task-detail',
                model: 'none'
            }
        },
        status: 200
    };
};

const askGroupAssistant = async ({groupId, userId, question}) => {
    if (!isAiFeatureEnabled()) {
        return {
            error: {
                code: 'AI_DISABLED',
                message: 'AI assistant is currently disabled'
            },
            status: 503
        };
    }

    const contextResult = await buildGroupContext({
        prisma,
        groupId,
        userId
    });

    if (contextResult.error) {
        return {
            error: contextResult.error,
            status: contextResult.status
        };
    }

    const groupName = contextResult.data.groupName || 'this group';
    const contextText = contextResult.data.contextText;
    const metrics = contextResult.data.metrics;
    const tasks = contextResult.data.tasks || [];
    const unfinishedTaskTitles = (contextResult.data.tasks || [])
        .filter((task) => !task.isDone)
        .slice(0, 5)
        .map((task) => task.title);

    const taskDetailResult = buildTaskDetailAnswer({
        question,
        tasks,
        groupId,
        userId
    });

    if (taskDetailResult) {
        return taskDetailResult;
    }

    const groupSummaryResult = buildGroupSummaryAnswer({
        question,
        groupName,
        metrics,
        tasks,
        groupId,
        userId
    });

    if (groupSummaryResult) {
        return groupSummaryResult;
    }

    const priorityResult = buildPriorityAnswer({
        question,
        tasks,
        groupId,
        userId
    });

    if (priorityResult) {
        return priorityResult;
    }

    const progressResult = buildProgressAnswer({
        question,
        tasks,
        groupId,
        userId
    });

    if (progressResult) {
        return progressResult;
    }

    if (isUnfinishedCountQuestion(question)) {
        const details = unfinishedTaskTitles.length ? ` Top: ${unfinishedTaskTitles.join(', ')}.` : '';

        return {
            data: {
                answer: `Chua hoan thanh: ${metrics.unfinishedTasks}/${metrics.totalTasks} task.${details}`,
                suggestions: [],
                meta: {
                    groupId,
                    userId,
                    questionLength: question.length,
                    source: 'rule-based',
                    model: 'none'
                }
            },
            status: 200
        };
    }

    const {apiKey, model} = getProviderConfig();

    if (!apiKey) {
        if (!canUseMockWithoutKey()) {
            return {
                error: {
                    code: 'AI_NOT_CONFIGURED',
                    message: 'GROQ_API_KEY is not configured'
                },
                status: 503
            };
        }

        return buildMockResponse({
            groupName,
            question,
            groupId,
            userId,
            questionLength: question.length
        });
    }

    const prompt = [
        'You are TeamTask Assistant.',
        'Rules: answer in max 3 short sentences, use exact numbers from context, do not guess, if missing data then say not enough data.',
        `Group ID: ${groupId}`,
        `User ID: ${userId}`,
        'Context from project data:',
        contextText,
        `Question: ${question}`
    ].join('\n');

    try {
        const providerResult = await callGroqProvider({
            apiKey,
            model,
            prompt
        });

        if (providerResult.error) {
            return providerResult;
        }

        return {
            data: {
                answer: providerResult.data.answer,
                suggestions: [],
                meta: {
                    groupId,
                    userId,
                    questionLength: question.length,
                    source: 'groq',
                    model
                }
            },
            status: 200
        };
    } catch (error) {
        return {
            error: {
                code: 'AI_PROVIDER_ERROR',
                message: error.message || 'Failed to contact AI provider'
            },
            status: 502
        };
    }
};

const askGeneralAssistant = async ({userId, question}) => {
    if (!isAiFeatureEnabled()) {
        return {
            error: {
                code: 'AI_DISABLED',
                message: 'AI assistant is currently disabled'
            },
            status: 503
        };
    }

    const {apiKey, model} = getProviderConfig();

    if (!apiKey) {
        if (!canUseMockWithoutKey()) {
            return {
                error: {
                    code: 'AI_NOT_CONFIGURED',
                    message: 'GROQ_API_KEY is not configured'
                },
                status: 503
            };
        }

        return buildMockResponse({
            groupName: 'general mode',
            question,
            groupId: null,
            userId,
            questionLength: question.length
        });
    }

    const prompt = [
        'You are TeamTask Assistant.',
        'General mode: user did not specify a valid group context.',
        'Rules: answer in max 3 short sentences, give practical steps, do not fabricate project-specific numbers.',
        `User ID: ${userId}`,
        `Question: ${question}`
    ].join('\n');

    try {
        const providerResult = await callGroqProvider({
            apiKey,
            model,
            prompt
        });

        if (providerResult.error) {
            return providerResult;
        }

        return {
            data: {
                answer: providerResult.data.answer,
                suggestions: [],
                meta: {
                    groupId: null,
                    userId,
                    questionLength: question.length,
                    source: 'groq-general',
                    model
                }
            },
            status: 200
        };
    } catch (error) {
        return {
            error: {
                code: 'AI_PROVIDER_ERROR',
                message: error.message || 'Failed to contact AI provider'
            },
            status: 502
        };
    }
};

module.exports = {
    askGroupAssistant,
    askGeneralAssistant,
    isAiFeatureEnabled
};
