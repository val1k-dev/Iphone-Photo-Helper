const { ipcRenderer } = require("electron");
let selectedSrcHwnd = null;
let selectedDstHwnd = null;
let currentLang = "en";
let copiedFolders = new Set();
let isCopying = false;

function minimizeWindow() {
  ipcRenderer.invoke('minimize-window');
}

function closeWindow() {
  ipcRenderer.invoke('close-window');
}

const translations = {
  en: {
    step1_title: "Step 1: Select Windows",
    step1_desc:
      "Open two File Explorer windows: Source (iPhone) and Destination",
    btn_refresh: "Refresh",
    btn_show_folders: "Show",
    step2_title: "Step 2: Choose Folder",
    step2_desc: "Select which folder to copy from Source to Destination",
    step3_title: "Step 3: Progress",
    step4_title: "Step 4: Compare & Sync",
    step4_desc: "Select source and destination windows, then choose a folder to compare and copy only missing files",
    compare_btn: "Compare & Copy Missing",
    comparing: "Comparing files...",
    comparing_phase: "Comparing files",
    copying_phase: "Copying missing files",
    found_missing: "Found missing files",
    no_missing: "No missing files found",
    source: "Source",
    destination: "Destination",
    enumerating: "Enumerating File Explorer windows...",
    no_windows:
      "No File Explorer windows found. Please open one to your photos location.",
    loading_folders: "Loading folders from Source...",
    select_both: "Please select both Source and Destination windows above.",
    no_folders: "No folders found in Source window.",
    copy_btn: "Copy",
    copying: "Copying files from",
    copying_in_progress: "Copying in progress, please wait...",
    in_progress_btn: "In Progress...",
    copied_success: "Copied",
    files_from: "files from",
    to: "to",
    copy_failed: "Copy failed:",
    unknown_error: "Unknown error",
  },
  ru: {
    step1_title: "Шаг 1: Выберите окна",
    step1_desc:
      "Откройте два окна Проводника: Источник (iPhone) и папку назначения",
    btn_refresh: "Обновить",
    btn_show_folders: "Показать",
    step2_title: "Шаг 2: Выберите папку",
    step2_desc: "Выберите, какую папку копировать из Источника в Назначение",
    step3_title: "Шаг 3: Прогресс",
    step4_title: "Шаг 4: Сравнение и синхронизация",
    step4_desc: "Выберите окна источника и назначения, затем выберите папку для сравнения и копирования отсутствующих файлов",
    compare_btn: "Сравнить и скопировать отсутствующие",
    comparing: "Сравнение файлов...",
    comparing_phase: "Сравнение файлов",
    copying_phase: "Копирование отсутствующих файлов",
    found_missing: "Найдены отсутствующие файлы",
    no_missing: "Отсутствующие файлы не найдены",
    source: "Источник",
    destination: "Назначение",
    enumerating: "Перечисление окон Проводника...",
    no_windows:
      "Окна Проводника не найдены. Откройте окно с папкой фотографий.",
    loading_folders: "Загрузка папок из Источника...",
    select_both: "Выберите оба окна: Источник и Назначение выше.",
    no_folders: "Папки не найдены в окне Источника.",
    copy_btn: "Копировать",
    copying: "Копирование файлов из",
    copying_in_progress: "Идёт копирование, подождите немного...",
    in_progress_btn: "В процессе...",
    copied_success: "Скопировано",
    files_from: "файлов из",
    to: "в",
    copy_failed: "Ошибка копирования:",
    unknown_error: "Неизвестная ошибка",
  },
};

function t(key) {
  return translations[currentLang][key] || key;
}

function updateLanguage() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    el.textContent = t(key);
  });
  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === currentLang);
  });
}

async function switchLanguage(lang) {
  currentLang = lang;
  updateLanguage();
  await ipcRenderer.invoke("save-config", { language: lang });
}

async function loadLanguage() {
  const config = await ipcRenderer.invoke("load-config");
  currentLang = config.language || "en";
  updateLanguage();
}

function statusMessage(text, type = "") {
  const div = document.createElement("div");
  div.className = `status-message ${type}`;
  div.textContent = text;
  return div;
}

