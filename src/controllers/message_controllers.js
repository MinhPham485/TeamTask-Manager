const {PrismaClient} = require('@prisma/client');
require('dotenv').config();
const {ensureMembership, createGroupMessage} = require('../services/message_service');

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
