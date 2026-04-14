const {askGroupAssistant} = require('../services/ai_service');
const {PrismaClient} = require('@prisma/client');

const prisma = new PrismaClient();

const resolveUserGroupId = async ({userId, requestedGroupId}) => {
    if (requestedGroupId) {
        const membership = await prisma.groupMember.findUnique({
            where: {
                userId_groupId: {
                    userId,
                    groupId: requestedGroupId
                }
            },
            select: {
                groupId: true
            }
        });

        if (membership?.groupId) {
            return membership.groupId;
        }
    }

    const firstMembership = await prisma.groupMember.findFirst({
        where: {
            userId
        },
        orderBy: {
            id: 'asc'
        },
        select: {
            groupId: true
        }
    });

    return firstMembership?.groupId || null;
};

exports.askAssistant = async (req, res) => {
    try {
        const groupId = await resolveUserGroupId({
            userId: req.user.userId,
            requestedGroupId: req.body?.groupId || null
        });

        if (!groupId) {
            return res.status(400).json({
                error: {
                    code: 'GROUP_REQUIRED',
                    message: 'You need to join at least one group before using AI assistant'
                }
            });
        }

        const result = await askGroupAssistant({
            groupId,
            userId: req.user.userId,
            question: req.ai.question
        });

        if (result.error) {
            return res.status(result.status || 500).json({error: result.error});
        }

        return res.status(result.status || 200).json(result.data);
    } catch (error) {
        return res.status(500).json({
            error: {
                code: 'AI_INTERNAL_ERROR',
                message: 'Unable to process AI request'
            }
        });
    }
};

exports.askGroupAssistant = async (req, res) => {
    try {
        const result = await askGroupAssistant({
            groupId: req.params.groupId,
            userId: req.user.userId,
            question: req.ai.question
        });

        if (result.error) {
            return res.status(result.status || 500).json({error: result.error});
        }

        return res.status(result.status || 200).json(result.data);
    } catch (error) {
        return res.status(500).json({
            error: {
                code: 'AI_INTERNAL_ERROR',
                message: 'Unable to process AI request'
            }
        });
    }
};
