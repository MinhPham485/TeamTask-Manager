const {askGroupAssistant} = require('../services/ai_service');

describe('ai_service', () => {
    const originalEnv = process.env;
    const originalFetch = global.fetch;

    beforeEach(() => {
        jest.resetAllMocks();
        process.env = {
            ...originalEnv,
            AI_FEATURE_ENABLED: 'true',
            OPENAI_API_KEY: 'test-key',
            OPENAI_MODEL: 'gpt-4.1-mini',
            AI_REQUEST_TIMEOUT_MS: '3000',
            AI_RETRY_COUNT: '1'
        };
    });

    afterAll(() => {
        process.env = originalEnv;
        global.fetch = originalFetch;
    });

    test('returns AI_DISABLED when feature flag is off', async () => {
        process.env.AI_FEATURE_ENABLED = 'false';

        const result = await askGroupAssistant({
            groupId: 'g1',
            userId: 'u1',
            question: 'Hello'
        });

        expect(result.status).toBe(503);
        expect(result.error.code).toBe('AI_DISABLED');
    });

    test('returns AI_NOT_CONFIGURED when api key is missing', async () => {
        delete process.env.OPENAI_API_KEY;

        const result = await askGroupAssistant({
            groupId: 'g1',
            userId: 'u1',
            question: 'Hello'
        });

        expect(result.status).toBe(503);
        expect(result.error.code).toBe('AI_NOT_CONFIGURED');
    });

    test('returns answer from OpenAI provider', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({output_text: 'Use daily standup notes.'})
        });

        const result = await askGroupAssistant({
            groupId: 'g1',
            userId: 'u1',
            question: 'Any suggestion?'
        });

        expect(result.status).toBe(200);
        expect(result.data.answer).toBe('Use daily standup notes.');
        expect(result.data.meta.source).toBe('openai');
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    test('retries provider request and succeeds', async () => {
        global.fetch = jest
            .fn()
            .mockRejectedValueOnce(new Error('temporary network issue'))
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({output_text: 'Retry worked.'})
            });

        const result = await askGroupAssistant({
            groupId: 'g1',
            userId: 'u1',
            question: 'Try again'
        });

        expect(result.status).toBe(200);
        expect(result.data.answer).toBe('Retry worked.');
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });
});
