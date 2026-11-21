document.addEventListener("DOMContentLoaded", async () => {
  window.lucide?.createIcons();
  await loadSchoolBrand().catch(() => {});
  $("#loginForm").addEventListener("submit", handleLogin);
});

async function handleLogin(event) {
  event.preventDefault();
  const alertBox = $("#loginAlert");
  clearAlert(alertBox);
  const form = event.currentTarget;
  const payload = formToObject(form);

  if (!payload.username || !payload.password) {
    showAlert(alertBox, "warning", "يرجى إدخال اسم المستخدم وكلمة المرور.");
    return;
  }

  const button = $("#loginButton");
  setButtonLoading(button, true, "جارٍ الدخول...");
  try {
    const data = await requestJson("/api/login", {
      method: "POST",
      body: payload
    });
    setToken(data.token);
    location.href = "dashboard.html";
  } catch (error) {
    showAlert(alertBox, "error", error.message);
  } finally {
    setButtonLoading(button, false);
    window.lucide?.createIcons();
  }
}
