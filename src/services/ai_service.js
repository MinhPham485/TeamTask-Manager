const {PrismaClient} = require('@prisma/client');
const {buildGroupContext} = require('./context_service');

const prisma = new PrismaClient();

const isAiFeatureEnabled = () => {
    const value = String(process.env.AI_FEATURE_ENABLED || 'false').toLowerCase();
    return value === 'true' || value === '1' || value === 'yes';
};

const canUseMockWithoutKey = () => {
    const value = String(process.env.AI_ALLOW_MOCK_WHEN_NO_KEY || 'false').toLowerCase();
    return value === 'true' || value === '1' || value === 'yes';
};

const extractAnswerText = (payload) => {
    const parts = payload?.candidates?.[0]?.content?.parts;

    if (!Array.isArray(parts)) {
        return null;
    }

    const text = parts
        .map((part) => (typeof part?.text === 'string' ? part.text : ''))
        .join('')
        .trim();

    return text || null;
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

    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const groupName = contextResult.data.groupName || 'this group';

    if (!apiKey) {
        if (!canUseMockWithoutKey()) {
            return {
                error: {
                    code: 'AI_NOT_CONFIGURED',
                    message: 'GEMINI_API_KEY is not configured'
                },
                status: 503
            };
        }

        return {
            data: {
                answer: `Demo mode is enabled for ${groupName}. Your question was: "${question}". Add GEMINI_API_KEY to get real model responses.`,
                suggestions: [
                    'Set GEMINI_API_KEY in backend env',
                    'Ask for overdue and unassigned tasks',
                    'Ask for a short action plan for this week'
                ],
                meta: {
                    groupId,
                    userId,
                    questionLength: question.length,
                    source: 'mock-no-key',
                    model: 'none'
                }
            },
            status: 200
        };
    }

    const contextText = contextResult.data.contextText;

    const prompt = [
        'You are TeamTask Assistant. Reply with concise and practical guidance.',
        `Group ID: ${groupId}`,
        `User ID: ${userId}`,
        'Context from project data:',
        contextText,
        `Question: ${question}`
    ].join('\n');

    try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                text: prompt
                            }
                        ]
                    }
                ]
            })
        });

        if (!response.ok) {
            const errorPayload = await response.json().catch(() => ({}));
            return {
                error: {
                    code: 'AI_PROVIDER_ERROR',
                    message: errorPayload?.error?.message || 'Gemini request failed'
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
                suggestions: [],
                meta: {
                    groupId,
                    userId,
                    questionLength: question.length,
                    source: 'gemini',
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
    isAiFeatureEnabled
};
