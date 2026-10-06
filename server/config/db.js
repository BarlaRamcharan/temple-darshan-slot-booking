const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const mongoose = require('mongoose');

function isRailwayEnvironment(env = process.env) {
  return Boolean(env.RAILWAY_ENVIRONMENT || env.RAILWAY_PROJECT_ID || env.RAILWAY_SERVICE_ID);
}

function getDatabaseConfig(env = process.env, platform = process.platform) {
  const isRailway = isRailwayEnvironment(env);
  const isProduction = env.NODE_ENV === 'production' || isRailway;
  const mongoUri = env.MONGODB_URI || (isProduction ? '' : env.MONGO_URI || 'mongodb://127.0.0.1:27017/temple-darshan');

  if (!mongoUri) {
    throw new Error('MONGODB_URI is required in production. Configure a remote MongoDB connection before starting the server.');
  }

  return {
    mongoUri,
    canStartLocalMongo: platform === 'win32'
      && !isProduction
      && !isRailway
      && !env.MONGODB_URI
      && !env.MONGO_URI,
  };
}

function safeErrorCode(error) {
  return error.code || error.name || 'DATABASE_ERROR';
}

function startLocalMongo(dbDir) {
  return new Promise((resolve, reject) => {
    const child = spawn('mongod.exe', ['--dbpath', dbDir, '--port', '27017'], {
      cwd: path.join(__dirname, '../../'),
      detached: true,
      stdio: 'ignore',
    });
    let started = false;

    child.once('spawn', () => {
      started = true;
      resolve(child);
    });
    child.on('error', (error) => {
      console.error('Local MongoDB process error:', safeErrorCode(error));
      if (!started) {
        reject(error);
      }
    });
    child.unref();
  });
}

async function connectDB() {
  const { mongoUri, canStartLocalMongo } = getDatabaseConfig();

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log(process.env.MONGODB_URI
      ? 'Connected to MongoDB Atlas'
      : `MongoDB connected: ${mongoose.connection.host}`);
    return mongoose.connection.uri;
  } catch (error) {
    if (!canStartLocalMongo) {
      console.error('MongoDB connection failed:', safeErrorCode(error));
      throw new Error('Unable to connect to the configured MongoDB database. Verify MONGODB_URI, network access, and database availability.');
    }

    const dbDir = path.join(__dirname, '../../.mongo-data');
    try {
      fs.mkdirSync(dbDir, { recursive: true });
      await startLocalMongo(dbDir);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
      console.log(`MongoDB connected locally: ${mongoose.connection.host}`);
      return mongoose.connection.uri;
    } catch (localError) {
      console.error('Local MongoDB startup failed:', safeErrorCode(localError));
      throw new Error('Could not start local MongoDB. Install MongoDB Community Server or configure MONGODB_URI to use a remote database.');
    }
  }
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = {
  connectDB,
  disconnectDB,
  getDatabaseConfig,
  isRailwayEnvironment,
};
