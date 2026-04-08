const MAX_MESSAGE_LENGTH = 2000;

const ensureMembership = async (prisma, userId, groupId) => {
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

const normalizeMessageContent = (content) => {
    if (typeof content !== 'string') {
        return null;
    }

    return content.trim();
};

const normalizeUserPair = (firstUserId, secondUserId) => {
    return [firstUserId, secondUserId].sort((a, b) => a.localeCompare(b));
};

const ensureUserExists = async (prisma, userId) => {
    const user = await prisma.user.findUnique({
        where: {id: userId},
        select: {id: true}
    });

    return Boolean(user);
};

const ensureDirectThreadAccess = async (prisma, userId, threadId) => {
    const thread = await prisma.directThread.findUnique({
        where: {id: threadId},
        select: {
            id: true,
            userAId: true,
            userBId: true
        }
    });

    if (!thread) {
        return {error: 'Thread not found', status: 404};
    }

    if (thread.userAId !== userId && thread.userBId !== userId) {
        return {error: 'You are not a participant of this thread', status: 403};
    }

    return {thread};
};

const getOrCreateDirectThread = async ({prisma, userId, peerUserId}) => {
    if (!peerUserId) {
        return {error: 'Peer user ID is required', status: 400};
    }

    if (peerUserId === userId) {
        return {error: 'Cannot create a direct thread with yourself', status: 400};
    }

    const peerExists = await ensureUserExists(prisma, peerUserId);

    if (!peerExists) {
        return {error: 'Peer user not found', status: 404};
    }

    const [userAId, userBId] = normalizeUserPair(userId, peerUserId);

    const thread = await prisma.directThread.upsert({
        where: {
            userAId_userBId: {
                userAId,
                userBId
            }
        },
        create: {
            userAId,
            userBId
        },
        update: {},
        include: {
            userA: {
                select: {
                    id: true,
                    username: true,
                    email: true
                }
            },
            userB: {
                select: {
                    id: true,
                    username: true,
                    email: true
                }
            }
        }
    });

    return {thread};
};

const listDirectThreads = async ({prisma, userId}) => {
    const threads = await prisma.directThread.findMany({
        where: {
            OR: [
                {userAId: userId},
                {userBId: userId}
            ]
        },
        orderBy: {
            updatedAt: 'desc'
        },
        include: {
            userA: {
                select: {
                    id: true,
                    username: true,
                    email: true
                }
            },
            userB: {
                select: {
                    id: true,
                    username: true,
                    email: true
                }
            },
            messages: {
                orderBy: {
                    createdAt: 'desc'
                },
                take: 1,
                include: {
                    sender: {
                        select: {
                            id: true,
                            username: true,
                            email: true
                        }
                    }
                }
            }
        }
    });

    return threads;
};

const listDirectMessagesByThread = async ({prisma, userId, threadId}) => {
    const access = await ensureDirectThreadAccess(prisma, userId, threadId);

    if (access.error) {
        return access;
    }

    const messages = await prisma.directMessage.findMany({
        where: {
            threadId
        },
        orderBy: {
            createdAt: 'asc'
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

    return {messages};
};

const createDirectMessage = async ({prisma, userId, threadId, recipientId, content}) => {
    const normalizedContent = normalizeMessageContent(content);

    if (normalizedContent === null) {
        return {error: 'Content is required', status: 400};
    }

    if (!normalizedContent) {
        return {error: 'Content must not be empty', status: 400};
    }

    if (normalizedContent.length > MAX_MESSAGE_LENGTH) {
        return {error: `Content exceeds ${MAX_MESSAGE_LENGTH} characters`, status: 400};
    }

    let resolvedThread = null;

    if (threadId) {
        const access = await ensureDirectThreadAccess(prisma, userId, threadId);

        if (access.error) {
            return access;
        }

        resolvedThread = access.thread;
    } else {
        const threadResult = await getOrCreateDirectThread({
            prisma,
            userId,
            peerUserId: recipientId
        });

        if (threadResult.error) {
            return threadResult;
        }

        resolvedThread = threadResult.thread;
    }

    const message = await prisma.directMessage.create({
        data: {
            threadId: resolvedThread.id,
            senderId: userId,
            content: normalizedContent
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

    await prisma.directThread.update({
        where: {id: resolvedThread.id},
        data: {
            updatedAt: new Date()
        }
    });

    return {
        message,
        threadId: resolvedThread.id
    };
};

const createGroupMessage = async ({prisma, userId, groupId, content}) => {
    if (!groupId) {
        return {error: 'Group ID is required', status: 400};
    }

    const normalizedContent = normalizeMessageContent(content);

    if (normalizedContent === null) {
        return {error: 'Content is required', status: 400};
    }

    if (!normalizedContent) {
        return {error: 'Content must not be empty', status: 400};
    }

    if (normalizedContent.length > MAX_MESSAGE_LENGTH) {
        return {error: `Content exceeds ${MAX_MESSAGE_LENGTH} characters`, status: 400};
    }

    const hasAccess = await ensureMembership(prisma, userId, groupId);

    if (!hasAccess) {
        return {error: 'You are not a member of this group', status: 403};
    }

    const message = await prisma.message.create({
        data: {
            groupId,
            content: normalizedContent,
            senderId: userId
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

    return {message};
};

module.exports = {
    MAX_MESSAGE_LENGTH,
    ensureMembership,
    createGroupMessage,
    getOrCreateDirectThread,
    listDirectThreads,
    listDirectMessagesByThread,
    createDirectMessage,
    ensureDirectThreadAccess
};
