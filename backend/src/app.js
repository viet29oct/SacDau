const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const pinoHttp = require('pino-http');
const healthRouter = require('./routes/health');
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { logger } = require('./logger');

const app = express();

const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';

app.use(helmet());
app.use(cors({ origin: frontendUrl }));
app.use(express.json());
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));

app.use(healthRouter);
app.use(authRouter);
app.use(usersRouter);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
