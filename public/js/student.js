let currentStudent = null;

document.addEventListener("DOMContentLoaded", async () => {
  window.lucide?.createIcons();
  await loadSchoolBrand().catch(() => {});

  $("#searchForm").addEventListener("submit", handleSearch);
  $("#selectionForm").addEventListener("submit", handleSave);
});

async function handleSearch(event) {
  event.preventDefault();
  const alertBox = $("#studentAlert");
  clearAlert(alertBox);
  $("#studentPanel").classList.add("hidden");
  currentStudent = null;

  const civilId = normalizeDigits($("#civilIdInput").value);
  if (!civilId) {
    showAlert(alertBox, "warning", "يرجى إدخال الرقم المدني.");
    return;
  }

  const button = $("#searchButton");
  setButtonLoading(button, true, "جارٍ البحث...");
  try {
    const data = await requestJson(`/api/students/search?civilId=${encodeURIComponent(civilId)}`);
    currentStudent = data.student;
    $("#studentName").textContent = data.student.name;
    $("#studentGrade").textContent = data.student.grade;
    $("#studentSection").textContent = data.student.section;
    $("#selectedTrack").value = data.student.selectedTrack || "";
    $("#studentPanel").classList.remove("hidden");
    showAlert(alertBox, "success", "تم العثور على بيانات الطالب.");
  } catch (error) {
    showAlert(alertBox, "error", error.message, error.details);
  } finally {
    setButtonLoading(button, false);
    window.lucide?.createIcons();
  }
}

async function handleSave(event) {
  event.preventDefault();
  const alertBox = $("#studentAlert");
  clearAlert(alertBox);
  if (!currentStudent) {
    showAlert(alertBox, "warning", "ابحث عن الطالب أولًا قبل الحفظ.");
    return;
  }
  const selectedTrack = $("#selectedTrack").value;
  if (!selectedTrack) {
    showAlert(alertBox, "warning", "يرجى اختيار الشعبة الجديدة.");
    return;
  }

  const button = $("#saveButton");
  setButtonLoading(button, true, "جارٍ الحفظ...");
  try {
    const data = await requestJson("/api/selections", {
      method: "POST",
      body: {
        civilId: currentStudent.civilId,
        selectedTrack
      }
    });
    currentStudent.selectedTrack = selectedTrack;
    showAlert(alertBox, "success", data.message || "تم حفظ الاختيار بنجاح.");
  } catch (error) {
    showAlert(alertBox, "error", error.message, error.details);
  } finally {
    setButtonLoading(button, false);
    window.lucide?.createIcons();
  }
}