function updateShowFoldersButton() {
  const btn = document.getElementById("btn-show-folders");
  if (selectedSrcHwnd && selectedDstHwnd) {
    btn.disabled = false;
  } else {
    btn.disabled = true;
  }
}

async function refreshExplorerWindows() {
  const holder = document.getElementById("explorer-windows");
  holder.innerHTML = "";
  holder.appendChild(statusMessage(t("enumerating"), "working"));
  
  // Reset selections and copied folders
  selectedSrcHwnd = null;
  selectedDstHwnd = null;
  copiedFolders.clear();
  updateShowFoldersButton();
  
  try {
    const wins = await ipcRenderer.invoke("list-explorer-windows");
    holder.innerHTML = "";
    if (!wins || wins.length === 0) {
      holder.appendChild(statusMessage(t("no_windows")));
      return;
    }
    wins.forEach((w) => {
      const item = document.createElement("div");
      item.className = "window-item";
      item.innerHTML = `
							<div class="window-header">
								<div class="radio-group">
									<label class="radio-label">
										<input type="radio" name="srcWindow" value="${w.Hwnd}">
										<span data-i18n="source">${t("source")}</span>
									</label>
									<label class="radio-label">
										<input type="radio" name="dstWindow" value="${w.Hwnd}">
										<span data-i18n="destination">${t("destination")}</span>
									</label>
								</div>
							</div>
							<div class="window-title">${w.Title || "File Explorer"}</div>
							<div class="window-path">${w.Path || "Shell namespace (MTP/WPD)"}</div>
						`;
      const srcRadio = item.querySelector('input[name="srcWindow"]');
      const dstRadio = item.querySelector('input[name="dstWindow"]');
      
      srcRadio.onclick = () => {
        if (selectedSrcHwnd === w.Hwnd) {
          // Deselect if clicking the same source
          selectedSrcHwnd = null;
          item.classList.remove("selected-src");
          srcRadio.checked = false;
        } else {
          // Select new source
          selectedSrcHwnd = w.Hwnd;
          document
            .querySelectorAll(".window-item")
            .forEach((i) => i.classList.remove("selected-src"));
          item.classList.add("selected-src");
          
          // Disable dst radio for selected src window
          document.querySelectorAll('input[name="dstWindow"]').forEach(radio => {
            radio.disabled = false;
          });
          dstRadio.disabled = true;
        }
        updateShowFoldersButton();
      };
      
      dstRadio.onclick = () => {
        if (selectedDstHwnd === w.Hwnd) {
          // Deselect if clicking the same destination
          selectedDstHwnd = null;
          item.classList.remove("selected-dst");
          dstRadio.checked = false;
        } else {
          // Select new destination
          selectedDstHwnd = w.Hwnd;
          document
            .querySelectorAll(".window-item")
            .forEach((i) => i.classList.remove("selected-dst"));
          item.classList.add("selected-dst");
          
          // Disable src radio for selected dst window
          document.querySelectorAll('input[name="srcWindow"]').forEach(radio => {
            radio.disabled = false;
          });
          srcRadio.disabled = true;
        }
        updateShowFoldersButton();
      };
      
      // Initial disable state
      if (selectedSrcHwnd === w.Hwnd) {
        dstRadio.disabled = true;
      }
      if (selectedDstHwnd === w.Hwnd) {
        srcRadio.disabled = true;
      }
      
      holder.appendChild(item);
    });
  } catch (e) {
    holder.innerHTML = "";
    holder.appendChild(statusMessage(`Error: ${e.message || e}`, "error"));
  }
}

