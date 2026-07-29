/**
 * Trainee Loan Assistant — Performance Tracker
 * Real-time, multi-device server. Uses Postgres so data survives restarts
 * even on free hosting (e.g. Render web service + Neon free Postgres).
 *
 * Local run:  npm install   then   npm start   (needs DATABASE_URL set)
 * Hosted:     set DATABASE_URL to your Neon connection string as an
 *             environment variable on your host (e.g. Render).
 */
const path = require('path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const http = require('http');
const { Server } = require('socket.io');
const XLSX = require('xlsx');

const PORT = process.env.PORT || 3000;
const DEFAULT_PASSWORD = 'Welcome@123';

if(!process.env.DATABASE_URL){
  console.error('ERROR: DATABASE_URL environment variable is not set.');
  console.error('Set it to your Postgres connection string (e.g. from Neon) before starting.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
});

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-session-secret-before-deploying',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 12 } // 12 hour login
}));

/* ---------------------------------------------------------------- */
/* SCHEDULE                                                          */
/* ---------------------------------------------------------------- */
const SCHEDULE = [
  { date:'2026-08-10', display:'Mon, Aug 10, 2026', program:'Class Room Training', milestone:'' },
  { date:'2026-08-11', display:'Tue, Aug 11, 2026', program:'Class Room Training', milestone:'' },
  { date:'2026-08-12', display:'Wed, Aug 12, 2026', program:'Class Room Training', milestone:'First Assessment' },
  { date:'2026-08-13', display:'Thu, Aug 13, 2026', program:'Class Room Training', milestone:'' },
  { date:'2026-08-14', display:'Fri, Aug 14, 2026', program:'Class Room Training', milestone:'' },
  { date:'2026-08-17', display:'Mon, Aug 17, 2026', program:'Class Room Training', milestone:'Second Assessment' },
  { date:'2026-08-18', display:'Tue, Aug 18, 2026', program:'Shadow Session', milestone:'' },
  { date:'2026-08-19', display:'Wed, Aug 19, 2026', program:'Shadow Session', milestone:'' },
  { date:'2026-08-20', display:'Thu, Aug 20, 2026', program:'Shadow Session', milestone:'' },
  { date:'2026-08-21', display:'Fri, Aug 21, 2026', program:'Live Cases / QA', milestone:'' },
  { date:'2026-08-24', display:'Mon, Aug 24, 2026', program:'Live Cases / QA', milestone:'' },
  { date:'2026-08-25', display:'Tue, Aug 25, 2026', program:'Live Cases / QA', milestone:'' },
  { date:'2026-08-26', display:'Wed, Aug 26, 2026', program:'Live Cases / QA', milestone:'Third Assessment' },
  { date:'2026-08-27', display:'Thu, Aug 27, 2026', program:'Live Cases / QA', milestone:'' },
  { date:'2026-08-28', display:'Fri, Aug 28, 2026', program:'Live Cases / QA', milestone:'' },
  { date:'2026-08-31', display:'Mon, Aug 31, 2026', program:'Live Cases / QA', milestone:'' },
  { date:'2026-09-01', display:'Tue, Sep 1, 2026', program:'Live Cases / QA', milestone:'' },
  { date:'2026-09-02', display:'Wed, Sep 2, 2026', program:'Live Cases / QA', milestone:'' },
  { date:'2026-09-03', display:'Thu, Sep 3, 2026', program:'Live Cases / QA / Voice Training', milestone:'' },
  { date:'2026-09-04', display:'Fri, Sep 4, 2026', program:'Accreditation / Call Assessment', milestone:'Final Assessment' }
];

