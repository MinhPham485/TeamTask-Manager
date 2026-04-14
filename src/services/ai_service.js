const {PrismaClient} = require('@prisma/client');
const {buildGroupContext} = require('./context_service');

const prisma = new PrismaClient();
const DEFAULT_MODEL = 'llama-3.1-8b-instant';

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
        groupId
    });

    if (contextResult.error) {
        return {
            error: contextResult.error,
            status: contextResult.status
        };
    }

    const {apiKey, model} = getProviderConfig();
    const groupName = contextResult.data.groupName || 'this group';

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

    const contextText = contextResult.data.contextText;
    const metrics = contextResult.data.metrics;
    const unfinishedTaskTitles = (contextResult.data.tasks || [])
        .filter((task) => !task.isDone)
        .slice(0, 5)
        .map((task) => task.title);

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