async function listSourceFolders() {
  const out = document.getElementById("folder-list");
  out.innerHTML = "";
  if (!selectedSrcHwnd || !selectedDstHwnd) {
    out.appendChild(statusMessage(t("select_both")));
    return;
  }
  out.appendChild(statusMessage(t("loading_folders"), "working"));
  try {
    const res = await ipcRenderer.invoke(
      "list-source-folders",
      selectedSrcHwnd
    );
    out.innerHTML = "";
    if (!res || !res.Ok) {
      out.appendChild(
        statusMessage(
          `${t("copy_failed")} ${
            res && res.Error ? res.Error : t("unknown_error")
          }`,
          "error"
        )
      );
      return;
    }
    if (!res.Folders || res.Folders.length === 0) {
      out.appendChild(statusMessage(t("no_folders")));
      return;
    }
    const grid = document.createElement("div");
    grid.className = "folder-grid";
    res.Folders.forEach((name) => {
      const card = document.createElement("div");
      card.className = "folder-card";
      card.dataset.folderName = name;
      
      const isCompleted = copiedFolders.has(name);
      if (isCompleted) {
        card.classList.add("completed");
      }
      
      card.innerHTML = `
							<div class="folder-name">${name}</div>
							<button class="btn copy-folder-btn" data-folder="${name}" onclick="copyFolderFiles('${name.replace(
                /'/g,
                "\\'"
              )}')" ${isCompleted || isCopying ? 'disabled' : ''}><span>${t("copy_btn")}</span></button>
						`;
      grid.appendChild(card);
    });
    out.appendChild(grid);
  } catch (e) {
    out.innerHTML = "";
    out.appendChild(statusMessage(`Error: ${e.message || e}`, "error"));
  }
}

async function copyFolderFiles(folderName) {
  // Prevent multiple simultaneous copies
  if (isCopying) {
    return;
  }
  
  isCopying = true;
  
  // Find and update the button for this folder
  const folderCard = document.querySelector(`[data-folder-name="${folderName}"]`);
  const btn = folderCard?.querySelector('.btn');
  const btnText = btn?.querySelector('span');
  const originalText = btnText?.textContent;
  
  // Disable all copy buttons and update text for current button
  document.querySelectorAll('.copy-folder-btn').forEach(b => b.disabled = true);
  if (btnText) btnText.textContent = t("in_progress_btn");
  
  const out = document.getElementById("copy-output");
  out.innerHTML = "";
  
  // First, count files
  const countRes = await ipcRenderer.invoke(
    "count-files-in-folder",
    selectedSrcHwnd,
    folderName
  );
  
  if (!countRes || !countRes.Ok) {
    out.appendChild(
      statusMessage(
        `${t("copy_failed")} ${countRes?.Error || t("unknown_error")}`,
        "error"
      )
    );
    return;
  }
  
  const totalFiles = countRes.Count;
  
  // Show progress UI with real count
  const progressDiv = document.createElement("div");
  progressDiv.className = "copy-progress";
  progressDiv.innerHTML = `
    <div class="copy-progress-header">
      <div class="copy-progress-title">${t("copying")} "${folderName}"</div>
      <div class="copy-progress-stats"><span id="current-file-count">0</span> / <span id="total-file-count">${totalFiles}</span></div>
    </div>
    <div class="copy-progress-bar">
      <div class="copy-progress-fill" id="progress-fill" style="width: 0%"></div>
    </div>
    <div class="copy-progress-file" id="current-file-name">${t("copying_in_progress")}</div>
  `;
  out.appendChild(progressDiv);
  
  // Listen for progress updates
  const progressHandler = (event, data) => {
    const currentCount = document.getElementById("current-file-count");
    const currentFile = document.getElementById("current-file-name");
    const progressFill = document.getElementById("progress-fill");
    
    if (currentCount) currentCount.textContent = data.copied;
    if (currentFile) currentFile.textContent = data.fileName;
    if (progressFill && totalFiles > 0) {
      const percent = (data.copied / totalFiles) * 100;
      progressFill.style.width = `${percent}%`;
    }
  };
  
  ipcRenderer.on('copy-progress', progressHandler);
  
  try {
    const res = await ipcRenderer.invoke(
      "copy-folder-files-serial",
      selectedSrcHwnd,
      folderName,
      selectedDstHwnd
    );
    
    // Remove progress listener
    ipcRenderer.removeListener('copy-progress', progressHandler);
    
    if (!res || !res.Ok) {
      out.innerHTML = "";
      out.appendChild(
        statusMessage(
          `${t("copy_failed")} ${
            res && res.Error ? res.Error : t("unknown_error")
          }`,
          "error"
        )
      );
      return;
    }
    
    // Mark folder as completed
    copiedFolders.add(folderName);
    
    // Update folder card to show completed state
    const folderCard = document.querySelector(`[data-folder-name="${folderName}"]`);
    if (folderCard) {
      folderCard.classList.add("completed");
      const btn = folderCard.querySelector(".btn");
      if (btn) {
        btn.disabled = true;
      }
    }
    
    // Show completion with final progress
    const progressFill = document.getElementById("progress-fill");
    if (progressFill) progressFill.style.width = "100%";
    
    setTimeout(() => {
      out.innerHTML = "";
      out.appendChild(
        statusMessage(
          `✅ ${t("copied_success")} ${res.Copied} ${t("files_from")} "${
            res.Src
          }" ${t("to")} ${res.Dst}`,
          "success"
        )
      );
      const errs = res.Errors || [];
      if (errs.length > 0) {
        const errBox = document.createElement("div");
        errBox.className = "error-box";
        errBox.textContent = errs.join("\n");
        out.appendChild(errBox);
      }
    }, 500);
  } catch (e) {
    ipcRenderer.removeListener('copy-progress', progressHandler);
    out.innerHTML = "";
    out.appendChild(
      statusMessage(`${t("copy_failed")} ${e.message || e}`, "error")
    );
  } finally {
    // Re-enable all buttons except completed ones
    isCopying = false;
    document.querySelectorAll('.copy-folder-btn').forEach(b => {
      const folderName = b.dataset.folder;
      if (!copiedFolders.has(folderName)) {
        b.disabled = false;
        const span = b.querySelector('span');
        if (span) {
          span.textContent = t("copy_btn");
        }
      }
    });
  }
}

