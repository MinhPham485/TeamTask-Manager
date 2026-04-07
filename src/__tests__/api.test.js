const request = require('supertest');
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
});
