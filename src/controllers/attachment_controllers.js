const {PrismaClient} = require('@prisma/client');
const {uploadConfig} = require('./upload_controllers');

const prisma = new PrismaClient();
const MAX_MESSAGE_LENGTH = 2000;

const ensureGroupMember = async (userId, groupId) => {
    const membership = await prisma.groupMember.findUnique({
        where: {
            userId_groupId: {
                userId,
                groupId
            }
        },
        select: {id: true}
    });

    return Boolean(membership);
};

const validateAttachmentPayload = ({fileName, mimeType, size, url, key}) => {
    if (!fileName || typeof fileName !== 'string') {
        return 'File name is required';
    }

    if (!mimeType || !uploadConfig.ALLOWED_MIME_TYPES.has(mimeType)) {
        return 'File type is not allowed';
    }

    if (!Number.isInteger(size) || size <= 0 || size > uploadConfig.MAX_FILE_SIZE) {
        return 'File size is invalid or too large';
    }

    if (!url || typeof url !== 'string') {
        return 'File URL is required';
    }

    if (!key || typeof key !== 'string') {
        return 'File key is required';
    }

    return null;
};

exports.createTaskAttachment = async (req, res) => {
    try {
        const taskId = req.params.id;
        const task = req.task || await prisma.task.findUnique({
            where: {id: taskId},
            select: {id: true, groupId: true}
        });

        if (!task) {
            return res.status(404).json({error: 'Task not found'});
        }

        const payloadError = validateAttachmentPayload(req.body || {});

        if (payloadError) {
            return res.status(400).json({error: payloadError});
        }

        const attachment = await prisma.attachment.create({
            data: {
                fileName: req.body.fileName,
                mimeType: req.body.mimeType,
                size: req.body.size,
                url: req.body.url,
                key: req.body.key,
                taskId: task.id,
                uploaderId: req.user.userId
            }
        });

        res.status(201).json(attachment);
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.getTaskAttachments = async (req, res) => {
    try {
        const taskId = req.params.id;
        const task = req.task || await prisma.task.findUnique({
            where: {id: taskId},
            select: {id: true, groupId: true}
        });

        if (!task) {
            return res.status(404).json({error: 'Task not found'});
        }

        const attachments = await prisma.attachment.findMany({
            where: {taskId: task.id},
            orderBy: {createdAt: 'asc'}
        });

        res.json(attachments);
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.createMessageWithAttachment = async (req, res) => {
    try {
        const {groupId, content, fileName, mimeType, size, url, key} = req.body || {};

        if (!groupId) {
            return res.status(400).json({error: 'Group ID is required'});
        }

        const hasAccess = await ensureGroupMember(req.user.userId, groupId);

        if (!hasAccess) {
            return res.status(403).json({error: 'You are not a member of this group'});
        }

        const payloadError = validateAttachmentPayload({fileName, mimeType, size, url, key});

        if (payloadError) {
            return res.status(400).json({error: payloadError});
        }

        const normalizedContent = typeof content === 'string' ? content.trim() : '';
        const finalContent = normalizedContent || fileName;

        if (!finalContent) {
            return res.status(400).json({error: 'Message content is required'});
        }

        if (finalContent.length > MAX_MESSAGE_LENGTH) {
            return res.status(400).json({error: `Content exceeds ${MAX_MESSAGE_LENGTH} characters`});
        }

        const message = await prisma.message.create({
            data: {
                content: finalContent,
                groupId,
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

        const attachment = await prisma.attachment.create({
            data: {
                fileName,
                mimeType,
                size,
                url,
                key,
                messageId: message.id,
                uploaderId: req.user.userId
            }
        });

        const responsePayload = {
            ...message,
            attachments: [attachment]
        };

        const io = req.app.get('io');

        if (io) {
            io.to(`group:${groupId}`).emit('chat:message:new', responsePayload);
        }

        res.status(201).json(responsePayload);
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.getMessageAttachments = async (req, res) => {
    try {
        const messageId = req.params.id;
        const message = await prisma.message.findUnique({
            where: {id: messageId},
            select: {id: true, groupId: true}
        });

        if (!message) {
            return res.status(404).json({error: 'Message not found'});
        }

        const hasAccess = await ensureGroupMember(req.user.userId, message.groupId);

        if (!hasAccess) {
            return res.status(403).json({error: 'You are not a member of this group'});
        }

        const attachments = await prisma.attachment.findMany({
            where: {messageId},
            orderBy: {createdAt: 'asc'}
        });

        res.json(attachments);
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};
