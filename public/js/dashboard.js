const dashboard = {
  settings: null,
  students: [],
  users: [],
  activeTab: "settings"
};

document.addEventListener("DOMContentLoaded", async () => {
  window.lucide?.createIcons();

  try {
    await requireAdminSession();
    await loadDashboard();
    bindEvents();
    activateTab("settings");
  } catch (error) {
    if (error.message !== "no_session") showAlert($("#dashboardAlert"), "error", "تعذر تحميل لوحة التحكم.");
  }
});

function bindEvents() {
  $$(".tab-button").forEach((button) => button.addEventListener("click", () => activateTab(button.dataset.tab)));
  $("#logoutButton").addEventListener("click", logout);
  $("#settingsForm").addEventListener("submit", saveSettings);
  $("#logoFileInput").addEventListener("change", handleLogoFile);
  $("#schoolNameInput").addEventListener("input", updateSettingsPreview);
  $("#logoInput").addEventListener("input", updateSettingsPreview);

  $("#studentForm").addEventListener("submit", saveStudent);
  $("#cancelStudentEdit").addEventListener("click", resetStudentForm);
  $("#studentSearch").addEventListener("input", renderStudents);
  $("#studentsTable").addEventListener("click", handleStudentTableClick);
  $("#deleteAllStudents").addEventListener("click", deleteAllStudents);
  $("#exportStudents").addEventListener("click", exportStudents);
  $("#excelInput").addEventListener("change", importStudentsFromExcel);

  $("#userForm").addEventListener("submit", saveUser);
  $("#cancelUserEdit").addEventListener("click", resetUserForm);
  $("#usersTable").addEventListener("click", handleUserTableClick);
}

async function loadDashboard() {
  const data = await requestJson("/api/admin/data", { auth: true });
  dashboard.settings = data.settings;
  dashboard.students = data.students;
  dashboard.users = data.users;
  applySettings(data.settings);
  renderStudents();
  renderUsers();
}

function applySettings(settings) {
  $$(".school-name").forEach((item) => {
    item.textContent = settings.schoolName;
  });
  $$(".school-logo").forEach((item) => {
    item.src = settings.logo;
    item.alt = settings.schoolName;
  });
  $("#schoolNameInput").value = settings.schoolName;
  $("#logoInput").value = settings.logo;
  updateSettingsPreview();
}

function updateSettingsPreview() {
  $("#schoolPreview").textContent = $("#schoolNameInput").value || "اسم المدرسة";
  $("#logoPreview").src = $("#logoInput").value || "assets/logo.svg";
}

function activateTab(tab) {
  dashboard.activeTab = tab;
  $$(".tab-panel").forEach((panel) => panel.classList.add("hidden"));
  $(`#${tab}Tab`).classList.remove("hidden");

  $$(".tab-button").forEach((button) => {
    const active = button.dataset.tab === tab;
    button.className = active
      ? "tab-button inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-teal-700 bg-teal-700 px-4 font-bold text-white shadow-sm transition"
      : "tab-button inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 font-bold text-slate-700 shadow-sm transition hover:border-teal-300";
  });
  clearAlert($("#dashboardAlert"));
  window.lucide?.createIcons();
}

async function logout() {
  await requestJson("/api/logout", { method: "POST", auth: true }).catch(() => {});
  setToken("");
  location.href = "admin-login.html";
}

async function handleLogoFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const dataUrl = await fileToDataUrl(file);
  $("#logoInput").value = dataUrl;
  updateSettingsPreview();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function saveSettings(event) {
  event.preventDefault();
  const alertBox = $("#dashboardAlert");
  clearAlert(alertBox);
  const payload = formToObject(event.currentTarget);
  if (!payload.schoolName || !payload.logo) {
    showAlert(alertBox, "warning", "اسم المدرسة والشعار مطلوبان.");
    return;
  }

  const button = $("#settingsButton");
  setButtonLoading(button, true, "جارٍ الحفظ...");
  try {
    const data = await requestJson("/api/settings", {
      method: "PUT",
      auth: true,
      body: payload
    });
    dashboard.settings = data.settings;
    applySettings(data.settings);
    showAlert(alertBox, "success", "تم حفظ إعدادات المدرسة.");
  } catch (error) {
    showAlert(alertBox, "error", error.message, error.details);
  } finally {
    setButtonLoading(button, false);
    window.lucide?.createIcons();
  }
}

