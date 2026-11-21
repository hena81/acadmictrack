const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_FILE = path.join(ROOT, "data", "store.json");
const BACKUP_FILE = path.join(ROOT, "data", "store.backup.json");
const sessions = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message, details) {
  sendJson(res, status, { ok: false, message, details });
}

function readStore() {
  const raw = fs.readFileSync(DATA_FILE, "utf8");
  return JSON.parse(raw);
}

function writeStore(data) {
  const current = fs.existsSync(DATA_FILE) ? fs.readFileSync(DATA_FILE, "utf8") : "";
  if (current) fs.writeFileSync(BACKUP_FILE, current);
  fs.writeFileSync(DATA_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function normalizeDigits(value = "") {
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  const eastern = "۰۱۲۳۴۵۶۷۸۹";
  return String(value)
    .trim()
    .replace(/[٠-٩]/g, (digit) => arabic.indexOf(digit))
    .replace(/[۰-۹]/g, (digit) => eastern.indexOf(digit));
}

function cleanStudent(input = {}) {
  return {
    civilId: normalizeDigits(input.civilId),
    name: String(input.name || "").trim(),
    grade: String(input.grade || "").trim(),
    section: String(input.section || "").trim(),
    track: String(input.track || "غير محدد").trim()
  };
}

function validateStudent(student) {
  const errors = [];
  if (!/^\d{6,12}$/.test(student.civilId)) errors.push("الرقم المدني يجب أن يحتوي على أرقام فقط من 6 إلى 12 رقمًا.");
  if (!student.name) errors.push("اسم الطالب مطلوب.");
  if (!student.grade) errors.push("الصف مطلوب.");
  if (!student.section) errors.push("الشعبة مطلوبة.");
  if (!student.track) errors.push("التشعيب مطلوب.");
  return errors;
}

function publicStudent(student, selections = []) {
  const selection = selections.find((item) => item.civilId === student.civilId);
  return {
    id: student.id,
    civilId: student.civilId,
    name: student.name,
    grade: student.grade,
    section: student.section,
    track: student.track,
    selectedTrack: selection ? selection.selectedTrack : "",
    selectedAt: selection ? selection.savedAt : ""
  };
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role || "admin",
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 8 * 1024 * 1024) {
        reject(new Error("payload_too_large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function getToken(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return "";
  return header.slice(7);
}

function requireAuth(req, res) {
  const token = getToken(req);
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    sendError(res, 401, "انتهت الجلسة أو لم يتم تسجيل الدخول.");
    return null;
  }
  session.expiresAt = Date.now() + 1000 * 60 * 60 * 8;
  return session;
}

function routeStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const fallback = urlPath === "/" ? "/index.html" : urlPath;
  const pathsToTry = [
    path.normalize(path.join(PUBLIC_DIR, fallback)),
    path.normalize(path.join(ROOT, fallback))
  ];
  if (!path.extname(fallback)) {
    pathsToTry.push(path.normalize(path.join(PUBLIC_DIR, `${fallback}.html`)));
    pathsToTry.push(path.normalize(path.join(ROOT, `${fallback}.html`)));
  }

  const filePath = pathsToTry.find((candidate) => {
    const insidePublic = candidate.startsWith(PUBLIC_DIR);
    const insideRoot = candidate.startsWith(ROOT);
    const rootRelative = path.relative(ROOT, candidate).replace(/\\/g, "/");
    const allowedRootFile = ["index.html", "admin-login.html", "dashboard.html", "about.html"].includes(rootRelative)
      || rootRelative.startsWith("js/")
      || rootRelative.startsWith("assets/");
    const isDataFile = candidate.startsWith(path.join(ROOT, "data"));
    const isServerFile = candidate === path.join(ROOT, "server.js") || candidate === path.join(ROOT, "web.config");
    return (insidePublic || (insideRoot && allowedRootFile)) && !isDataFile && !isServerFile && fs.existsSync(candidate) && fs.statSync(candidate).isFile();
  });

  if (!filePath) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("الصفحة غير موجودة");
    return;
  }

  if (!filePath.startsWith(PUBLIC_DIR) && !filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("الصفحة غير موجودة");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(content);
  });
}