// Compare section variables
let selectedCompareSrcHwnd = null;
let selectedCompareDstHwnd = null;

function updateShowCompareFoldersButton() {
  const btn = document.getElementById("btn-show-compare-folders");
  if (selectedCompareSrcHwnd && selectedCompareDstHwnd) {
    btn.disabled = false;
  } else {
    btn.disabled = true;
  }
}

async function refreshCompareWindows() {
  const holder = document.getElementById("compare-windows");
  holder.innerHTML = "";
  holder.appendChild(statusMessage(t("enumerating"), "working"));
  
  // Reset selections
  selectedCompareSrcHwnd = null;
  selectedCompareDstHwnd = null;
  updateShowCompareFoldersButton();
  
  try {
    const wins = await ipcRenderer.invoke("list-explorer-windows");
    holder.innerHTML = "";
    if (!wins || wins.length === 0) {
      holder.appendChild(statusMessage(t("no_windows")));
      return;
    }
    wins.forEach((w) => {
      const item = document.createElement("div");
      item.className = "window-item";
      item.innerHTML = `
        <div class="window-header">
          <div class="radio-group">
            <label class="radio-label">
              <input type="radio" name="compareSrcWindow" value="${w.Hwnd}">
              <span data-i18n="source">${t("source")}</span>
            </label>
            <label class="radio-label">
              <input type="radio" name="compareDstWindow" value="${w.Hwnd}">
              <span data-i18n="destination">${t("destination")}</span>
            </label>
          </div>
        </div>
        <div class="window-title">${w.Title || "File Explorer"}</div>
        <div class="window-path">${w.Path || "Shell namespace (MTP/WPD)"}</div>
      `;
      const srcRadio = item.querySelector('input[name="compareSrcWindow"]');
      const dstRadio = item.querySelector('input[name="compareDstWindow"]');
      
      srcRadio.onclick = () => {
        if (selectedCompareSrcHwnd === w.Hwnd) {
          selectedCompareSrcHwnd = null;
          item.classList.remove("selected-src");
          srcRadio.checked = false;
        } else {
          selectedCompareSrcHwnd = w.Hwnd;
          document.querySelectorAll(".window-item").forEach((i) => i.classList.remove("selected-src"));
          item.classList.add("selected-src");
          document.querySelectorAll('input[name="compareDstWindow"]').forEach(radio => {
            radio.disabled = false;
          });
          dstRadio.disabled = true;
        }
        updateShowCompareFoldersButton();
      };
      
      dstRadio.onclick = () => {
        if (selectedCompareDstHwnd === w.Hwnd) {
          selectedCompareDstHwnd = null;
          item.classList.remove("selected-dst");
          dstRadio.checked = false;
        } else {
          selectedCompareDstHwnd = w.Hwnd;
          document.querySelectorAll(".window-item").forEach((i) => i.classList.remove("selected-dst"));
          item.classList.add("selected-dst");
          document.querySelectorAll('input[name="compareSrcWindow"]').forEach(radio => {
            radio.disabled = false;
          });
          srcRadio.disabled = true;
        }
        updateShowCompareFoldersButton();
      };
      
      holder.appendChild(item);
    });
  } catch (e) {
    holder.innerHTML = "";
    holder.appendChild(statusMessage(`Error: ${e.message || e}`, "error"));
  }
}

