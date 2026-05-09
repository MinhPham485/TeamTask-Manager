const {PrismaClient} = require('@prisma/client');
const crypto = require('crypto');
const {createUploadUrl} = require('../services/storage_service');

const prisma = new PrismaClient();

const MAX_FILE_SIZE = 3 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg'
]);

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

const normalizeFileName = (value) => {
    if (typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim();

    if (!trimmed) {
        return null;
    }

    return trimmed
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9._-]/g, '');
};

const buildObjectKey = ({groupId, targetType, fileName}) => {
    const safeName = normalizeFileName(fileName) || 'upload';
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const uuid = crypto.randomUUID();

    return `uploads/${groupId}/${targetType}/${year}/${month}/${uuid}-${safeName}`;
};

exports.createPresignedUpload = async (req, res) => {
    try {
        const {groupId, fileName, mimeType, size, targetType} = req.body || {};

        if (!groupId) {
            return res.status(400).json({error: 'Group ID is required'});
        }

        if (!fileName) {
            return res.status(400).json({error: 'File name is required'});
        }

        if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) {
            return res.status(400).json({error: 'File type is not allowed'});
        }

        if (!Number.isInteger(size) || size <= 0 || size > MAX_FILE_SIZE) {
            return res.status(400).json({error: 'File size is invalid or too large'});
        }

        const normalizedTarget = String(targetType || '').trim().toLowerCase();

        if (!['task', 'message'].includes(normalizedTarget)) {
            return res.status(400).json({error: 'Target type must be task or message'});
        }

        const hasAccess = await ensureGroupMember(req.user.userId, groupId);

        if (!hasAccess) {
            return res.status(403).json({error: 'You are not a member of this group'});
        }

        const objectKey = buildObjectKey({
            groupId,
            targetType: normalizedTarget,
            fileName
        });

        const expiresInSeconds = 300;
        const {uploadUrl, fileUrl} = await createUploadUrl({
            objectKey,
            contentType: mimeType,
            expiresInSeconds
        });

        res.json({
            uploadUrl,
            fileUrl,
            key: objectKey,
            expiresInSeconds
        });
    } catch (error) {
        res.status(500).json({error: error.message});
    }
};

exports.uploadConfig = {
    MAX_FILE_SIZE,
    ALLOWED_MIME_TYPES
};
