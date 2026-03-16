const {PrismaClient} = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

const ensureMembership = async (userId, groupId) => {
    const membership = await prisma.groupMember.findUnique({
        where: {
            userId_groupId: {
                userId,
                groupId
            }
        },
        select: {
            id: true
        }
    });

    return Boolean(membership);
};

exports.createMessage = async (req, res) => {
    try {
        const {groupId, content} = req.body;

        if (!groupId || typeof content !== 'string') {
            return res.status(400).json({error: 'Group ID and content are required'});
        }

        const normalizedContent = content.trim();

        if (!normalizedContent) {
            return res.status(400).json({error: 'Content must not be empty'});
        }

        if (normalizedContent.length > 2000) {
            return res.status(400).json({error: 'Content exceeds 2000 characters'});
        }

        const hasAccess = await ensureMembership(req.user.userId, groupId);

        if (!hasAccess) {
            return res.status(403).json({error: 'You are not a member of this group'});
        }

        const message = await prisma.message.create({
            data: {
                groupId,
                content: normalizedContent,
                senderId: req.user.userId
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        username: true,
                        email: true
                    }
                }
            }
        });

        const io = req.app.get('io');

        if (io) {
            io.to(`group:${groupId}`).emit('chat:message:new', message);
        }

        res.status(201).json(message);
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.getMessagesByGroup = async (req, res) => {
    try {
        const {groupId} = req.params;
        const hasAccess = await ensureMembership(req.user.userId, groupId);

        if (!hasAccess) {
            return res.status(403).json({error: 'You are not a member of this group'});
        }

        const messages = await prisma.message.findMany({
            where: {groupId},
            orderBy: [
                {createdAt: 'asc'}
            ],
            include: {
                sender: {
                    select: {
                        id: true,
                        username: true,
                        email: true
                    }
                }
            }
        });

        res.json(messages);
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.deleteMessage = async (req, res) => {
    try {
        const {id} = req.params;
        const message = await prisma.message.findUnique({
            where: {id},
            select: {
                id: true,
                groupId: true,
                senderId: true
            }
        });

        if (!message) {
            return res.status(404).json({error: 'Message not found'});
        }

        const hasAccess = await ensureMembership(req.user.userId, message.groupId);

        if (!hasAccess) {
            return res.status(403).json({error: 'You are not a member of this group'});
        }

        if (message.senderId !== req.user.userId) {
            return res.status(403).json({error: 'Only sender can delete this message'});
        }

        await prisma.message.delete({
            where: {id}
        });

        const io = req.app.get('io');

        if (io) {
            io.to(`group:${message.groupId}`).emit('chat:message:deleted', {id});
        }

        res.json({message: 'Message deleted successfully'});
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};
