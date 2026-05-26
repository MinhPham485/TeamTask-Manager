const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const {
    generateResetCode,
    getResetConfig,
    hashResetCode,
    sendPasswordResetEmail,
} = require('../services/password_reset_service');
require('dotenv').config();

const prisma = new PrismaClient();

const isDatabaseUnavailable = (error) => {
    const message = typeof error?.message === 'string' ? error.message : '';
    return message.includes("Can't reach database server") || error?.name === 'PrismaClientInitializationError';
};

const normalizeAuthPayload = (payload = {}) => {
    const username = typeof payload.username === 'string' ? payload.username.trim() : '';
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    const password = typeof payload.password === 'string' ? payload.password : '';

    return { username, email, password };
};

exports.register = async (req, res) => {
    try {
        const { username, email, password } = normalizeAuthPayload(req.body);

        if (!username || !email || !password) {
            return res.status(400).json({ error: 'username, email and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                username,
                email,
                password: hashedPassword
            },
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                createdAt: true
            }
        });
        res.json(user);
    } catch (error) {
        if (isDatabaseUnavailable(error)) {
            return res.status(503).json({ error: 'Database is unavailable. Please start PostgreSQL and try again.' });
        }

        if (error.code === 'P2002') {
            const duplicatedField = Array.isArray(error.meta?.target) ? error.meta.target[0] : 'field';
            return res.status(409).json({ error: `${duplicatedField} already exists` });
        }

        res.status(500).json({ error: 'Registration failed' });
    }
};

exports.login = async (req, res) => {
    try {
        const { username, password } = normalizeAuthPayload(req.body);

        if (!username || !password) {
            return res.status(400).json({ error: 'username and password are required' });
        }

        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) return res.status(404).json({ error: 'User not found' });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Wrong password' });
        const token = jwt.sign(
            {
                userId: user.id,
                role: user.role
            },
            process.env.JWT_SECRET || "SECRET_KEY",
            { expiresIn: '1h' }
        );
        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                createdAt: user.createdAt
            }
        });
    }
    catch (error) {
        if (isDatabaseUnavailable(error)) {
            return res.status(503).json({ error: 'Database is unavailable. Please start PostgreSQL and try again.' });
        }

        res.status(500).json({ error: 'Login failed' });
    }
};
exports.getAllUsers = async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                createdAt: true
            }
        });
        res.json(users);
    } catch (error) {
        if (isDatabaseUnavailable(error)) {
            return res.status(503).json({ error: 'Database is unavailable. Please start PostgreSQL and try again.' });
        }

        res.status(500).json({ error: 'Failed to fetch users' });
    }
};

exports.getProfile = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.userId },
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                createdAt: true,
                phone: true,
                hometown: true,
                bio: true,
                avatarUrl: true
            }
        });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (error) {
        if (isDatabaseUnavailable(error)) {
            return res.status(503).json({ error: 'Database is unavailable. Please start PostgreSQL and try again.' });
        }

        res.status(500).json({ error: 'Failed to fetch profile' });
    }
};

exports.forgotPassword = async (req, res) => {
    try {
        const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';

        if (!email) {
            return res.status(400).json({ error: 'email is required' });
        }

        const user = await prisma.user.findUnique({ where: { email } });
        const safeResponse = { message: 'If the email exists, a reset code has been sent.' };

        if (!user) {
            return res.json(safeResponse);
        }

        const now = new Date();
        if (user.passwordResetResendAt && user.passwordResetResendAt > now) {
            return res.json(safeResponse);
        }

        const { expiresMinutes, resendCooldownSeconds } = getResetConfig();
        const code = generateResetCode();
        const codeHash = hashResetCode(code);
        const expiresAt = new Date(now.getTime() + expiresMinutes * 60 * 1000);
        const resendAt = new Date(now.getTime() + resendCooldownSeconds * 1000);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                passwordResetCodeHash: codeHash,
                passwordResetExpiresAt: expiresAt,
                passwordResetAttempts: 0,
                passwordResetResendAt: resendAt,
                passwordResetConsumedAt: null,
            },
        });

        await sendPasswordResetEmail({
            toEmail: user.email,
            username: user.username,
            code,
            expiresMinutes,
        });

        res.json(safeResponse);
    } catch (error) {
        if (isDatabaseUnavailable(error)) {
            return res.status(503).json({ error: 'Database is unavailable. Please start PostgreSQL and try again.' });
        }

        if (error?.code === 'SMTP_NOT_CONFIGURED') {
            return res.status(500).json({ error: 'Email service is not configured' });
        }

        res.status(500).json({ error: 'Failed to send reset code' });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
        const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

        if (!email || !code || !newPassword) {
            return res.status(400).json({ error: 'email, code and newPassword are required' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(400).json({ error: 'Invalid or expired code' });
        }

        const now = new Date();
        const { maxAttempts } = getResetConfig();

        if (user.passwordResetConsumedAt) {
            return res.status(400).json({ error: 'Invalid or expired code' });
        }

        if (!user.passwordResetCodeHash || !user.passwordResetExpiresAt) {
            return res.status(400).json({ error: 'Invalid or expired code' });
        }

        if (user.passwordResetAttempts >= maxAttempts) {
            return res.status(400).json({ error: 'Invalid or expired code' });
        }

        if (user.passwordResetExpiresAt < now) {
            return res.status(400).json({ error: 'Invalid or expired code' });
        }

        const incomingHash = hashResetCode(code);
        if (incomingHash !== user.passwordResetCodeHash) {
            await prisma.user.update({
                where: { id: user.id },
                data: { passwordResetAttempts: { increment: 1 } },
            });
            return res.status(400).json({ error: 'Invalid or expired code' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                passwordResetCodeHash: null,
                passwordResetExpiresAt: null,
                passwordResetAttempts: 0,
                passwordResetResendAt: null,
                passwordResetConsumedAt: now,
            },
        });

        res.json({ message: 'Password reset successful' });
    } catch (error) {
        if (isDatabaseUnavailable(error)) {
            return res.status(503).json({ error: 'Database is unavailable. Please start PostgreSQL and try again.' });
        }

        res.status(500).json({ error: 'Password reset failed' });
    }
};
exports.updateProfile = async (req, res) => {
    try {
        const data = {};

        if (typeof req.body.phone === 'string') {
            data.phone = req.body.phone.trim() || null;
        }

        if (typeof req.body.hometown === 'string') {
            data.hometown = req.body.hometown.trim() || null;
        }

        if (typeof req.body.bio === 'string') {
            data.bio = req.body.bio.trim() || null;
        }
        const user = await prisma.user.update({
            where: { id: req.user.userId },
            data,
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                createdAt: true,
                phone: true,
                hometown: true,
                bio: true,
                avatarUrl: true
            },

        });
        res.json(user);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update profile' });
    }
}

exports.changePassword = async (req, res) => {
    try {
        const currentPassword = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
        const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'currentPassword and newPassword are required' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters' });
        }
        const user = await prisma.user.findUnique({ where: { id: req.user.userId } });

        if (!user)
            return res.status(404).json({ error: 'User not found' });

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch)
            return res.status(400).json({ error: 'Current password is incorrect' });

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: user.id },
            data: { password: hashedPassword },
        });

        res.json({ message: 'Password changed successfully' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to change password' });
    }
}