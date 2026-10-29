require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new SQLiteStore(path.join(DATA_DIR, "platform.sqlite"));

db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL,
 points INTEGER NOT NULL DEFAULT 1000,
 role TEXT NOT NULL DEFAULT 'user',
 status TEXT NOT NULL DEFAULT 'active',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS content (
 key TEXT PRIMARY KEY,
 value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS games (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 game TEXT NOT NULL,
 result TEXT NOT NULL,
 points_change INTEGER NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS support (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 subject TEXT NOT NULL,
 message TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
`);

const defaults = {
 brand: "007BET",
 heroTitle: "Diversão com pontos virtuais",
 heroText: "Entre, jogue e acumule pontos. Sem depósitos, saques ou prêmios em dinheiro.",
 notice: "PLATAFORMA DE ENTRETENIMENTO • PONTOS SEM VALOR MONETÁRIO",
 promo1: "Bônus de boas-vindas: 1.000 pontos virtuais",
 promo2: "Novos desafios toda semana",
 gamesTitle: "Escolha seu jogo",
 accent: "#b7f52b"
};
const insertContent = db.prepare("INSERT OR IGNORE INTO content(key,value) VALUES(?,?)");
for (const [k,v] of Object.entries(defaults)) insertContent.run(k, String(v));

const countAdmins = db.prepare("SELECT COUNT(*) n FROM users WHERE role='admin'").get().n;
if (!countAdmins && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12);
  db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,'admin')")
    .run(process.env.ADMIN_NAME || "Administrador", process.env.ADMIN_EMAIL, hash);
}

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "30kb" }));
app.use(express.urlencoded({ extended: false, limit: "30kb" }));
app.use(session({
  name: "007sid",
  secret: process.env.SESSION_SECRET || "development-only-change-this-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1000*60*60*8 }
}));
app.use("/api/auth", rateLimit({ windowMs: 15*60*1000, limit: 30, standardHeaders: true, legacyHeaders: false }));
app.use(express.static(path.join(__dirname, "public")));

const getContent = () => Object.fromEntries(db.prepare("SELECT key,value FROM content").all().map(x => [x.key,x.value]));
const safeUser = u => ({ id:u.id, name:u.name, email:u.email, points:u.points, role:u.role, status:u.status });
function auth(req,res,next) {
  if (!req.session.userId) return res.status(401).json({error:"Faça login para continuar."});
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(req.session.userId);
  if (!user || user.status !== "active") { req.session.destroy(()=>{}); return res.status(403).json({error:"Conta indisponível."}); }
  req.user = user; next();
}
function admin(req,res,next) {
  if (!req.user || req.user.role !== "admin") return res.status(403).json({error:"Acesso restrito ao administrador."});
  next();
}
const clean = (v,max=180) => String(v ?? "").trim().slice(0,max);

app.get("/api/content", (req,res) => res.json(getContent()));
app.get("/api/me", (req,res) => {
  if (!req.session.userId) return res.json({user:null});
  const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.session.userId);
  if (!u || u.status !== "active") return res.json({user:null});
  res.json({user:safeUser(u)});
});
app.post("/api/auth/register", (req,res) => {
  const name=clean(req.body.name,70), email=clean(req.body.email,140).toLowerCase(), password=String(req.body.password||"");
  if(name.length<2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length<8 || password.length>72)
    return res.status(400).json({error:"Informe nome, e-mail válido e senha com pelo menos 8 caracteres."});
  try {
    const hash=bcrypt.hashSync(password,12);
    const info=db.prepare("INSERT INTO users(name,email,password_hash) VALUES(?,?,?)").run(name,email,hash);
    req.session.userId=Number(info.lastInsertRowid);
    res.json({user:safeUser(db.prepare("SELECT * FROM users WHERE id=?").get(req.session.userId))});
  } catch(e) { res.status(409).json({error:"Este e-mail já está cadastrado."}); }
});
app.post("/api/auth/login", (req,res) => {
  const email=clean(req.body.email,140).toLowerCase(), password=String(req.body.password||"");
  const u=db.prepare("SELECT * FROM users WHERE email=?").get(email);
  if(!u || !bcrypt.compareSync(password,u.password_hash) || u.status!=="active") return res.status(401).json({error:"E-mail ou senha inválidos, ou conta indisponível."});
  req.session.regenerate(err => {
    if(err) return res.status(500).json({error:"Não foi possível iniciar a sessão."});
    req.session.userId=u.id;
    res.json({user:safeUser(u)});
  });
});
app.post("/api/auth/logout", (req,res) => req.session.destroy(()=>res.json({ok:true})));

app.post("/api/games/play", auth, (req,res) => {
  const game=clean(req.body.game,40);
  if(!["Fortune Rabbit","Dragon Fortune","Golden Tiger"].includes(game)) return res.status(400).json({error:"Jogo inválido."});
  const u=db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
  const change=Math.floor(Math.random()*201)-50; // pontos fictícios, sem valor financeiro
  const result=change>=0 ? `Você ganhou ${change} pontos virtuais!` : `Você perdeu ${Math.abs(change)} pontos virtuais.`;
  const update=db.transaction(()=>{
    db.prepare("UPDATE users SET points=MAX(0,points+?) WHERE id=?").run(change,u.id);
    db.prepare("INSERT INTO games(user_id,game,result,points_change) VALUES(?,?,?,?)").run(u.id,game,result,change);
  });
  update();
  const fresh=db.prepare("SELECT * FROM users WHERE id=?").get(u.id);
  res.json({user:safeUser(fresh), result, change});
});
app.get("/api/history", auth, (req,res) => {
  res.json(db.prepare("SELECT game,result,points_change,created_at FROM games WHERE user_id=? ORDER BY id DESC LIMIT 30").all(req.user.id));
});
app.post("/api/support", auth, (req,res) => {
  const subject=clean(req.body.subject,100), message=clean(req.body.message,1000);
  if(subject.length<3 || message.length<10) return res.status(400).json({error:"Preencha o assunto e uma mensagem com pelo menos 10 caracteres."});
  db.prepare("INSERT INTO support(user_id,subject,message) VALUES(?,?,?)").run(req.user.id,subject,message);
  res.json({ok:true});
});

app.get("/api/admin/summary", auth, admin, (req,res) => {
  res.json({
    users:db.prepare("SELECT COUNT(*) n FROM users WHERE role='user'").get().n,
    active:db.prepare("SELECT COUNT(*) n FROM users WHERE role='user' AND status='active'").get().n,
    games:db.prepare("SELECT COUNT(*) n FROM games").get().n,
    tickets:db.prepare("SELECT COUNT(*) n FROM support WHERE status='open'").get().n
  });
});
app.get("/api/admin/users", auth, admin, (req,res) => {
  res.json(db.prepare("SELECT id,name,email,points,role,status,created_at FROM users ORDER BY id DESC LIMIT 300").all());
});
app.patch("/api/admin/users/:id", auth, admin, (req,res) => {
  const id=Number(req.params.id), status=req.body.status;
  if(!Number.isInteger(id) || !["active","blocked"].includes(status)) return res.status(400).json({error:"Dados inválidos."});
  const target=db.prepare("SELECT id,role FROM users WHERE id=?").get(id);
  if(!target || target.role==="admin") return res.status(400).json({error:"Esta conta não pode ser alterada por aqui."});
  db.prepare("UPDATE users SET status=? WHERE id=?").run(status,id);
  res.json({ok:true});
});
app.get("/api/admin/content", auth, admin, (req,res)=>res.json(getContent()));
app.put("/api/admin/content", auth, admin, (req,res) => {
  const allowed=Object.keys(defaults);
  const stmt=db.prepare("INSERT INTO content(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  const tx=db.transaction(()=>allowed.forEach(k=>{ if(req.body[k]!==undefined) stmt.run(k,clean(req.body[k],500)); }));
  tx(); res.json(getContent());
});
app.get("/api/admin/support", auth, admin, (req,res) => {
  res.json(db.prepare("SELECT support.id,support.subject,support.message,support.status,support.created_at,users.name,users.email FROM support JOIN users ON users.id=support.user_id ORDER BY support.id DESC LIMIT 200").all());
});
app.patch("/api/admin/support/:id", auth, admin, (req,res) => {
  const status=req.body.status;
  if(!["open","closed"].includes(status)) return res.status(400).json({error:"Status inválido."});
  db.prepare("UPDATE support SET status=? WHERE id=?").run(status,Number(req.params.id));
  res.json({ok:true});
});

app.get("*", (req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT, ()=>console.log(`007BET entretenimento disponível em http://localhost:${PORT}`));
