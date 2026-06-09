const {PrismaClient} = require('@prisma/client');
require('dotenv').config();
const {getTaskAccess} = require('../services/task_permission_service');

const prisma = new PrismaClient();

const getTaskWithAccessCheck = async (taskId, userId) => {
    const taskResult = await getTaskAccess(taskId, userId);

    if (taskResult.error) {
        return taskResult;
    }

    if (!taskResult.access.canView) {
        return {error: {status: 403, message: 'You do not have permission to access this task'}};
    }

    return taskResult;
};

const getCommentWithAccessCheck = async (commentId, userId) => {
    const comment = await prisma.taskComment.findUnique({
        where: {id: commentId},
        select: {
            id: true,
            content: true,
            taskId: true,
            senderId: true,
            createdAt: true,
            updatedAt: true,
            task: {
                select: {
                    id: true
                }
            }
        }
    });

    if (!comment) {
        return {error: {status: 404, message: 'Comment not found'}};
    }

    const taskResult = await getTaskWithAccessCheck(comment.task.id, userId);

    if (taskResult.error) {
        return {error: {status: taskResult.error.status, message: 'You do not have permission to access this comment'}};
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

        if (!taskResult.access.canParticipate) {
            return res.status(403).json({error: 'Only task participants can comment on this task'});
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
