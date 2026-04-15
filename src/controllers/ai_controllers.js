const {askGroupAssistant, askGeneralAssistant} = require('../services/ai_service');
const {handleAiActionIntent} = require('../services/ai_action_service');
const {PrismaClient} = require('@prisma/client');

const prisma = new PrismaClient();

const normalizeText = (value) => String(value || '').trim().toLowerCase();

const resolveMentionedGroupId = ({question, memberships}) => {
    const normalizedQuestion = normalizeText(question);

    if (!normalizedQuestion) {
        return null;
    }

    for (const membership of memberships) {
        const groupCode = normalizeText(membership.group?.groupCode);

        if (groupCode && normalizedQuestion.includes(groupCode)) {
            return membership.groupId;
        }
    }

    for (const membership of memberships) {
        const groupName = normalizeText(membership.group?.name);

        if (groupName && normalizedQuestion.includes(groupName)) {
            return membership.groupId;
        }
    }

    return null;
};

const resolveUserGroupId = async ({userId, requestedGroupId, question}) => {
    const memberships = await prisma.groupMember.findMany({
        where: {
            userId
        },
        select: {
            groupId: true,
            group: {
                select: {
                    name: true,
                    groupCode: true
                }
            }
        }
    });

    if (requestedGroupId) {
        const membership = memberships.find((item) => item.groupId === requestedGroupId);

        if (membership?.groupId) {
            return membership.groupId;
        }
    }

    const mentionedGroupId = resolveMentionedGroupId({
        question,
        memberships
    });

    if (mentionedGroupId) {
        return mentionedGroupId;
    }

    return memberships[0]?.groupId || null;
};

exports.askAssistant = async (req, res) => {
    try {
        const actionResult = await handleAiActionIntent({
            userId: req.user.userId,
            question: req.ai.question,
            requestedGroupId: req.body?.groupId || null
        });

        if (actionResult) {
            if (actionResult.error) {
                return res.status(actionResult.status || 500).json({error: actionResult.error});
            }

            return res.status(actionResult.status || 200).json(actionResult.data);
        }

        const groupId = await resolveUserGroupId({
            userId: req.user.userId,
            requestedGroupId: req.body?.groupId || null,
            question: req.ai.question
        });

        if (!groupId) {
            const result = await askGeneralAssistant({
                userId: req.user.userId,
                question: req.ai.question
            });

            if (result.error) {
                return res.status(result.status || 500).json({error: result.error});
            }

            return res.status(result.status || 200).json(result.data);
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
