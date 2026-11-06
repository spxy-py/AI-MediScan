const API_ENDPOINT = "/predict";
const MAX_FILE_SIZE_MB = 10;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/jpg"];

const elements = {
  tabUpload: document.getElementById("tab-upload"),
  tabCamera: document.getElementById("tab-camera"),
  uploadMode: document.getElementById("upload-mode"),
  cameraMode: document.getElementById("camera-mode"),
  dropZone: document.getElementById("drop-zone"),
  fileInput: document.getElementById("file-input"),
  selectFileBtn: document.getElementById("select-file-btn"),
  cameraStartBtn: document.getElementById("camera-start-btn"),
  cameraCaptureBtn: document.getElementById("camera-capture-btn"),
  cameraStream: document.getElementById("camera-stream"),
  cameraCanvas: document.getElementById("camera-canvas"),
  previewWrap: document.getElementById("preview-wrap"),
  previewImg: document.getElementById("preview-img"),
  previewRemoveBtn: document.getElementById("preview-remove-btn"),
  uploadError: document.getElementById("upload-error"),
  step2Section: document.getElementById("step-2"),
  resultEmptyText: document.getElementById("result-empty-text"),
  resultSkeleton: document.getElementById("result-skeleton"),
  resultContent: document.getElementById("result-content"),
  resultWoundType: document.getElementById("result-wound-type"),
  resultConfidenceText: document.getElementById("result-confidence-text"),
  confidenceBarFill: document.getElementById("confidence-bar-fill"),
  analyzeBtn: document.getElementById("analyze-btn"),
  assistantStatus: document.getElementById("assistant-status"),
  assistantIdle: document.getElementById("assistant-idle"),
  assistantResults: document.getElementById("assistant-results"),
  riskLevelText: document.getElementById("risk-level-text"),
  riskChip: document.getElementById("risk-chip"),
  adviceList: document.getElementById("advice-list"),
  warningBox: document.getElementById("warning-box"),
  warningText: document.getElementById("warning-text"),
  seeDoctorText: document.getElementById("see-doctor-text"),
};

let currentObjectURL = null;
let cameraStream = null;
let lastAnalysisBlob = null;

function init() {
  elements.tabUpload.addEventListener("click", () => switchTab("upload"));
  elements.tabCamera.addEventListener("click", () => switchTab("camera"));
  elements.selectFileBtn.addEventListener("click", () => elements.fileInput.click());
  elements.fileInput.addEventListener("change", handleFileInput);
  elements.dropZone.addEventListener("click", () => elements.fileInput.click());
  elements.dropZone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      elements.fileInput.click();
    }
  });
  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, preventDefaults);
  });
  elements.dropZone.addEventListener("drop", handleDrop);
  elements.previewRemoveBtn.addEventListener("click", clearPreview);
  elements.cameraStartBtn.addEventListener("click", startCamera);
  elements.cameraCaptureBtn.addEventListener("click", capturePhoto);
  elements.analyzeBtn.addEventListener("click", (event) => {
    event.preventDefault();
    if (lastAnalysisBlob) {
      analyzeFile(lastAnalysisBlob);
    } else {
      showToast("กรุณาเลือกภาพหรือถ่ายภาพก่อน");
    }
  });

  switchTab("upload");
  clearResults();
  hideWarning();
  disableAnalyzeButton(true);
}

function preventDefaults(event) {
  event.preventDefault();
  event.stopPropagation();
}

function handleDrop(event) {
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    handleFile(file);
  }
}

function handleFileInput(event) {
  const file = event.target.files?.[0];
  if (file) {
    handleFile(file);
  }
  event.target.value = "";
}

function switchTab(mode) {
  const isUpload = mode === "upload";
  elements.tabUpload.classList.toggle("active", isUpload);
  elements.tabCamera.classList.toggle("active", !isUpload);
  elements.tabUpload.setAttribute("aria-selected", String(isUpload));
  elements.tabCamera.setAttribute("aria-selected", String(!isUpload));
  elements.uploadMode.style.display = isUpload ? "" : "none";
  elements.cameraMode.style.display = isUpload ? "none" : "";
  if (isUpload) {
    stopCamera();
  } else {
    startCamera();
  }
}

function handleFile(file) {
  clearError();

  if (!ALLOWED_IMAGE_TYPES.includes(file.type.toLowerCase())) {
    setError("รองรับเฉพาะไฟล์ภาพ JPG หรือ PNG เท่านั้น");
    return;
  }

  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    setError(`ขนาดไฟล์ต้องไม่เกิน ${MAX_FILE_SIZE_MB}MB`);
    return;
  }

  const objectURL = URL.createObjectURL(file);
  setPreviewImage(objectURL);
  lastAnalysisBlob = file;
  disableAnalyzeButton(false);
  switchTab("upload");
  analyzeFile(file);
}

function setPreviewImage(url) {
  releaseObjectURL();
  currentObjectURL = url;
  elements.previewImg.src = url;
  elements.previewWrap.style.display = "block";
}

