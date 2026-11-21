const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

const state = {
  token: sessionStorage.getItem("adminToken") || ""
};

function normalizeDigits(value = "") {
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  const eastern = "۰۱۲۳۴۵۶۷۸۹";
  return String(value)
    .trim()
    .replace(/[٠-٩]/g, (digit) => arabic.indexOf(digit))
    .replace(/[۰-۹]/g, (digit) => eastern.indexOf(digit));
}

async function requestJson(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (options.auth && state.token) headers.Authorization = `Bearer ${state.token}`;

  const response = await fetch(url, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const contentType = response.headers.get("content-type") || "";
  let data;
  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    const text = await response.text().catch(() => "");
    const looksLikeHtml = text.trim().startsWith("<!doctype") || text.trim().startsWith("<html");
    data = {
      ok: false,
      message: looksLikeHtml
        ? "الاستضافة لا تشغّل مسارات API الخاصة بالمشروع. تأكد أن الموقع منشور كتطبيق Node.js وليس كملفات HTML ثابتة فقط."
        : "تعذر قراءة استجابة الخادم لأن الاستجابة ليست JSON.",
      details: [`المسار: ${url}`, `رمز الحالة: ${response.status || "غير معروف"}`]
    };
  }

  if (!response.ok || data.ok === false) {
    const error = new Error(data.message || "حدث خطأ غير متوقع.");
    error.details = data.details;
    error.status = response.status;
    throw error;
  }
  return data;
}

function setToken(token) {
  state.token = token || "";
  if (token) sessionStorage.setItem("adminToken", token);
  else sessionStorage.removeItem("adminToken");
}

function showAlert(target, type, message, details = []) {
  if (!target) return;
  const palette = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    error: "border-rose-200 bg-rose-50 text-rose-800",
    info: "border-sky-200 bg-sky-50 text-sky-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900"
  };
  const detailList = Array.isArray(details) && details.length
    ? `<ul class="mt-2 list-disc space-y-1 pr-5 text-sm">${details.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "";
  target.innerHTML = `<div class="rounded-lg border px-4 py-3 text-sm shadow-sm ${palette[type] || palette.info}">${escapeHtml(message)}${detailList}</div>`;
}

function clearAlert(target) {
  if (target) target.innerHTML = "";
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ar-KW", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formToObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function loadSchoolBrand() {
  const data = await requestJson("/api/school");
  $$(".school-name").forEach((item) => {
    item.textContent = data.settings.schoolName;
  });
  $$(".school-logo").forEach((item) => {
    item.src = data.settings.logo;
    item.alt = data.settings.schoolName;
  });
  return data.settings;
}

function setButtonLoading(button, loading, loadingText = "جارٍ المعالجة...") {
  if (!button) return;
  if (loading) {
    button.dataset.originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = loadingText;
  } else {
    button.disabled = false;
    if (button.dataset.originalText) button.innerHTML = button.dataset.originalText;
  }
}

function requireAdminSession() {
  if (!state.token) {
    location.href = "admin-login.html";
    return Promise.reject(new Error("no_session"));
  }
  return requestJson("/api/session", { auth: true }).catch(() => {
    setToken("");
    location.href = "admin-login.html";
  });
}
