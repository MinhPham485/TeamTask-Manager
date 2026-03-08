const {PrismaClient} = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

exports.createGroup = async (req, res) => {
    try {
        const {name} = req.body;
        const groupCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const group = await prisma.group.create({
            data: {
                name,
                groupCode,
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
        const {groupCode} = req.body;
        const group = await prisma.group.findUnique({where: {groupCode}});
        if (!group) return res.status(404).json({error: 'Group not found'});
        
        // Check if user is already a member
        const existingMember = await prisma.groupMember.findUnique({
            where: {
                userId_groupId: {
                    userId: req.user.userId,
                    groupId: group.id
                }
            }
        });
        
        if (existingMember) {
            return res.status(400).json({error: 'You are already a member of this group'});
        }
        
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
        const groups = await prisma.groupMember.findMany({
            where: {
                userId: req.user.userId
            },
            include: {
                group: true
            }
        });
        res.json(groups);
    } catch (error) {
        res.status(500).json({error: 'Failed to fetch groups'});
    }
};

exports.getGroupById = async (req, res) => {
    try {
        const {id} = req.params;
        const group = await prisma.group.findUnique({
            where: {id},
            include: {
                members: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                username: true,
                                email: true
                            }
                        }
                    }
                },
                tasks: true
            }
        });
        if (!group) return res.status(404).json({error: 'Group not found'});
        res.json(group);
    } catch (error) {
        res.status(500).json({error: 'Failed to fetch group'});
    }
};

exports.getGroupMembers = async (req, res) => {
    try {
        const {id} = req.params;
        const members = await prisma.groupMember.findMany({
            where: {groupId: id},
            include: {
                user: {
                    select: {
                        id: true,
                        username: true,
                        email: true
                    }
                }
            }
        });
        res.json(members);
    }
    catch (error) {
        res.status(500).json({error: 'Failed to fetch group members'});
    }
};