async function routeApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method;
  const pathname = url.pathname;

  try {
    if (method === "GET" && pathname === "/api/health") {
      const storageExists = fs.existsSync(DATA_FILE);
      const storage = {
        exists: storageExists,
        readable: false,
        writable: false
      };
      if (storageExists) {
        try {
          fs.accessSync(DATA_FILE, fs.constants.R_OK);
          JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
          storage.readable = true;
        } catch {
          storage.readable = false;
        }
        try {
          fs.accessSync(DATA_FILE, fs.constants.W_OK);
          storage.writable = true;
        } catch {
          storage.writable = false;
        }
      }
      return sendJson(res, 200, {
        ok: true,
        message: "API يعمل بنجاح.",
        storage,
        time: new Date().toISOString()
      });
    }

    if (method === "GET" && pathname === "/api/school") {
      const data = readStore();
      return sendJson(res, 200, { ok: true, settings: data.settings });
    }

    if (method === "POST" && pathname === "/api/login") {
      const body = await parseBody(req);
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      const data = readStore();
      const user = data.users.find((item) => item.username === username && item.password === password);
      if (!user) return sendError(res, 401, "اسم المستخدم أو كلمة المرور غير صحيحة.");

      const token = crypto.randomBytes(32).toString("hex");
      sessions.set(token, {
        userId: user.id,
        username: user.username,
        expiresAt: Date.now() + 1000 * 60 * 60 * 8
      });
      return sendJson(res, 200, { ok: true, token, user: publicUser(user) });
    }

    if (method === "POST" && pathname === "/api/logout") {
      sessions.delete(getToken(req));
      return sendJson(res, 200, { ok: true });
    }

    if (method === "GET" && pathname === "/api/session") {
      const session = requireAuth(req, res);
      if (!session) return;
      const data = readStore();
      const user = data.users.find((item) => item.id === session.userId);
      return sendJson(res, 200, { ok: true, user: user ? publicUser(user) : null });
    }

    if (method === "GET" && pathname === "/api/students/search") {
      const civilId = normalizeDigits(url.searchParams.get("civilId") || "");
      if (!civilId) return sendError(res, 400, "يرجى إدخال الرقم المدني.");
      const data = readStore();
      const student = data.students.find((item) => item.civilId === civilId);
      if (!student) return sendError(res, 404, "لم يتم العثور على طالب بهذا الرقم المدني.");
      return sendJson(res, 200, { ok: true, student: publicStudent(student, data.selections) });
    }

    if (method === "POST" && pathname === "/api/selections") {
      const body = await parseBody(req);
      const civilId = normalizeDigits(body.civilId);
      const selectedTrack = String(body.selectedTrack || "").trim();
      if (!civilId) return sendError(res, 400, "الرقم المدني مطلوب.");
      if (!["علمي", "أدبي"].includes(selectedTrack)) return sendError(res, 400, "يرجى اختيار شعبة صحيحة.");

      const data = readStore();
      const student = data.students.find((item) => item.civilId === civilId);
      if (!student) return sendError(res, 404, "لم يتم العثور على الطالب.");

      const now = new Date().toISOString();
      const existing = data.selections.find((item) => item.civilId === civilId);
      if (existing) {
        existing.selectedTrack = selectedTrack;
        existing.savedAt = now;
      } else {
        data.selections.push({
          id: crypto.randomUUID(),
          civilId,
          selectedTrack,
          savedAt: now
        });
      }
      student.track = selectedTrack;
      student.updatedAt = now;
      writeStore(data);
      return sendJson(res, 200, { ok: true, message: "تم حفظ اختيار الشعبة بنجاح." });
    }

    if (pathname === "/api/settings") {
      const session = requireAuth(req, res);
      if (!session) return;
      if (method !== "PUT") return sendError(res, 405, "طريقة الطلب غير مدعومة.");

      const body = await parseBody(req);
      const schoolName = String(body.schoolName || "").trim();
      const logo = String(body.logo || "").trim();
      if (!schoolName) return sendError(res, 400, "اسم المدرسة مطلوب.");
      if (!logo) return sendError(res, 400, "الشعار مطلوب.");
      const data = readStore();
      data.settings = { schoolName, logo };
      writeStore(data);
      return sendJson(res, 200, { ok: true, settings: data.settings });
    }

    if (pathname === "/api/admin/data" && method === "GET") {
      const session = requireAuth(req, res);
      if (!session) return;
      const data = readStore();
      return sendJson(res, 200, {
        ok: true,
        settings: data.settings,
        students: data.students.map((student) => publicStudent(student, data.selections)),
        users: data.users.map(publicUser),
        selections: data.selections
      });
    }

    if (pathname === "/api/students" && method === "GET") {
      const session = requireAuth(req, res);
      if (!session) return;
      const data = readStore();
      return sendJson(res, 200, { ok: true, students: data.students.map((student) => publicStudent(student, data.selections)) });
    }

    if (pathname === "/api/students" && method === "POST") {
      const session = requireAuth(req, res);
      if (!session) return;
      const body = await parseBody(req);
      const student = cleanStudent(body);
      const errors = validateStudent(student);
      if (errors.length) return sendError(res, 400, "يرجى تصحيح بيانات الطالب.", errors);

      const data = readStore();
      if (data.students.some((item) => item.civilId === student.civilId)) {
        return sendError(res, 409, "الرقم المدني موجود مسبقًا.");
      }
      const now = new Date().toISOString();
      const saved = { id: crypto.randomUUID(), ...student, createdAt: now, updatedAt: now };
      data.students.push(saved);
      writeStore(data);
      return sendJson(res, 201, { ok: true, student: publicStudent(saved, data.selections) });
    }

    if (pathname === "/api/students/import" && method === "POST") {
      const session = requireAuth(req, res);
      if (!session) return;
      const body = await parseBody(req);
      const incoming = Array.isArray(body.students) ? body.students : [];
      const data = readStore();
      const now = new Date().toISOString();
      const existingIds = new Set(data.students.map((student) => student.civilId));
      const added = [];
      const skipped = [];

      incoming.forEach((row, index) => {
        const student = cleanStudent(row);
        const errors = validateStudent(student);
        if (errors.length || existingIds.has(student.civilId)) {
          skipped.push({ row: index + 2, civilId: student.civilId, reason: errors.join(" ") || "الرقم المدني مكرر." });
          return;
        }
        existingIds.add(student.civilId);
        const saved = { id: crypto.randomUUID(), ...student, createdAt: now, updatedAt: now };
        data.students.push(saved);
        added.push(saved);
      });

      writeStore(data);
      return sendJson(res, 200, {
        ok: true,
        added: added.length,
        skipped,
        students: data.students.map((student) => publicStudent(student, data.selections))
      });
    }

    const studentMatch = pathname.match(/^\/api\/students\/([^/]+)$/);
    if (studentMatch) {
      const session = requireAuth(req, res);
      if (!session) return;
      const id = decodeURIComponent(studentMatch[1]);
      const data = readStore();
      const index = data.students.findIndex((student) => student.id === id);
      if (index === -1) return sendError(res, 404, "الطالب غير موجود.");

      if (method === "PUT") {
        const body = await parseBody(req);
        const student = cleanStudent(body);
        const errors = validateStudent(student);
        if (errors.length) return sendError(res, 400, "يرجى تصحيح بيانات الطالب.", errors);
        const duplicate = data.students.some((item) => item.civilId === student.civilId && item.id !== id);
        if (duplicate) return sendError(res, 409, "الرقم المدني موجود مسبقًا.");
        data.students[index] = {
          ...data.students[index],
          ...student,
          updatedAt: new Date().toISOString()
        };
        writeStore(data);
        return sendJson(res, 200, { ok: true, student: publicStudent(data.students[index], data.selections) });
      }

      if (method === "DELETE") {
        const civilId = data.students[index].civilId;
        data.students.splice(index, 1);
        data.selections = data.selections.filter((item) => item.civilId !== civilId);
        writeStore(data);
        return sendJson(res, 200, { ok: true });
      }
    }

    if (pathname === "/api/students" && method === "DELETE") {
      const session = requireAuth(req, res);
      if (!session) return;
      const data = readStore();
      data.students = [];
      data.selections = [];
      writeStore(data);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === "/api/users" && method === "GET") {
      const session = requireAuth(req, res);
      if (!session) return;
      const data = readStore();
      return sendJson(res, 200, { ok: true, users: data.users.map(publicUser) });
    }

    if (pathname === "/api/users" && method === "POST") {
      const session = requireAuth(req, res);
      if (!session) return;
      const body = await parseBody(req);
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      const fullName = String(body.fullName || "").trim();
      if (!username || !password || !fullName) return sendError(res, 400, "الاسم الكامل واسم المستخدم وكلمة المرور مطلوبة.");
      if (password.length < 4) return sendError(res, 400, "كلمة المرور يجب أن تكون 4 أحرف على الأقل.");

      const data = readStore();
      if (data.users.some((user) => user.username === username)) return sendError(res, 409, "اسم المستخدم موجود مسبقًا.");
      const now = new Date().toISOString();
      const user = { id: crypto.randomUUID(), username, password, fullName, role: "admin", createdAt: now, updatedAt: now };
      data.users.push(user);
      writeStore(data);
      return sendJson(res, 201, { ok: true, user: publicUser(user) });
    }

    const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
    if (userMatch) {
      const session = requireAuth(req, res);
      if (!session) return;
      const id = decodeURIComponent(userMatch[1]);
      const data = readStore();
      const index = data.users.findIndex((user) => user.id === id);
      if (index === -1) return sendError(res, 404, "المستخدم غير موجود.");

      if (method === "PUT") {
        const body = await parseBody(req);
        const username = String(body.username || "").trim();
        const fullName = String(body.fullName || "").trim();
        const password = String(body.password || "");
        if (!username || !fullName) return sendError(res, 400, "الاسم الكامل واسم المستخدم مطلوبان.");
        if (password && password.length < 4) return sendError(res, 400, "كلمة المرور يجب أن تكون 4 أحرف على الأقل.");
        const duplicate = data.users.some((user) => user.username === username && user.id !== id);
        if (duplicate) return sendError(res, 409, "اسم المستخدم موجود مسبقًا.");

        data.users[index] = {
          ...data.users[index],
          username,
          fullName,
          role: "admin",
          password: password || data.users[index].password,
          updatedAt: new Date().toISOString()
        };
        writeStore(data);
        return sendJson(res, 200, { ok: true, user: publicUser(data.users[index]) });
      }

      if (method === "DELETE") {
        if (data.users.length === 1) return sendError(res, 400, "لا يمكن حذف آخر مستخدم في النظام.");
        data.users.splice(index, 1);
        writeStore(data);
        return sendJson(res, 200, { ok: true });
      }
    }

    return sendError(res, 404, "المسار غير موجود.");
  } catch (error) {
    if (error.message === "payload_too_large") return sendError(res, 413, "حجم البيانات كبير جدًا.");
    console.error(error);
    return sendError(res, 500, "حدث خطأ في الخادم.");
  }
}

const server = http.createServer((req, res) => {
  if (req.url === "/healthz" || req.url === "/health") {
    sendJson(res, 200, { status: "ok", app: "acadmictrack" });
    return;
  }
  if (req.url.startsWith("/api/")) {
    routeApi(req, res);
    return;
  }
  routeStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`School branch selector is running at http://localhost:${PORT}`);
});
