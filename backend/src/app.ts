import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import usersRouter from './routes/users';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

const app = express();

const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';

app.use(helmet());
app.use(cors({ origin: frontendUrl }));
app.use(express.json());

app.use(healthRouter);
app.use(authRouter);
app.use(usersRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
