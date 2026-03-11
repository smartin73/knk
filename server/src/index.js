import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import connectPg from 'connect-pg-simple';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import settingsRouter from './routes/settings.js';

import pool from './db/pool.js';
import authRouter from './routes/auth.js';
import eventsRouter from './routes/events.js';
import recipesRouter from './routes/recipes.js';
import {
  ingredientsRouter,
  itemBuilderRouter,
  eventMenusRouter,
  donationsRouter,
  vendorsRouter,
} from './routes/modules.js';

import squareRouter from './routes/square.js';
import notificationsRouter from './routes/notifications.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

// ── Postgres session store ────────────────────────────────
const PgSession = connectPg(session);

// ── Middleware ────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.CLIENT_ORIGIN,
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new PgSession({ pool, tableName: 'user_sessions' }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    sameSite: 'lax',
  },
}));


// ── Static uploads ────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ── File upload ───────────────────────────────────────────
const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

app.post('/upload', (req, res, next) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Unauthorised' });
  next();
}, upload.single('file'), (req, res) => {
  res.json({ url: `/uploads/${req.file.filename}` });
});

// ── Routes ────────────────────────────────────────────────
app.use('/auth',         authRouter);
app.use('/events',       eventsRouter);
app.use('/recipes',      recipesRouter);
app.use('/ingredients',  ingredientsRouter);
app.use('/items',        itemBuilderRouter);
app.use('/event-menus',  eventMenusRouter);
app.use('/donations',    donationsRouter);
app.use('/vendors',      vendorsRouter);
app.use('/settings', settingsRouter);
app.use('/square',        squareRouter);
app.use('/notifications', notificationsRouter);

// ── Health check ─────────────────────────────────────────
app.get('/health', (_, res) => res.json({ ok: true, ts: new Date() }));

// ── Error handler ─────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => console.log(`API running on :${PORT}`));
