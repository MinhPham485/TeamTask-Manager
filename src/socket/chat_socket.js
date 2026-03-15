const jwt = require('jsonwebtoken');
const {PrismaClient} = require('@prisma/client');

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

                const hasAccess = await ensureMembership(socket.user.userId, groupId);

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
                const groupId = payload?.groupId;
                const content = payload?.content;

                if (!groupId || typeof content !== 'string') {
                    if (callback) callback({ok: false, error: 'Group ID and content are required'});
                    return;
                }

                const normalizedContent = content.trim();

                if (!normalizedContent) {
                    if (callback) callback({ok: false, error: 'Content must not be empty'});
                    return;
                }

                if (normalizedContent.length > 2000) {
                    if (callback) callback({ok: false, error: 'Content exceeds 2000 characters'});
                    return;
                }

                const hasAccess = await ensureMembership(socket.user.userId, groupId);

                if (!hasAccess) {
                    if (callback) callback({ok: false, error: 'You are not a member of this group'});
                    return;
                }

                const message = await prisma.message.create({
                    data: {
                        groupId,
                        content: normalizedContent,
                        senderId: socket.user.userId
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

                io.to(`group:${groupId}`).emit('chat:message:new', message);

                if (callback) callback({ok: true, message});
            } catch (error) {
                if (callback) callback({ok: false, error: error.message});
            }
        });
    });
};
