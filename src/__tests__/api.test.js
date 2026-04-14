const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');

describe('API smoke tests', () => {
    test('GET / should return API health message', async () => {
        const response = await request(app).get('/');

        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual({ message: 'API in running' });
    });

    test('GET /health should return backend status', async () => {
        const response = await request(app).get('/health');

        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty('status', 'ok');
        expect(response.body).toHaveProperty('service', 'backend');
        expect(response.body).toHaveProperty('timestamp');
    });

    test('GET /api/health should return backend status', async () => {
        const response = await request(app).get('/api/health');

        expect(response.statusCode).toBe(200);
        expect(response.body).toHaveProperty('status', 'ok');
        expect(response.body).toHaveProperty('service', 'backend');
        expect(response.body).toHaveProperty('timestamp');
    });

    test('GET /api/auth/profile without token should return 401', async () => {
        const response = await request(app).get('/api/auth/profile');

        expect(response.statusCode).toBe(401);
        expect(response.body).toHaveProperty('error');
    });

    test('GET /api/tasks/group/:groupId without token should return 401', async () => {
        const response = await request(app).get('/api/tasks/group/test-group-id');

        expect(response.statusCode).toBe(401);
        expect(response.body).toHaveProperty('error');
    });

    test('POST /api/ai/group/:groupId/ask without token should return 401', async () => {
        const response = await request(app)
            .post('/api/ai/group/test-group-id/ask')
            .send({question: 'Summarize tasks'});

        expect(response.statusCode).toBe(401);
        expect(response.body).toHaveProperty('error');
    });

    test('POST /api/ai/ask without token should return 401', async () => {
        const response = await request(app)
            .post('/api/ai/ask')
            .send({question: 'How many unfinished tasks?'});

        expect(response.statusCode).toBe(401);
        expect(response.body).toHaveProperty('error');
    });

    test('POST /api/ai/group/:groupId/ask with invalid question should return 400', async () => {
        const token = jwt.sign(
            {userId: 'test-user-id'},
            process.env.JWT_SECRET || 'SECRET_KEY'
        );

        const response = await request(app)
            .post('/api/ai/group/test-group-id/ask')
            .set('Authorization', `Bearer ${token}`)
            .send({question: '   '});

        expect(response.statusCode).toBe(400);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toHaveProperty('code', 'INVALID_REQUEST');
    });
});
