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
    createGroupMessage
};
