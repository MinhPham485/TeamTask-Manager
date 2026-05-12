const {Storage} = require('@google-cloud/storage');

const normalizeHost = (value) => (value ? value.replace(/\/$/, '') : null);

const getEmulatorHost = () => {
    return normalizeHost(process.env.GCS_EMULATOR_HOST || process.env.STORAGE_EMULATOR_HOST || '');
};

const buildStorageClient = () => {
    const projectId = process.env.GCS_PROJECT_ID;
    const clientEmail = process.env.GCS_CLIENT_EMAIL;
    const privateKey = process.env.GCS_PRIVATE_KEY
        ? process.env.GCS_PRIVATE_KEY.replace(/\\n/g, '\n')
        : undefined;

    const credentials = clientEmail && privateKey
        ? {client_email: clientEmail, private_key: privateKey}
        : undefined;

    const apiEndpoint = getEmulatorHost() || undefined;

    return new Storage({projectId, credentials, apiEndpoint});
};

const getBucketName = () => {
    const bucketName = process.env.GCS_BUCKET;

    if (!bucketName) {
        throw new Error('GCS_BUCKET is required');
    }

    return bucketName;
};

const buildPublicUrl = (objectKey) => {
    const emulatorHost = getEmulatorHost();
    const baseUrl = normalizeHost(process.env.GCS_PUBLIC_BASE_URL) || emulatorHost;

    if (baseUrl) {
        return `${baseUrl.replace(/\/$/, '')}/${objectKey}`;
    }

    return `https://storage.googleapis.com/${getBucketName()}/${objectKey}`;
};

const getUploadBaseUrl = () => {
    return normalizeHost(process.env.GCS_UPLOAD_BASE_URL)
        || normalizeHost(process.env.GCS_PUBLIC_BASE_URL)
        || getEmulatorHost();
};

const createUploadUrl = async ({objectKey, contentType, expiresInSeconds}) => {
    const emulatorHost = getEmulatorHost();
    const bucketName = getBucketName();

    if (emulatorHost) {
        const uploadBaseUrl = getUploadBaseUrl();
        return {
            uploadUrl: `${uploadBaseUrl}/${bucketName}/${objectKey}`,
            fileUrl: buildPublicUrl(objectKey)
        };
    }

    const storage = buildStorageClient();
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
