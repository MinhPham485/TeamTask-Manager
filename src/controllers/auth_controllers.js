const {PrismaClient} = require('@prisma/client');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const prisma = new PrismaClient();

exports.register = async (req, res) => {
    try {
        const {username, email, password} = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                username,
                email,
                password: hashedPassword
            }
        });
        res.json(user);
    } catch (error) {
        res.status(500).json({error: 'Registration failed'});
    }
};

exports.login = async (req, res) => {
    try {
        const {username, password} = req.body;
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
            res.status(500).json({error: 'Login failed'});
        }
};
exports.getAllUsers = async (req, res) => {
    try {
        const users = await prisma.user.findMany();
        res.json(users);
    } catch (error) {
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
        res.status(500).json({error: 'Failed to fetch profile'});
    }
};

exports.createGroup = async (req, res) => {
    try {
        const {name} = req.body;
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        const group = await prisma.group.create({
            data: {
                name,
                code,
                ownerId: req.user.userId
            }
        });
        res.json(group);
    } catch (error) {
        res.status(500).json({error: 'Failed to create group'});
    }   
};

exports.joinGroup = async (req, res) => {
    try {
        const {code} = req.body;
        const group = await prisma.group.findUnique({where: {code}});
        if (!group) return res.status(404).json({error: 'Group not found'});
        await prisma.groupMember.create({
            data: {
                groupId: group.id,
                userId: req.user.userId,
                role: 'member'
            }
        });
        res.json({message: 'Joined group successfully'});
    }
    catch (error) {
        res.status(500).json({error: 'Failed to join group'});
    }
};

exports.getGroups = async (req, res) => {
    try {
        const groups = await prisma.group.findMany({
            where: {
                userID: req.user.userId
            },
            include: {
                group:true
            }
        });
        res.json(groups);
    } catch (error) {
        res.status(500).json({error: 'Failed to fetch groups'});
    }
};

