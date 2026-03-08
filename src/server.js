const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth_routes');
const groupRoutes = require('./routes/group_routes');
const testRoutes = require("./routes/test_routes");
const app = express();
const taskRoutes = require('./routes/task_routes');


app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/tasks', taskRoutes);
app.use("/api", testRoutes);


app.get('/', (req, res) => {
    res.json({ message: 'API in running' });
});
app.listen(5000, () => {
    console.log('Server is running on port 5000');
});


