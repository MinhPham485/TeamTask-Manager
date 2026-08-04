const { getJwtSecret } = require('../config/auth_config');

describe('JWT configuration', () => {
    test('rejects a missing JWT secret', () => {
        expect(() => getJwtSecret({})).toThrow('JWT_SECRET must be set');
    });

    test('rejects the insecure Compose placeholder', () => {
        expect(() => getJwtSecret({ JWT_SECRET: 'change-me-in-real-usage' }))
            .toThrow('JWT_SECRET must be set');
    });

    test('returns the configured secret', () => {
        expect(getJwtSecret({ JWT_SECRET: 'test-secret-for-jwt-config' }))
            .toBe('test-secret-for-jwt-config');
    });
});
