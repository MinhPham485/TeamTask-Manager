const {Storage} = require('@google-cloud/storage');

const buildStorageClient = () => {
    const projectId = process.env.GCS_PROJECT_ID;
    const clientEmail = process.env.GCS_CLIENT_EMAIL;
    const privateKey = process.env.GCS_PRIVATE_KEY
        ? process.env.GCS_PRIVATE_KEY.replace(/\\n/g, '\n')
        : undefined;

    const credentials = clientEmail && privateKey
        ? {client_email: clientEmail, private_key: privateKey}
        : undefined;

    return new Storage({projectId, credentials});
};

const getBucketName = () => {
    const bucketName = process.env.GCS_BUCKET;

    if (!bucketName) {
        throw new Error('GCS_BUCKET is required');
    }

    return bucketName;
};

const buildPublicUrl = (objectKey) => {
    const baseUrl = process.env.GCS_PUBLIC_BASE_URL;

    if (baseUrl) {
        return `${baseUrl.replace(/\/$/, '')}/${objectKey}`;
    }

    return `https://storage.googleapis.com/${getBucketName()}/${objectKey}`;
};

const createUploadUrl = async ({objectKey, contentType, expiresInSeconds}) => {
    const storage = buildStorageClient();
    const bucketName = getBucketName();
    const file = storage.bucket(bucketName).file(objectKey);

    const [uploadUrl] = await file.getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: Date.now() + expiresInSeconds * 1000,
        contentType
    });

    return {
        uploadUrl,
        fileUrl: buildPublicUrl(objectKey)
    };
};

module.exports = {
    createUploadUrl,
    buildPublicUrl
};
