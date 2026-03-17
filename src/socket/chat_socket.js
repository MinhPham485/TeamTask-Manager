const jwt = require('jsonwebtoken');
const {PrismaClient} = require('@prisma/client');
const {ensureMembership, createGroupMessage} = require('../services/message_service');

const prisma = new PrismaClient();

const extractToken = (socket) => {
    if (socket.handshake?.auth?.token) {
        return socket.handshake.auth.token;
    }

    const authorization = socket.handshake?.headers?.authorization;

    if (!authorization) {
        return null;
    }

    const [scheme, token] = authorization.split(' ');

    if (scheme !== 'Bearer' || !token) {
        return null;
    }

    return token;
};

module.exports = (io) => {
    io.use((socket, next) => {
        const token = extractToken(socket);

        if (!token) {
            return next(new Error('Unauthorized: No token provided'));
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'SECRET_KEY');
            socket.user = decoded;
            next();
        } catch (error) {
            next(new Error('Unauthorized: Invalid token'));
        }
    });

    io.on('connection', (socket) => {
        socket.on('chat:join-group', async (payload, callback) => {
            try {
                const groupId = payload?.groupId;

                if (!groupId) {
                    if (callback) callback({ok: false, error: 'Group ID is required'});
                    return;
                }

                const hasAccess = await ensureMembership(prisma, socket.user.userId, groupId);

                if (!hasAccess) {
                    if (callback) callback({ok: false, error: 'You are not a member of this group'});
                    return;
                }

                socket.join(`group:${groupId}`);

                if (callback) callback({ok: true, groupId});
            } catch (error) {
                if (callback) callback({ok: false, error: error.message});
            }
        });

        socket.on('chat:leave-group', (payload, callback) => {
            const groupId = payload?.groupId;

            if (!groupId) {
                if (callback) callback({ok: false, error: 'Group ID is required'});
                return;
            }

            socket.leave(`group:${groupId}`);

            if (callback) callback({ok: true, groupId});
        });

        socket.on('chat:send-message', async (payload, callback) => {
            try {
                const result = await createGroupMessage({
                    prisma,
                    userId: socket.user.userId,
                    groupId: payload?.groupId,
                    content: payload?.content
                });

                if (result.error) {
                    if (callback) callback({ok: false, error: result.error});
                    return;
                }

                const {message} = result;

                io.to(`group:${message.groupId}`).emit('chat:message:new', message);

                if (callback) callback({ok: true, message});
            } catch (error) {
                if (callback) callback({ok: false, error: error.message});
            }
        });
    });
};