/* ---------------------------------------------------------------- */
/* DATABASE SETUP + SEEDING                                          */
/* ---------------------------------------------------------------- */
async function initDb(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','trainee')),
      must_change_password BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS records (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      attendance TEXT DEFAULT '',
      score TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      updated_by TEXT,
      updated_at TIMESTAMP,
      PRIMARY KEY (user_id, date)
    );
  `);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM users');
  if(rows[0].c > 0) return;

  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const seed = [
    ['admin',    'Administrator',  'admin'],
    ['isha',     'Isha Devkota',   'trainee'],
    ['bidhi',    'Bidhi Paudel',   'trainee'],
    ['anushka',  'Anushka Karki',  'trainee']
  ];
  for(const [username, name, role] of seed){
    const res = await pool.query(
      `INSERT INTO users (username, name, password_hash, role, must_change_password)
       VALUES ($1,$2,$3,$4,true) RETURNING id`,
      [username, name, hash, role]
    );
    if(role === 'trainee'){
      await ensureTraineeHasRecords(res.rows[0].id);
    }
  }
  console.log('Seeded default users. Everyone signs in with password:', DEFAULT_PASSWORD);
}

async function ensureTraineeHasRecords(userId){
  for(const d of SCHEDULE){
    await pool.query(
      `INSERT INTO records (user_id, date) VALUES ($1,$2) ON CONFLICT (user_id, date) DO NOTHING`,
      [userId, d.date]
    );
  }
}

/* ---------------------------------------------------------------- */
/* HELPERS                                                           */
/* ---------------------------------------------------------------- */
function requireLogin(req, res, next){
  if(!req.session.user) return res.status(401).json({ error: 'Not logged in.' });
  next();
}
function requireAdmin(req, res, next){
  if(!req.session.user || req.session.user.role !== 'admin'){
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}
function publicUser(u){
  return { id: u.id, username: u.username, name: u.name, role: u.role, mustChangePassword: !!u.must_change_password };
}
function asyncRoute(fn){
  return (req, res) => fn(req, res).catch(err=>{
    console.error(err);
    res.status(500).json({ error: 'Server error. Please try again.' });
  });
}

/* ---------------------------------------------------------------- */
/* AUTH ROUTES                                                       */
/* ---------------------------------------------------------------- */
app.post('/api/login', asyncRoute(async (req, res)=>{
  const { username, password } = req.body;
  const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [(username||'').trim().toLowerCase()]);
  const user = rows[0];
  if(!user || !(await bcrypt.compare(password||'', user.password_hash))){
    return res.status(401).json({ error: 'Incorrect User ID or password.' });
  }
  req.session.user = publicUser(user);
  res.json({ user: req.session.user });
}));

app.post('/api/logout', (req, res)=>{
  req.session.destroy(()=> res.json({ ok:true }));
});

app.get('/api/me', requireLogin, (req, res)=>{
  res.json({ user: req.session.user });
});

app.post('/api/change-password', requireLogin, asyncRoute(async (req, res)=>{
  const { currentPassword, newPassword } = req.body;
  if(!newPassword || newPassword.length < 6){
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.session.user.id]);
  const user = rows[0];
  if(!(await bcrypt.compare(currentPassword||'', user.password_hash))){
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2', [hash, user.id]);
  req.session.user.mustChangePassword = false;
  res.json({ ok:true });
}));

/* ---------------------------------------------------------------- */
/* SCHEDULE + RECORDS                                                */
/* ---------------------------------------------------------------- */
app.get('/api/schedule', requireLogin, (req, res)=>{
  res.json({ schedule: SCHEDULE });
});

app.get('/api/records', requireLogin, asyncRoute(async (req, res)=>{
  if(req.session.user.role === 'admin'){
    const { rows: trainees } = await pool.query(
      `SELECT id, username, name FROM users WHERE role = 'trainee' ORDER BY name`
    );
    const result = [];
    for(const t of trainees){
      const { rows } = await pool.query('SELECT * FROM records WHERE user_id = $1 ORDER BY date', [t.id]);
      result.push({ id: t.id, username: t.username, name: t.name, records: rows });
    }
    return res.json({ trainees: result });
  }
  const { rows } = await pool.query('SELECT * FROM records WHERE user_id = $1 ORDER BY date', [req.session.user.id]);
  res.json({ trainees: [{ id: req.session.user.id, username: req.session.user.username, name: req.session.user.name, records: rows }] });
}));

app.post('/api/records', requireAdmin, asyncRoute(async (req, res)=>{
  const { userId, date, attendance, score, notes } = req.body;
  const exists = await pool.query('SELECT 1 FROM records WHERE user_id = $1 AND date = $2', [userId, date]);
  if(exists.rowCount === 0) return res.status(404).json({ error: 'Record not found.' });

  await pool.query(
    `UPDATE records SET attendance = $1, score = $2, notes = $3, updated_by = $4, updated_at = now()
     WHERE user_id = $5 AND date = $6`,
    [attendance||'', score||'', notes||'', req.session.user.name, userId, date]
  );
  const { rows } = await pool.query('SELECT * FROM records WHERE user_id = $1 AND date = $2', [userId, date]);
  const updatedRow = rows[0];
  io.emit('record-updated', { userId, date, row: updatedRow, by: req.session.user.name });
  res.json({ ok:true, row: updatedRow });
}));

/* ---------------------------------------------------------------- */
/* USER MANAGEMENT (admin only)                                      */
/* ---------------------------------------------------------------- */
app.get('/api/users', requireAdmin, asyncRoute(async (req, res)=>{
  const { rows } = await pool.query('SELECT id, username, name, role, must_change_password FROM users ORDER BY role, name');
  res.json({ users: rows.map(u=>({ id:u.id, username:u.username, name:u.name, role:u.role, mustChangePassword: !!u.must_change_password })) });
}));

app.post('/api/users', requireAdmin, asyncRoute(async (req, res)=>{
  let { username, name, role } = req.body;
  username = (username||'').trim().toLowerCase();
  name = (name||'').trim();
  role = role === 'admin' ? 'admin' : 'trainee';
  if(!username || !name){
    return res.status(400).json({ error: 'Username and full name are required.' });
  }
  if(!/^[a-z0-9._-]{3,20}$/.test(username)){
    return res.status(400).json({ error: 'Username must be 3-20 characters: letters, numbers, dot, dash, underscore.' });
  }
  const clash = await pool.query('SELECT 1 FROM users WHERE username = $1', [username]);
  if(clash.rowCount > 0) return res.status(409).json({ error: 'That User ID is already taken.' });

  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const inserted = await pool.query(
    `INSERT INTO users (username, name, password_hash, role, must_change_password)
     VALUES ($1,$2,$3,$4,true) RETURNING id`,
    [username, name, hash, role]
  );
  const newId = inserted.rows[0].id;
  if(role === 'trainee') await ensureTraineeHasRecords(newId);

  io.emit('users-changed', {});
  res.json({ ok:true, defaultPassword: DEFAULT_PASSWORD, user: { id: newId, username, name, role } });
}));

app.delete('/api/users/:id', requireAdmin, asyncRoute(async (req, res)=>{
  const id = Number(req.params.id);
  if(id === req.session.user.id){
    return res.status(400).json({ error: 'You cannot delete the account you are currently logged in as.' });
  }
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  if(!rows[0]) return res.status(404).json({ error: 'User not found.' });
  await pool.query('DELETE FROM records WHERE user_id = $1', [id]);
  await pool.query('DELETE FROM users WHERE id = $1', [id]);
  io.emit('users-changed', {});
  res.json({ ok:true });
}));

app.post('/api/users/:id/reset-password', requireAdmin, asyncRoute(async (req, res)=>{
  const id = Number(req.params.id);
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  if(!rows[0]) return res.status(404).json({ error: 'User not found.' });
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  await pool.query('UPDATE users SET password_hash = $1, must_change_password = true WHERE id = $2', [hash, id]);
  io.emit('users-changed', {});
  res.json({ ok:true, defaultPassword: DEFAULT_PASSWORD });
}));

/* ---------------------------------------------------------------- */
/* EXCEL EXPORT                                                      */
/* ---------------------------------------------------------------- */
app.get('/api/export', requireLogin, asyncRoute(async (req, res)=>{
  const wb = XLSX.utils.book_new();
  const isAdmin = req.session.user.role === 'admin';
  const trainees = isAdmin
    ? (await pool.query(`SELECT id, username, name FROM users WHERE role='trainee' ORDER BY name`)).rows
    : [{ id: req.session.user.id, username: req.session.user.username, name: req.session.user.name }];

  const summaryRows = [['Trainee','Attendance Rate','Avg Assessment Score']];

  for(const t of trainees){
    const rows = [['Date','Program','Milestone','Attendance','Score','Notes','Last Updated By','Last Updated At']];
    const { rows: rec } = await pool.query('SELECT * FROM records WHERE user_id = $1 ORDER BY date', [t.id]);
    const byDate = Object.fromEntries(rec.map(r=>[r.date, r]));
    let present=0, absent=0, leave=0, marked=0, scoreSum=0, scoreCount=0;
    SCHEDULE.forEach(day=>{
      const r = byDate[day.date] || {};
      rows.push([day.display, day.program, day.milestone||'', r.attendance||'', r.score||'', r.notes||'', r.updated_by||'', r.updated_at||'']);
      if(r.attendance){ marked++; if(r.attendance==='Present') present++; if(r.attendance==='Absent') absent++; if(r.attendance==='Leave') leave++; }
      if(r.score){ scoreSum += Number(r.score); scoreCount++; }
    });
    rows.push([]);
    rows.push(['Attendance rate', marked ? Math.round(present/marked*100)+'%' : 'N/A']);
    rows.push(['Average assessment score', scoreCount ? Math.round(scoreSum/scoreCount) : 'N/A']);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{wch:16},{wch:24},{wch:18},{wch:12},{wch:8},{wch:36},{wch:16},{wch:20}];
    XLSX.utils.book_append_sheet(wb, ws, t.name.substring(0,31));
    summaryRows.push([t.name, marked ? Math.round(present/marked*100)+'%' : 'N/A', scoreCount ? Math.round(scoreSum/scoreCount) : 'N/A']);
  }

  if(isAdmin){
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
  }

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="Trainee_Performance_Report_${new Date().toISOString().slice(0,10)}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
}));

/* ---------------------------------------------------------------- */
/* START                                                             */
/* ---------------------------------------------------------------- */
initDb()
  .then(()=>{
    server.listen(PORT, ()=>{
      console.log(`Trainee Performance Tracker running at http://localhost:${PORT}`);
    });
  })
  .catch(err=>{
    console.error('Failed to initialize database:', err.message);
    process.exit(1);
  });
