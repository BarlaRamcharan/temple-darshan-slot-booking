const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const mongoose = require('mongoose');

async function connectDB() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/temple-darshan';

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log(`MongoDB connected: ${mongoose.connection.host}`);
    return mongoose.connection.uri;
  } catch (error) {
    const dbDir = path.join(__dirname, '../../.mongo-data');
    fs.mkdirSync(dbDir, { recursive: true });

    const child = spawn('mongod.exe', ['--dbpath', dbDir, '--port', '27017'], {
      cwd: path.join(__dirname, '../../'),
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    await new Promise((resolve) => setTimeout(resolve, 5000));
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
    console.log(`MongoDB connected locally: ${mongoose.connection.host}`);
    return mongoUri;
  }
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = {
  connectDB,
  disconnectDB,
};
