require('dotenv').config();

const INSECURE_JWT_SECRETS = new Set([
    'SECRET_KEY',
    'change-me-in-real-usage',
]);

const getJwtSecret = (env = process.env) => {
    const secret = env.JWT_SECRET?.trim();

    if (!secret || INSECURE_JWT_SECRETS.has(secret)) {
        throw new Error('JWT_SECRET must be set to a non-default value');
    }

    return secret;
};

module.exports = { getJwtSecret };