function clearPreview() {
  releaseObjectURL();
  elements.previewImg.removeAttribute("src");
  elements.previewWrap.style.display = "none";
  lastAnalysisBlob = null;
  disableAnalyzeButton(true);
  clearResults();
}

function releaseObjectURL() {
  if (currentObjectURL) {
    URL.revokeObjectURL(currentObjectURL);
    currentObjectURL = null;
  }
}

function disableAnalyzeButton(disabled) {
  elements.analyzeBtn.disabled = disabled;
}

async function analyzeFile(file) {
  clearWarning();
  showLoading("กำลังวิเคราะห์ภาพ...");

  try {
    const formData = new FormData();
    formData.append("file", file, file.name || "upload.jpg");

    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      body: formData,
    });

    let payload;
    try {
      payload = await response.json();
    } catch (jsonError) {
      const text = await response.text();
      payload = text;
    }

    if (!response.ok) {
      const message = payload?.detail || payload?.message || payload || "เกิดข้อผิดพลาดระหว่างวิเคราะห์";
      throw new Error(message);
    }

    displayResult(payload);
  } catch (error) {
    console.error(error);
    setError(error.message || "ไม่สามารถวิเคราะห์ภาพได้");
    setResultsError("เกิดข้อผิดพลาดขณะวิเคราะห์ กรุณาลองอีกครั้ง");
  }
}

function displayResult(data) {
  const summary = summarizePrediction(data);
  elements.resultWoundType.innerText = summary.title;
  elements.resultConfidenceText.innerText = summary.confidenceText;
  elements.confidenceBarFill.style.width = summary.confidenceBar;
  setResultsContent();
  setAssistantResult(summary.detailsText);
}

function summarizePrediction(data) {
  if (typeof data === "string") {
    return {
      title: data,
      confidenceText: "—",
      confidenceBar: "100%",
      detailsText: data,
    };
  }

  if (!data || typeof data !== "object") {
    return {
      title: "วิเคราะห์สำเร็จ",
      confidenceText: "—",
      confidenceBar: "100%",
      detailsText: String(data),
    };
  }

  if (data.wound_type) {
    const confidenceValue = Number.isFinite(Number(data.confidence)) ? Number(data.confidence) : null;
    return {
      title: String(data.wound_type),
      confidenceText: Number.isFinite(confidenceValue) ? `${(confidenceValue * 100).toFixed(1)}%` : "—",
      confidenceBar: Number.isFinite(confidenceValue) ? `${Math.min(100, Math.max(0, confidenceValue * 100)).toFixed(0)}%` : "100%",
      detailsText: JSON.stringify(data, null, 2),
    };
  }

  const prediction = extractMainPrediction(data);
  const title = prediction?.label || data.label || data.class || data.name || "ไม่พบผลการวิเคราะห์";
  const confidenceValue = prediction?.confidence ?? getConfidenceFromObject(data);
  const confidenceText = Number.isFinite(confidenceValue)
    ? `${(confidenceValue * 100).toFixed(1)}%`
    : "—";
  const confidenceBar = Number.isFinite(confidenceValue)
    ? `${Math.min(100, Math.max(0, confidenceValue * 100)).toFixed(0)}%`
    : "100%";
  const detailsText = typeof data === "object" ? JSON.stringify(data, null, 2) : String(data);

  return { title, confidenceText, confidenceBar, detailsText };
}

function extractMainPrediction(data) {
  if (!data || typeof data !== "object") return null;

  const candidates = [];
  if (Array.isArray(data.predictions)) candidates.push(...data.predictions);
  if (Array.isArray(data.results)) candidates.push(...data.results);
  if (Array.isArray(data.boxes)) candidates.push(...data.boxes);
  if (Array.isArray(data)) candidates.push(...data);

  if (candidates.length > 0) {
    const candidate = candidates[0];
    const label = candidate.label || candidate.class || candidate.name || resolveClsLabel(candidate, data);
    const confidence = getConfidenceFromObject(candidate);
    return { label, confidence };
  }

  const boxPrediction = extractBoxPrediction(data);
  if (boxPrediction) return boxPrediction;

  return null;
}

function extractBoxPrediction(data) {
  const boxData = Array.isArray(data.boxes) && data.boxes.length > 0 ? data.boxes[0] : null;
  if (!boxData) return null;

  const cls = boxData.cls ?? boxData.class ?? boxData.category;
  const label = resolveClsLabel(boxData, data) || boxData.label || boxData.name || (Number.isFinite(Number(cls)) ? `คลาส ${cls}` : null);
  const confidence = getConfidenceFromObject(boxData);
  return { label, confidence };
}

function resolveClsLabel(candidate, root) {
  const cls = candidate.cls ?? candidate.class ?? candidate.category;
  if (cls == null) return null;
  if (typeof cls === "string") return cls;

  if (root?.names && (root.names[cls] || root.names[String(cls)])) {
    return root.names[cls] || root.names[String(cls)];
  }

  if (root?.class_names && (root.class_names[cls] || root.class_names[String(cls)])) {
    return root.class_names[cls] || root.class_names[String(cls)];
  }

  return null;
}