async function saveStudent(event) {
  event.preventDefault();
  const alertBox = $("#dashboardAlert");
  clearAlert(alertBox);
  const form = event.currentTarget;
  const payload = formToObject(form);
  payload.civilId = normalizeDigits(payload.civilId);
  payload.track = "غير محدد";

  const errors = validateStudentPayload(payload);
  if (errors.length) {
    showAlert(alertBox, "warning", "يرجى تصحيح بيانات الطالب.", errors);
    return;
  }

  const editing = Boolean(payload.id);
  const button = $("#studentButton");
  setButtonLoading(button, true, "جارٍ الحفظ...");
  try {
    await requestJson(editing ? `/api/students/${encodeURIComponent(payload.id)}` : "/api/students", {
      method: editing ? "PUT" : "POST",
      auth: true,
      body: payload
    });
    await refreshStudents();
    resetStudentForm();
    showAlert(alertBox, "success", editing ? "تم تعديل بيانات الطالب." : "تمت إضافة الطالب.");
  } catch (error) {
    showAlert(alertBox, "error", error.message, error.details);
  } finally {
    setButtonLoading(button, false);
    window.lucide?.createIcons();
  }
}

function validateStudentPayload(payload) {
  const errors = [];
  if (!/^\d{6,12}$/.test(payload.civilId || "")) errors.push("الرقم المدني يجب أن يحتوي على أرقام فقط من 6 إلى 12 رقمًا.");
  if (!payload.name?.trim()) errors.push("اسم الطالب مطلوب.");
  if (!payload.grade?.trim()) errors.push("الصف مطلوب.");
  if (!payload.section?.trim()) errors.push("الشعبة مطلوبة.");
  return errors;
}

async function refreshStudents() {
  const data = await requestJson("/api/students", { auth: true });
  dashboard.students = data.students;
  renderStudents();
}

function renderStudents() {
  renderStudentStats();

  const query = normalizeDigits($("#studentSearch")?.value || "").toLowerCase();
  const rows = dashboard.students.filter((student) => {
    const haystack = `${student.civilId} ${student.name} ${student.grade} ${student.section} ${student.selectedTrack}`.toLowerCase();
    return haystack.includes(query);
  });

  $("#studentsCount").textContent = `${rows.length} طالب`;
  $("#studentsTable").innerHTML = rows.length
    ? rows.map((student) => `
      <tr class="hover:bg-slate-50">
        <td class="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">${escapeHtml(student.civilId)}</td>
        <td class="min-w-48 px-4 py-3">${escapeHtml(student.name)}</td>
        <td class="whitespace-nowrap px-4 py-3">${escapeHtml(student.grade)}</td>
        <td class="whitespace-nowrap px-4 py-3">${escapeHtml(student.section)}</td>
        <td class="whitespace-nowrap px-4 py-3">${trackBadge(student.selectedTrack || "-")}</td>
        <td class="whitespace-nowrap px-4 py-3">
          <div class="flex items-center gap-2">
            <button data-action="edit" data-id="${student.id}" class="inline-flex h-9 items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-3 font-bold text-sky-800 hover:bg-sky-100">
              <i data-lucide="pencil" class="h-4 w-4"></i>
              تعديل
            </button>
            <button data-action="delete" data-id="${student.id}" class="inline-flex h-9 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 font-bold text-rose-800 hover:bg-rose-100">
              <i data-lucide="trash" class="h-4 w-4"></i>
              حذف
            </button>
          </div>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="6" class="px-4 py-8 text-center text-slate-500">لا توجد بيانات طلاب.</td></tr>`;
  window.lucide?.createIcons();
}

function renderStudentStats() {
  const total = dashboard.students.length;
  const scientific = dashboard.students.filter((student) => student.selectedTrack === "علمي").length;
  const literary = dashboard.students.filter((student) => student.selectedTrack === "أدبي").length;
  const unselected = dashboard.students.filter((student) => !["علمي", "أدبي"].includes(student.selectedTrack)).length;
  const literaryToScientific = scientific > 0
    ? `${((literary / scientific) * 100).toFixed(1)}%`
    : literary > 0
      ? "لا يوجد علمي"
      : "0%";

  $("#statTotalStudents").textContent = total;
  $("#statScientificStudents").textContent = scientific;
  $("#statLiteraryStudents").textContent = literary;
  $("#statUnselectedStudents").textContent = unselected;
  $("#statLiteraryToScientific").textContent = literaryToScientific;
}

function trackBadge(value) {
  const text = value || "-";
  const color = text === "علمي"
    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
    : text === "أدبي"
      ? "bg-amber-50 text-amber-900 border-amber-200"
      : "bg-slate-50 text-slate-600 border-slate-200";
  return `<span class="inline-flex rounded-full border px-3 py-1 text-xs font-bold ${color}">${escapeHtml(text)}</span>`;
}

function handleStudentTableClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const student = dashboard.students.find((item) => item.id === button.dataset.id);
  if (!student) return;
  if (button.dataset.action === "edit") editStudent(student);
  if (button.dataset.action === "delete") deleteStudent(student);
}