async function listCompareFolders() {
  const out = document.getElementById("compare-folder-list");
  out.innerHTML = "";
  if (!selectedCompareSrcHwnd || !selectedCompareDstHwnd) {
    out.appendChild(statusMessage(t("select_both")));
    return;
  }
  out.appendChild(statusMessage(t("loading_folders"), "working"));
  try {
    const res = await ipcRenderer.invoke("list-source-folders", selectedCompareSrcHwnd);
    out.innerHTML = "";
    if (!res || !res.Ok) {
      out.appendChild(statusMessage(`${t("copy_failed")} ${res && res.Error ? res.Error : t("unknown_error")}`, "error"));
      return;
    }
    if (!res.Folders || res.Folders.length === 0) {
      out.appendChild(statusMessage(t("no_folders")));
      return;
    }
    const grid = document.createElement("div");
    grid.className = "folder-grid";
    res.Folders.forEach((name) => {
      const card = document.createElement("div");
      card.className = "folder-card";
      card.dataset.folderName = name;
      
      card.innerHTML = `
        <div class="folder-name">${name}</div>
        <button class="btn compare-folder-btn" data-folder="${name}" onclick="compareAndCopyFolder('${name.replace(/'/g, "\\'")}')">
          <span data-i18n="compare_btn">${t("compare_btn")}</span>
        </button>
      `;
      grid.appendChild(card);
    });
    out.appendChild(grid);
  } catch (e) {
    out.innerHTML = "";
    out.appendChild(statusMessage(`Error: ${e.message || e}`, "error"));
  }
}

