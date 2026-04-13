const parseMaxQuestionChars = () => {
    const raw = Number(process.env.AI_MAX_QUESTION_CHARS || 800);

    if (!Number.isFinite(raw) || raw <= 0) {
        return 800;
    }

    return Math.floor(raw);
};

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const requestBuckets = new Map();

const parseRateLimitPerMinute = () => {
    const raw = Number(process.env.AI_RATE_LIMIT_PER_MINUTE || 20);

    if (!Number.isFinite(raw) || raw < 0) {
        return 20;
    }

    return Math.floor(raw);
};

const pruneExpiredBuckets = (now) => {
    if (requestBuckets.size < 1000) {
        return;
    }

    for (const [key, bucket] of requestBuckets.entries()) {
        if (now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
            requestBuckets.delete(key);
        }
    }
};

const validateAskQuestion = (req, res, next) => {
    const {question} = req.body || {};
    const maxQuestionChars = parseMaxQuestionChars();

    if (typeof question !== 'string') {
        return res.status(400).json({
            error: {
                code: 'INVALID_REQUEST',
                message: 'Question is required and must be a string'
            }
        });
    }

    const normalizedQuestion = question.trim();

    if (!normalizedQuestion) {
        return res.status(400).json({
            error: {
                code: 'INVALID_REQUEST',
                message: 'Question must not be empty'
            }
        });
    }

    if (normalizedQuestion.length > maxQuestionChars) {
        return res.status(400).json({
            error: {
                code: 'INVALID_REQUEST',
                message: `Question exceeds ${maxQuestionChars} characters`
            }
        });
    }

    req.ai = {
        question: normalizedQuestion
    };

    next();
};

const rateLimitAskQuestion = (req, res, next) => {
    const limitPerMinute = parseRateLimitPerMinute();

    if (limitPerMinute <= 0) {
        return next();
    }

    const userId = req.user?.userId;
    const groupId = req.params?.groupId;

    if (!userId || !groupId) {
        return next();
    }

    const now = Date.now();
    const key = `${userId}:${groupId}`;
    const existingBucket = requestBuckets.get(key);

    pruneExpiredBuckets(now);

    if (!existingBucket || now - existingBucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
        requestBuckets.set(key, {
            count: 1,
            windowStart: now
        });

        return next();
    }

    if (existingBucket.count >= limitPerMinute) {
        const retryAfterSeconds = Math.max(
            1,
            Math.ceil((RATE_LIMIT_WINDOW_MS - (now - existingBucket.windowStart)) / 1000)
        );

        res.set('Retry-After', String(retryAfterSeconds));

        return res.status(429).json({
            error: {
                code: 'RATE_LIMITED',
                message: 'Too many AI requests. Please try again later.'
            }
        });
    }

    existingBucket.count += 1;
    requestBuckets.set(key, existingBucket);

    return next();
};

const __resetAiRateLimitForTests = () => {
    requestBuckets.clear();
};

module.exports = {
    validateAskQuestion,
    rateLimitAskQuestion,
    __resetAiRateLimitForTests
};