function editStudent(student) {
  const form = $("#studentForm");
  form.elements.id.value = student.id;
  form.civilId.value = student.civilId;
  form.name.value = student.name;
  form.grade.value = student.grade;
  form.section.value = student.section;
  $("#studentFormTitle").textContent = "تعديل طالب";
  $("#cancelStudentEdit").classList.remove("hidden");
  activateTab("students");
  form.civilId.focus();
}

function resetStudentForm() {
  const form = $("#studentForm");
  form.reset();
  form.elements.id.value = "";
  $("#studentFormTitle").textContent = "إضافة طالب";
  $("#cancelStudentEdit").classList.add("hidden");
}

async function deleteStudent(student) {
  if (!confirm(`هل تريد حذف الطالب "${student.name}"؟`)) return;
  const alertBox = $("#dashboardAlert");
  try {
    await requestJson(`/api/students/${encodeURIComponent(student.id)}`, { method: "DELETE", auth: true });
    await refreshStudents();
    showAlert(alertBox, "success", "تم حذف الطالب.");
  } catch (error) {
    showAlert(alertBox, "error", error.message);
  }
}

async function deleteAllStudents() {
  if (!dashboard.students.length) {
    showAlert($("#dashboardAlert"), "info", "لا توجد بيانات لحذفها.");
    return;
  }
  if (!confirm("هل تريد حذف جميع الطلاب وجميع اختياراتهم؟")) return;
  try {
    await requestJson("/api/students", { method: "DELETE", auth: true });
    dashboard.students = [];
    renderStudents();
    showAlert($("#dashboardAlert"), "success", "تم حذف جميع الطلاب.");
  } catch (error) {
    showAlert($("#dashboardAlert"), "error", error.message);
  }
}

async function importStudentsFromExcel(event) {
  const file = event.target.files[0];
  const alertBox = $("#dashboardAlert");
  clearAlert(alertBox);
  if (!file) return;
  if (!window.XLSX) {
    showAlert(alertBox, "error", "تعذر تحميل مكتبة Excel. تأكد من اتصال الإنترنت ثم أعد تحميل الصفحة.");
    event.target.value = "";
    return;
  }

  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    const students = rows.map(mapExcelRow).filter((row) => Object.values(row).some(Boolean));
    if (!students.length) {
      showAlert(alertBox, "warning", "ملف Excel لا يحتوي على بيانات قابلة للاستيراد.");
      return;
    }

    const result = await requestJson("/api/students/import", {
      method: "POST",
      auth: true,
      body: { students }
    });
    dashboard.students = result.students;
    renderStudents();
    const skipped = result.skipped?.length ? [`تم تخطي ${result.skipped.length} صف بسبب بيانات ناقصة أو مكررة.`] : [];
    showAlert(alertBox, result.skipped?.length ? "warning" : "success", `تم استيراد ${result.added} طالب.`, skipped);
  } catch (error) {
    showAlert(alertBox, "error", error.message || "تعذر استيراد ملف Excel.");
  } finally {
    event.target.value = "";
  }
}

function mapExcelRow(row) {
  const normalized = {};
  Object.entries(row).forEach(([key, value]) => {
    normalized[normalizeHeader(key)] = value;
  });
  return {
    civilId: normalized["الرقمالمدني"] || normalized["رقممدني"] || normalized["civilid"] || normalized["civil"] || "",
    name: normalized["الاسم"] || normalized["اسمالطالب"] || normalized["name"] || "",
    grade: normalized["الصف"] || normalized["grade"] || "",
    section: normalized["الشعبة"] || normalized["section"] || "",
    track: normalized["التشعيب"] || normalized["track"] || "غير محدد"
  };
}

function normalizeHeader(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[ـ_\-.]/g, "");
}

function exportStudents() {
  if (!window.XLSX) {
    showAlert($("#dashboardAlert"), "error", "تعذر تحميل مكتبة Excel. تأكد من اتصال الإنترنت ثم أعد تحميل الصفحة.");
    return;
  }
  const rows = dashboard.students.map((student) => ({
    "الرقم المدني": student.civilId,
    "الاسم": student.name,
    "الصف": student.grade,
    "الشعبة": student.section,
    "اختيار الطالب": student.selectedTrack || "",
    "تاريخ الحفظ": student.selectedAt ? formatDate(student.selectedAt) : ""
  }));
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "الطلاب");
  XLSX.writeFile(workbook, "students.xlsx");
}