async function compareAndCopyFolder(folderName) {
  if (isCopying) {
    return;
  }
  
  isCopying = true;
  
  // Disable all compare buttons
  document.querySelectorAll('.compare-folder-btn').forEach(btn => {
    btn.disabled = true;
    if (btn.dataset.folder === folderName) {
      const span = btn.querySelector('span');
      if (span) span.textContent = t("in_progress_btn");
    }
  });
  
  const out = document.getElementById("compare-output");
  out.innerHTML = "";
  
  const progressDiv = document.createElement("div");
  progressDiv.className = "copy-progress";
  progressDiv.innerHTML = `
    <div class="copy-progress-header">
      <div class="copy-progress-title">${t("comparing")} "${folderName}"</div>
    </div>
    <div class="copy-progress-message">${t("comparing")}</div>
  `;
  out.appendChild(progressDiv);
  
  let totalFiles = 0;
  let missingFiles = 0;
  
  const progressListener = (event, data) => {
    if (data.phase === 'compare') {
      if (data.total !== undefined) {
        totalFiles = data.total;
        progressDiv.innerHTML = `
          <div class="copy-progress-header">
            <div class="copy-progress-title">${t("comparing_phase")}: "${folderName}"</div>
            <div class="copy-progress-stats">0 / ${totalFiles}</div>
          </div>
          <div class="copy-progress-bar">
            <div class="copy-progress-fill" style="width: 0%"></div>
          </div>
          <div class="copy-progress-current"></div>
        `;
      } else if (data.current !== undefined) {
        const percent = totalFiles > 0 ? Math.round((data.current / totalFiles) * 100) : 0;
        const fillEl = progressDiv.querySelector('.copy-progress-fill');
        const statsEl = progressDiv.querySelector('.copy-progress-stats');
        const currentEl = progressDiv.querySelector('.copy-progress-current');
        if (fillEl) fillEl.style.width = percent + '%';
        if (statsEl) statsEl.textContent = `${data.current} / ${totalFiles}`;
        if (currentEl) currentEl.textContent = data.fileName || '';
      }
    } else if (data.phase === 'compare-done') {
      missingFiles = data.missing;
      if (missingFiles === 0) {
        progressDiv.innerHTML = `<div class="copy-progress-message">✅ ${t("no_missing")}</div>`;
      } else {
        progressDiv.innerHTML = `
          <div class="copy-progress-header">
            <div class="copy-progress-title">${t("copying_phase")}: "${folderName}"</div>
            <div class="copy-progress-stats">0 / ${missingFiles}</div>
          </div>
          <div class="copy-progress-bar">
            <div class="copy-progress-fill" style="width: 0%"></div>
          </div>
          <div class="copy-progress-current"></div>
        `;
      }
    } else if (data.phase === 'copy') {
      if (missingFiles > 0) {
        const percent = Math.round(((data.copied + 1) / missingFiles) * 100);
        const fillEl = progressDiv.querySelector('.copy-progress-fill');
        const statsEl = progressDiv.querySelector('.copy-progress-stats');
        const currentEl = progressDiv.querySelector('.copy-progress-current');
        if (fillEl) fillEl.style.width = percent + '%';
        if (statsEl) statsEl.textContent = `${data.copied + 1} / ${missingFiles}`;
        if (currentEl) currentEl.textContent = data.fileName || '';
      }
    }
  };
  
  ipcRenderer.on('compare-progress', progressListener);
  
  try {
    const res = await ipcRenderer.invoke(
      "compare-and-copy-missing",
      selectedCompareSrcHwnd,
      folderName,
      selectedCompareDstHwnd
    );
    
    ipcRenderer.removeListener('compare-progress', progressListener);
    
    out.innerHTML = "";
    if (!res || !res.Ok) {
      out.appendChild(statusMessage(`${t("copy_failed")} ${res && res.Error ? res.Error : t("unknown_error")}`, "error"));
      return;
    }
    
    if (res.Missing === 0) {
      out.appendChild(statusMessage(`✅ ${t("no_missing")}`, "success"));
    } else {
      out.appendChild(statusMessage(
        `✅ ${t("found_missing")}: ${res.Missing}. ${t("copied_success")} ${res.Copied} ${t("files_from")} "${res.Src}" ${t("to")} ${res.Dst}`,
        "success"
      ));
      
      const errs = res.Errors || [];
      if (errs.length > 0) {
        const errBox = document.createElement("div");
        errBox.className = "error-box";
        errBox.textContent = errs.join("\n");
        out.appendChild(errBox);
      }
    }
  } catch (e) {
    out.innerHTML = "";
    out.appendChild(statusMessage(`${t("copy_failed")} ${e.message || e}`, "error"));
  } finally {
    ipcRenderer.removeListener('compare-progress', progressListener);
    isCopying = false;
    document.querySelectorAll('.compare-folder-btn').forEach(b => {
      b.disabled = false;
      const span = b.querySelector('span');
      if (span) {
        span.textContent = t("compare_btn");
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadLanguage();
  refreshExplorerWindows();
  
  // Sidebar navigation
  document.querySelectorAll('.sidebar-menu-item').forEach(item => {
    item.addEventListener('click', () => {
      // Remove active from all items
      document.querySelectorAll('.sidebar-menu-item').forEach(i => i.classList.remove('active'));
      // Add active to clicked item
      item.classList.add('active');
      
      // Scroll to corresponding section
      const section = item.dataset.section;
      const targetCard = document.querySelector(`[data-section-content="${section}"]`);
      if (targetCard) {
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
});