function getConfidenceFromObject(obj) {
  if (obj == null || typeof obj !== "object") return null;
  const value = obj.confidence ?? obj.probability ?? obj.score ?? obj.confidence_score;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function setAssistantResult(details) {
  elements.assistantStatus.innerText = "วิเคราะห์เสร็จแล้ว";
  elements.assistantIdle.style.display = "none";
  elements.assistantResults.style.display = "block";
  elements.riskLevelText.innerText = "พร้อมใช้งาน";
  elements.riskChip.innerText = "วิเคราะห์แล้ว";
  elements.warningBox.style.display = "none";
  elements.adviceList.innerHTML = `<li>ระบบวิเคราะห์ภาพแล้ว</li><li>ข้อมูลเพิ่มเติม: ${truncateText(details, 180)}</li>`;
  elements.seeDoctorText.innerText = "ดูผลลัพธ์ด้านบนและปรึกษาแพทย์หากมีอาการรุนแรง";
}

function truncateText(text, maxLength) {
  const str = String(text || "");
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength)}...`;
}

function setResultsContent() {
  elements.resultEmptyText.style.display = "none";
  elements.resultSkeleton.style.display = "none";
  elements.resultContent.style.display = "block";
  toggleStep2(true);
}

function clearResults() {
  elements.resultEmptyText.style.display = "block";
  elements.resultSkeleton.style.display = "none";
  elements.resultContent.style.display = "none";
  elements.resultWoundType.innerText = "—";
  elements.resultConfidenceText.innerText = "—";
  elements.confidenceBarFill.style.width = "0%";
  elements.assistantStatus.innerText = "Draft";
  elements.assistantIdle.style.display = "block";
  elements.assistantResults.style.display = "none";
  elements.adviceList.innerHTML = "";
  elements.riskLevelText.innerText = "—";
  elements.riskChip.innerText = "—";
  elements.seeDoctorText.innerText = "";
  toggleStep2(false);
}

function toggleStep2(enabled) {
  if (!elements.step2Section) return;
  elements.step2Section.classList.toggle("is-disabled", !enabled);
}

function showLoading(message) {
  elements.resultEmptyText.style.display = "none";
  elements.resultSkeleton.style.display = "block";
  elements.resultContent.style.display = "none";
  elements.resultWoundType.innerText = message;
  elements.resultConfidenceText.innerText = "—";
  elements.confidenceBarFill.style.width = "0%";
  toggleStep2(true);
}

function setError(message) {
  elements.uploadError.innerText = message;
  elements.uploadError.classList.add("active");
}

function clearError() {
  elements.uploadError.innerText = "";
  elements.uploadError.classList.remove("active");
}

function setResultsError(message) {
  elements.resultEmptyText.style.display = "none";
  elements.resultSkeleton.style.display = "none";
  elements.resultContent.style.display = "block";
  elements.resultWoundType.innerText = message;
  elements.resultConfidenceText.innerText = "—";
  elements.confidenceBarFill.style.width = "0%";
  toggleStep2(true);
}

function showWarning(message) {
  elements.warningText.innerText = message;
  elements.warningBox.style.display = "flex";
}

function hideWarning() {
  elements.warningBox.style.display = "none";
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setError("เบราว์เซอร์ของคุณไม่รองรับกล้อง");
    return;
  }

  if (cameraStream) {
    elements.cameraCaptureBtn.style.display = "inline-flex";
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    cameraStream = stream;
    elements.cameraStream.srcObject = stream;
    elements.cameraStream.muted = true;
    elements.cameraStream.setAttribute("playsinline", "true");
    elements.cameraStream.style.display = "block";
    await elements.cameraStream.play();
    elements.cameraCaptureBtn.style.display = "inline-flex";
    showToast("เปิดกล้องเรียบร้อยแล้ว สามารถถ่ายภาพได้ทันที");
  } catch (err) {
    console.error(err);
    setError("ไม่สามารถเข้าถึงกล้องได้ กรุณาอนุญาตการใช้กล้องและลองใหม่");
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }
  if (elements.cameraStream) {
    try {
      elements.cameraStream.pause();
    } catch (err) {
      // ignore
    }
    elements.cameraStream.srcObject = null;
    elements.cameraStream.style.display = "none";
  }
  elements.cameraCaptureBtn.style.display = "none";
}

function capturePhoto() {
  if (!cameraStream) {
    setError("ยังไม่ได้เปิดกล้อง");
    return;
  }

  const video = elements.cameraStream;
  const canvas = elements.cameraCanvas;
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const context = canvas.getContext("2d");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.toBlob((blob) => {
    if (blob) {
      const photoFile = new File([blob], "capture.jpg", { type: "image/jpeg" });
      handleFile(photoFile);
      stopCamera();
      showToast("ถ่ายภาพเรียบร้อยแล้ว กำลังวิเคราะห์...");
    } else {
      setError("ไม่สามารถถ่ายภาพได้ กรุณาลองใหม่");
    }
  }, "image/jpeg");
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.innerText = message;
  toast.classList.add("show");
  window.clearTimeout(showToast._timeout);
  showToast._timeout = window.setTimeout(() => toast.classList.remove("show"), 3200);
}

window.addEventListener("DOMContentLoaded", init);