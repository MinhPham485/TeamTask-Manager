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

exports.createLabel = async (req, res) => {
    try {
        const {groupId, name, color} = req.body;

        if (!groupId || !name || !color) {
            return res.status(400).json({error: 'Group ID, name, and color are required'});
        }

        const hasAccess = await ensureMembership(req.user.userId, groupId);

        if (!hasAccess) {
            return res.status(403).json({error: 'You are not a member of this group'});
        }

        const label = await prisma.label.create({
            data: {
                groupId,
                name,
                color
            }
        });

        res.status(201).json(label);
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.getLabelsByGroup = async (req, res) => {
    try {
        const {groupId} = req.params;

        const hasAccess = await ensureMembership(req.user.userId, groupId);

        if (!hasAccess) {
            return res.status(403).json({error: 'You are not a member of this group'});
        }

        const labels = await prisma.label.findMany({
            where: {groupId},
            orderBy: [
                {createdAt: 'asc'}
            ]
        });

        res.json(labels);
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.updateLabel = async (req, res) => {
    try {
        const {id} = req.params;
        const {name, color} = req.body;

        const label = await prisma.label.findUnique({
            where: {id},
            select: {
                id: true,
                groupId: true
            }
        });

        if (!label) {
            return res.status(404).json({error: 'Label not found'});
        }

        const hasAccess = await ensureMembership(req.user.userId, label.groupId);

        if (!hasAccess) {
            return res.status(403).json({error: 'You are not a member of this group'});
        }

        const updatedLabel = await prisma.label.update({
            where: {id},
            data: {
                name,
                color
            }
        });

        res.json(updatedLabel);
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.deleteLabel = async (req, res) => {
    try {
        const {id} = req.params;

        const label = await prisma.label.findUnique({
            where: {id},
            select: {
                id: true,
                groupId: true
            }
        });

        if (!label) {
            return res.status(404).json({error: 'Label not found'});
        }

        const hasAccess = await ensureMembership(req.user.userId, label.groupId);

        if (!hasAccess) {
            return res.status(403).json({error: 'You are not a member of this group'});
        }

        await prisma.label.delete({
            where: {id}
        });

        res.json({message: 'Label deleted successfully'});
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};
