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

const getTaskWithAccessCheck = async (taskId, userId) => {
    const task = await prisma.task.findUnique({
        where: {id: taskId},
        select: {
            id: true,
            groupId: true
        }
    });

    if (!task) {
        return {error: {status: 404, message: 'Task not found'}};
    }

    const hasAccess = await ensureMembership(userId, task.groupId);

    if (!hasAccess) {
        return {error: {status: 403, message: 'You do not have permission to access this task'}};
    }

    return {task};
};

const getCommentWithAccessCheck = async (commentId, userId) => {
    const comment = await prisma.taskComment.findUnique({
        where: {id: commentId},
        include: {
            task: {
                select: {
                    groupId: true
                }
            }
        }
    });

    if (!comment) {
        return {error: {status: 404, message: 'Comment not found'}};
    }

    const hasAccess = await ensureMembership(userId, comment.task.groupId);

    if (!hasAccess) {
        return {error: {status: 403, message: 'You do not have permission to access this comment'}};
    }

    return {comment};
};

exports.createComment = async (req, res) => {
    try {
        const {taskId, content} = req.body;

        if (!taskId || !content) {
            return res.status(400).json({error: 'Task ID and content are required'});
        }

        const taskResult = await getTaskWithAccessCheck(taskId, req.user.userId);

        if (taskResult.error) {
            return res.status(taskResult.error.status).json({error: taskResult.error.message});
        }

        const comment = await prisma.taskComment.create({
            data: {
                taskId,
                content,
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

        res.status(201).json(comment);
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.getCommentsByTask = async (req, res) => {
    try {
        const {taskId} = req.params;

        const taskResult = await getTaskWithAccessCheck(taskId, req.user.userId);

        if (taskResult.error) {
            return res.status(taskResult.error.status).json({error: taskResult.error.message});
        }

        const comments = await prisma.taskComment.findMany({
            where: {taskId},
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

        res.json(comments);
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.updateComment = async (req, res) => {
    try {
        const {id} = req.params;
        const {content} = req.body;

        if (!content) {
            return res.status(400).json({error: 'Content is required'});
        }

        const commentResult = await getCommentWithAccessCheck(id, req.user.userId);

        if (commentResult.error) {
            return res.status(commentResult.error.status).json({error: commentResult.error.message});
        }

        if (commentResult.comment.senderId !== req.user.userId) {
            return res.status(403).json({error: 'Only comment sender can update this comment'});
        }

        const updatedComment = await prisma.taskComment.update({
            where: {id},
            data: {content},
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

        res.json(updatedComment);
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.deleteComment = async (req, res) => {
    try {
        const {id} = req.params;

        const commentResult = await getCommentWithAccessCheck(id, req.user.userId);

        if (commentResult.error) {
            return res.status(commentResult.error.status).json({error: commentResult.error.message});
        }

        if (commentResult.comment.senderId !== req.user.userId) {
            return res.status(403).json({error: 'Only comment sender can delete this comment'});
        }

        await prisma.taskComment.delete({
            where: {id}
        });

        res.json({message: 'Comment deleted successfully'});
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};
