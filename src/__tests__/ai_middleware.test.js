const {
    validateAskQuestion,
    rateLimitAskQuestion,
    __resetAiRateLimitForTests
} = require('../middlewares/ai_middleware');

const createMockResponse = () => {
    const res = {
        statusCode: 200,
        body: null,
        headers: {}
    };

    res.status = jest.fn((code) => {
        res.statusCode = code;
        return res;
    });

    res.json = jest.fn((payload) => {
        res.body = payload;
        return res;
    });

    res.set = jest.fn((key, value) => {
        res.headers[key] = value;
        return res;
    });

    return res;
};

describe('ai_middleware', () => {
    beforeEach(() => {
        __resetAiRateLimitForTests();
        process.env.AI_MAX_QUESTION_CHARS = '20';
        process.env.AI_RATE_LIMIT_PER_MINUTE = '2';
    });

    test('validateAskQuestion should reject non-string question', () => {
        const req = {body: {question: 123}};
        const res = createMockResponse();
        const next = jest.fn();

        validateAskQuestion(req, res, next);

        expect(res.statusCode).toBe(400);
        expect(res.body.error.code).toBe('INVALID_REQUEST');
        expect(next).not.toHaveBeenCalled();
    });

    test('validateAskQuestion should normalize valid input', () => {
        const req = {body: {question: '  hello ai  '}};
        const res = createMockResponse();
        const next = jest.fn();

        validateAskQuestion(req, res, next);

        expect(req.ai.question).toBe('hello ai');
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('rateLimitAskQuestion should return 429 when limit exceeded', () => {
        const req = {
            user: {userId: 'u1'},
            params: {groupId: 'g1'}
        };
        const res = createMockResponse();
        const next = jest.fn();

        rateLimitAskQuestion(req, res, next);
        rateLimitAskQuestion(req, res, next);
        rateLimitAskQuestion(req, res, next);

        expect(next).toHaveBeenCalledTimes(2);
        expect(res.statusCode).toBe(429);
        expect(res.body.error.code).toBe('RATE_LIMITED');
        expect(res.headers['Retry-After']).toBeDefined();
    });
});
