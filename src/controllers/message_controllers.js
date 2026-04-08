const {PrismaClient} = require('@prisma/client');
require('dotenv').config();
const {
    ensureMembership,
    createGroupMessage,
    getOrCreateDirectThread,
    listDirectThreads,
    listDirectMessagesByThread,
    createDirectMessage
} = require('../services/message_service');

const prisma = new PrismaClient();

exports.createMessage = async (req, res) => {
    try {
        const {groupId, content} = req.body;

        const result = await createGroupMessage({
            prisma,
            userId: req.user.userId,
            groupId,
            content
        });

        if (result.error) {
            return res.status(result.status).json({error: result.error});
        }

        const {message} = result;

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
        const hasAccess = await ensureMembership(prisma, req.user.userId, groupId);

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

        const hasAccess = await ensureMembership(prisma, req.user.userId, message.groupId);

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

exports.getDirectThreads = async (req, res) => {
    try {
        const threads = await listDirectThreads({
            prisma,
            userId: req.user.userId
        });

        res.json(threads);
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.createOrGetDirectThread = async (req, res) => {
    try {
        const result = await getOrCreateDirectThread({
            prisma,
            userId: req.user.userId,
            peerUserId: req.body?.peerUserId
        });

        if (result.error) {
            return res.status(result.status).json({error: result.error});
        }

        res.status(201).json(result.thread);
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.getDirectMessagesByThread = async (req, res) => {
    try {
        const result = await listDirectMessagesByThread({
            prisma,
            userId: req.user.userId,
            threadId: req.params.threadId
        });

        if (result.error) {
            return res.status(result.status).json({error: result.error});
        }

        res.json(result.messages);
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.createDirectMessage = async (req, res) => {
    try {
        const result = await createDirectMessage({
            prisma,
            userId: req.user.userId,
            threadId: req.body?.threadId,
            recipientId: req.body?.recipientId,
            content: req.body?.content
        });

        if (result.error) {
            return res.status(result.status).json({error: result.error});
        }

        const io = req.app.get('io');

        if (io) {
            io.to(`direct:${result.threadId}`).emit('chat:direct-message:new', result.message);
        }

        res.status(201).json({
            threadId: result.threadId,
            message: result.message
        });
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};
