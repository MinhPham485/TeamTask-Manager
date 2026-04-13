const isAiFeatureEnabled = () => {
    const value = String(process.env.AI_FEATURE_ENABLED || 'false').toLowerCase();
    return value === 'true' || value === '1' || value === 'yes';
};

const parseRequestTimeoutMs = () => {
    const raw = Number(process.env.AI_REQUEST_TIMEOUT_MS || 30000);

    if (!Number.isFinite(raw) || raw <= 0) {
        return 30000;
    }

    return Math.floor(raw);
};

const parseRetryCount = () => {
    const raw = Number(process.env.AI_RETRY_COUNT || 1);

    if (!Number.isFinite(raw) || raw < 0) {
        return 1;
    }

    return Math.floor(raw);
};

const extractResponseText = (payload) => {
    if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
        return payload.output_text.trim();
    }

    if (Array.isArray(payload?.output)) {
        for (const item of payload.output) {
            if (!Array.isArray(item?.content)) {
                continue;
            }

            for (const content of item.content) {
                if (content?.type === 'output_text' && typeof content?.text === 'string' && content.text.trim()) {
                    return content.text.trim();
                }
            }
        }
    }

    const choiceContent = payload?.choices?.[0]?.message?.content;

    if (typeof choiceContent === 'string' && choiceContent.trim()) {
        return choiceContent.trim();
    }

    return null;
};

const buildPromptInput = ({groupId, question}) => {
    return [
        {
            role: 'system',
            content: 'You are TeamTask Assistant. Give concise, actionable answers for project coordination and task management.'
        },
        {
            role: 'user',
            content: `Group ID: ${groupId}\nQuestion: ${question}`
        }
    ];
};

const callOpenAiResponses = async ({apiKey, model, timeoutMs, input}) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                input
            }),
            signal: controller.signal
        });

        if (!response.ok) {
            const errorPayload = await response.json().catch(() => ({}));
            const providerMessage = errorPayload?.error?.message || 'OpenAI request failed';
            const error = new Error(providerMessage);
            error.statusCode = response.status;
            throw error;
        }

        return response.json();
    } finally {
        clearTimeout(timeoutId);
    }
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

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        return {
            error: {
                code: 'AI_NOT_CONFIGURED',
                message: 'OPENAI_API_KEY is not configured'
            },
            status: 503
        };
    }

    const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
    const timeoutMs = parseRequestTimeoutMs();
    const retries = parseRetryCount();
    const input = buildPromptInput({groupId, question});

    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            const payload = await callOpenAiResponses({
                apiKey,
                model,
                timeoutMs,
                input
            });

            const answer = extractResponseText(payload);

            if (!answer) {
                return {
                    error: {
                        code: 'AI_EMPTY_RESPONSE',
                        message: 'AI provider returned an empty response'
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
                        source: 'openai',
                        model
                    }
                },
                status: 200
            };
        } catch (error) {
            lastError = error;

            if (attempt === retries) {
                break;
            }
        }
    }

    return {
        error: {
            code: 'AI_PROVIDER_ERROR',
            message: lastError?.message || 'Failed to get AI response'
        },
        status: 502
    };
};

module.exports = {
    askGroupAssistant,
    isAiFeatureEnabled
};