async function saveUser(event) {
  event.preventDefault();
  const alertBox = $("#dashboardAlert");
  clearAlert(alertBox);
  const form = event.currentTarget;
  const payload = formToObject(form);
  const editing = Boolean(payload.id);

  if (!payload.fullName?.trim() || !payload.username?.trim() || (!editing && !payload.password)) {
    showAlert(alertBox, "warning", "يرجى إدخال الاسم الكامل واسم المستخدم وكلمة المرور.");
    return;
  }
  if (payload.password && payload.password.length < 4) {
    showAlert(alertBox, "warning", "كلمة المرور يجب أن تكون 4 أحرف على الأقل.");
    return;
  }

  const button = $("#userButton");
  setButtonLoading(button, true, "جارٍ الحفظ...");
  try {
    await requestJson(editing ? `/api/users/${encodeURIComponent(payload.id)}` : "/api/users", {
      method: editing ? "PUT" : "POST",
      auth: true,
      body: payload
    });
    await refreshUsers();
    resetUserForm();
    showAlert(alertBox, "success", editing ? "تم تعديل المستخدم." : "تمت إضافة المستخدم.");
  } catch (error) {
    showAlert(alertBox, "error", error.message, error.details);
  } finally {
    setButtonLoading(button, false);
    window.lucide?.createIcons();
  }
}

async function refreshUsers() {
  const data = await requestJson("/api/users", { auth: true });
  dashboard.users = data.users;
  renderUsers();
}

function renderUsers() {
  $("#usersCount").textContent = `${dashboard.users.length} مستخدم`;
  $("#usersTable").innerHTML = dashboard.users.length
    ? dashboard.users.map((user) => `
      <tr class="hover:bg-slate-50">
        <td class="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">${escapeHtml(user.fullName)}</td>
        <td class="whitespace-nowrap px-4 py-3">${escapeHtml(user.username)}</td>
        <td class="whitespace-nowrap px-4 py-3">
          <span class="inline-flex rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800">${escapeHtml(user.role || "admin")}</span>
        </td>
        <td class="whitespace-nowrap px-4 py-3">
          <div class="flex items-center gap-2">
            <button data-action="edit" data-id="${user.id}" class="inline-flex h-9 items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-3 font-bold text-sky-800 hover:bg-sky-100">
              <i data-lucide="pencil" class="h-4 w-4"></i>
              تعديل
            </button>
            <button data-action="delete" data-id="${user.id}" class="inline-flex h-9 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 font-bold text-rose-800 hover:bg-rose-100">
              <i data-lucide="trash" class="h-4 w-4"></i>
              حذف
            </button>
          </div>
        </td>
      </tr>
    `).join("")
    : `<tr><td colspan="4" class="px-4 py-8 text-center text-slate-500">لا يوجد مستخدمون.</td></tr>`;
  window.lucide?.createIcons();
}

function handleUserTableClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const user = dashboard.users.find((item) => item.id === button.dataset.id);
  if (!user) return;
  if (button.dataset.action === "edit") editUser(user);
  if (button.dataset.action === "delete") deleteUser(user);
}

function editUser(user) {
  const form = $("#userForm");
  form.elements.id.value = user.id;
  form.fullName.value = user.fullName;
  form.username.value = user.username;
  form.password.value = "";
  $("#userFormTitle").textContent = "تعديل مستخدم";
  $("#passwordHint").classList.remove("hidden");
  $("#cancelUserEdit").classList.remove("hidden");
  activateTab("users");
  form.fullName.focus();
}

function resetUserForm() {
  const form = $("#userForm");
  form.reset();
  form.elements.id.value = "";
  $("#userFormTitle").textContent = "إضافة مستخدم";
  $("#passwordHint").classList.add("hidden");
  $("#cancelUserEdit").classList.add("hidden");
}

async function deleteUser(user) {
  if (!confirm(`هل تريد حذف المستخدم "${user.fullName}"؟`)) return;
  const alertBox = $("#dashboardAlert");
  try {
    await requestJson(`/api/users/${encodeURIComponent(user.id)}`, { method: "DELETE", auth: true });
    await refreshUsers();
    showAlert(alertBox, "success", "تم حذف المستخدم.");
  } catch (error) {
    showAlert(alertBox, "error", error.message);
  }
}
