const {PrismaClient} = require('@prisma/client');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
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
        const {username, email, password} = normalizeAuthPayload(req.body);

        if (!username || !email || !password) {
            return res.status(400).json({error: 'username, email and password are required'});
        }

        if (password.length < 6) {
            return res.status(400).json({error: 'Password must be at least 6 characters'});
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
            return res.status(503).json({error: 'Database is unavailable. Please start PostgreSQL and try again.'});
        }

        if (error.code === 'P2002') {
            const duplicatedField = Array.isArray(error.meta?.target) ? error.meta.target[0] : 'field';
            return res.status(409).json({error: `${duplicatedField} already exists`});
        }

        res.status(500).json({error: 'Registration failed'});
    }
};

exports.login = async (req, res) => {
    try {
        const {username, password} = normalizeAuthPayload(req.body);

        if (!username || !password) {
            return res.status(400).json({error: 'username and password are required'});
        }

        const user = await prisma.user.findUnique({where: {username}});
        if (!user) return res.status(404).json({error: 'User not found'});
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({error: 'Wrong password'});
        const token = jwt.sign(
            {
                userId: user.id,
                role: user.role
            },
            process.env.JWT_SECRET || "SECRET_KEY",
            {expiresIn: '1h'}
        );
        res.json({token});
    }
        catch (error) {
            if (isDatabaseUnavailable(error)) {
                return res.status(503).json({error: 'Database is unavailable. Please start PostgreSQL and try again.'});
            }

            res.status(500).json({error: 'Login failed'});
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
            return res.status(503).json({error: 'Database is unavailable. Please start PostgreSQL and try again.'});
        }

        res.status(500).json({error: 'Failed to fetch users'});
    }
};

exports.getProfile = async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: {id: req.user.userId},
            select: {
                id: true, 
                username: true, 
                email: true,
                role: true,
                createdAt: true,
            }
        });
        if (!user) return res.status(404).json({error: 'User not found'});
        res.json(user);
    } catch (error) {
        if (isDatabaseUnavailable(error)) {
            return res.status(503).json({error: 'Database is unavailable. Please start PostgreSQL and try again.'});
        }

        res.status(500).json({error: 'Failed to fetch profile'});
    }
};

