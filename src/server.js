const express = require('express');
const http = require('http');
const cors = require('cors');
const {Server} = require('socket.io');
require('dotenv').config();
const authRoutes = require('./routes/auth_routes');
const groupRoutes = require('./routes/group_routes');
const taskRoutes = require('./routes/task_routes');
const listRoutes = require('./routes/list_routes');
const labelRoutes = require('./routes/label_routes');
const checklistRoutes = require('./routes/checklist_routes');
const commentRoutes = require('./routes/comment_routes');
const messageRoutes = require('./routes/message_routes');
const uploadRoutes = require('./routes/upload_routes');
const aiRoutes = require('./routes/ai_routes');
const registerChatSocket = require('./socket/chat_socket');
const { metricsMiddleware, metricsHandler } = require('./services/metrics_service');


const app = express();
const PORT = process.env.PORT || 5000;
const DEFAULT_ALLOWED_ORIGINS = [
    'https://minhph.xyz',
    'https://www.minhph.xyz',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174'
];
const allowedOrigins = (process.env.CORS_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(','))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const isAllowedOrigin = (origin) => {
    if (!origin) {
        return true;
    }

    return allowedOrigins.includes(origin);
};

const corsOptions = {
    origin(origin, callback) {
        if (isAllowedOrigin(origin)) {
            callback(null, true);
            return;
        }

        callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(metricsMiddleware);
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/lists', listRoutes);
app.use('/api/labels', labelRoutes);
app.use('/api/checklists', checklistRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/ai', aiRoutes);


app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'backend',
        timestamp: new Date().toISOString()
    });
});

app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'backend',
        timestamp: new Date().toISOString()
    });
});


app.get('/', (req, res) => {
    res.json({ message: 'API in running' });
});

if (require.main === module) {
    const server = http.createServer(app);
    const io = new Server(server, {
        cors: {
            origin(origin, callback) {
                if (isAllowedOrigin(origin)) {
                    callback(null, true);
                    return;
                }

                callback(new Error('Not allowed by CORS'));
            },
            methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
            allowedHeaders: ['Content-Type', 'Authorization']
        }
    });

    app.set('io', io);
    registerChatSocket(io);

    server.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

app.get('/metrics', metricsHandler);

module.exports = app;

