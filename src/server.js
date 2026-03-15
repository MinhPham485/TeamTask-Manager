const express = require('express');
const http = require('http');
const cors = require('cors');
const {Server} = require('socket.io');
const authRoutes = require('./routes/auth_routes');
const groupRoutes = require('./routes/group_routes');
const testRoutes = require("./routes/test_routes");
const taskRoutes = require('./routes/task_routes');
const listRoutes = require('./routes/list_routes');
const labelRoutes = require('./routes/label_routes');
const checklistRoutes = require('./routes/checklist_routes');
const commentRoutes = require('./routes/comment_routes');
const messageRoutes = require('./routes/message_routes');
const registerChatSocket = require('./socket/chat_socket');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/lists', listRoutes);
app.use('/api/labels', labelRoutes);
app.use('/api/checklists', checklistRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/messages', messageRoutes);
app.use("/api", testRoutes);


app.get('/', (req, res) => {
    res.json({ message: 'API in running' });
});

if (require.main === module) {
    const server = http.createServer(app);
    const io = new Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
        }
    });

    app.set('io', io);
    registerChatSocket(io);

    server.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

module.exports = app;


