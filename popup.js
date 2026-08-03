/* popup.js - 弹窗逻辑：配置管理、扫描触发、预览确认、填充 */
(() => {
  "use strict";

  const FIELD_DEFS = FORM_FILLER.FIELD_DEFS;
  const CATEGORIES = FORM_FILLER.CATEGORIES;

  /* 应用状态 */
  let state = {
    profiles: [],
    activeProfileId: null,
    customMappings: {},
  };

  /* 缓存上一次扫描的 matched 数据（供确认填充时使用） */
  let cachedMatched = [];

  /* ---------- 存储 ---------- */
  function loadState() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["profiles", "activeProfileId", "customMappings"], (res) => {
        state.profiles = res.profiles || [];
        state.activeProfileId = res.activeProfileId || null;
        state.customMappings = res.customMappings || {};
        // 首次使用：创建默认配置
        if (!state.profiles.length) {
          const p = FORM_FILLER.createDefaultProfile();
          state.profiles.push(p);
          state.activeProfileId = p.id;
        }
        if (!state.activeProfileId || !getProfile(state.activeProfileId)) {
          state.activeProfileId = state.profiles[0].id;
        }
        resolve();
      });
    });
  }

  function saveState() {
    return new Promise((resolve) => {
      chrome.storage.local.set({
        profiles: state.profiles,
        activeProfileId: state.activeProfileId,
        customMappings: state.customMappings,
      }, resolve);
    });
  }

  function getProfile(id) {
    return state.profiles.find((p) => p.id === id);
  }

  function getActiveProfile() {
    return getProfile(state.activeProfileId) || state.profiles[0];
  }

  /* ---------- 视图切换 ---------- */
  function switchView(name) {
    document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
    const view = document.getElementById("view-" + name);
    if (view) view.classList.remove("hidden");
  }

  /* ---------- 渲染配置下拉 ---------- */
  function renderProfileSelect() {
    const sel = document.getElementById("profileSelect");
    sel.innerHTML = "";
    state.profiles.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      if (p.id === state.activeProfileId) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  /* ---------- 渲染字段编辑表单 ---------- */
  function renderFields() {
    const container = document.getElementById("fieldsContainer");
    container.innerHTML = "";
    const profile = getActiveProfile();
    if (!profile) {
      container.innerHTML = '<div class="empty-state">暂无配置，请点击 ＋ 新建</div>';
      return;
    }
    const data = profile.data;

    CATEGORIES.forEach((cat, catIdx) => {
      const catDiv = document.createElement("div");
      catDiv.className = "category";

      const header = document.createElement("div");
      header.className = "category-header";
      header.innerHTML = `<span>${cat}</span><span class="arrow">▼</span>`;
      header.addEventListener("click", () => catDiv.classList.toggle("collapsed"));

      const body = document.createElement("div");
      body.className = "category-body";

      Object.keys(FIELD_DEFS).forEach((key) => {
        const def = FIELD_DEFS[key];
        if (def.category !== cat) return;

        const row = document.createElement("div");
        row.className = "field-row";

        const label = document.createElement("label");
        label.textContent = def.label;
        label.setAttribute("for", "field_" + key);
        row.appendChild(label);

        let inputEl;
        if (def.type === "textarea") {
          inputEl = document.createElement("textarea");
        } else if (def.type === "select" || def.type === "radio") {
          inputEl = document.createElement("select");
          const emptyOpt = document.createElement("option");
          emptyOpt.value = "";
          emptyOpt.textContent = "— 请选择 —";
          inputEl.appendChild(emptyOpt);
          Object.keys(def.options).forEach((optVal) => {
            const opt = document.createElement("option");
            opt.value = optVal;
            opt.textContent = optVal;
            inputEl.appendChild(opt);
          });
        } else {
          inputEl = document.createElement("input");
          inputEl.type = "text";
        }

        inputEl.id = "field_" + key;
        inputEl.dataset.fieldKey = key;
        inputEl.value = data[key] || "";
        row.appendChild(inputEl);
        body.appendChild(row);
      });

      catDiv.appendChild(header);
      catDiv.appendChild(body);
      container.appendChild(catDiv);
    });
  }

  /* ---------- 从 DOM 收集表单数据 ---------- */
  function collectFormData() {
    const data = {};
    document.querySelectorAll("[data-field-key]").forEach((el) => {
      data[el.dataset.fieldKey] = el.value;
    });
    return data;
  }

  /* ---------- 保存当前配置 ---------- */
  async function saveCurrentProfile() {
    const profile = getActiveProfile();
    if (profile) {
      profile.data = collectFormData();
      await saveState();
      showTip("配置已保存 ✓");
    }
  }

  function showTip(text) {
    const tip = document.getElementById("saveTip");
    tip.textContent = text;
    setTimeout(() => { tip.textContent = ""; }, 2000);
  }

  /* ---------- 获取当前活动标签页 ---------- */
  function getActiveTab() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0]));
    });
  }

  /* ---------- 扫描表单 ---------- */
  async function scanAndFill() {
    // 先保存当前编辑的配置
    const profile = getActiveProfile();
    if (profile) {
      profile.data = collectFormData();
      await saveState();
    }

    const tab = await getActiveTab();
    if (!tab) {
      showResult(false, "无法获取当前标签页");
      return;
    }

    if (tab.url && (tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://") || tab.url.startsWith("edge://"))) {
      showResult(false, "浏览器内置页面不支持填充，请打开网申表单页面后重试。");
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "FILLER_SCAN",
        profileData: profile.data,
        customMappings: state.customMappings,
      });

      if (!response || !response.matched) {
        showResult(false, "页面未响应，请刷新页面后重试。");
        return;
      }

      if (response.matched.length === 0 && response.unmatched.length === 0) {
        showResult(false, "当前页面未检测到可填充的表单字段。");
        return;
      }

      cachedMatched = response.matched;
      renderPreview(response.matched, response.unmatched);
      switchView("preview");
    } catch (e) {
      showResult(false, "无法连接到页面，请刷新网申页面后重试。\n（" + (e.message || e) + "）");
    }
  }

  /* ---------- 渲染预览确认界面 ---------- */
  function renderPreview(matched, unmatched) {
    const matchedList = document.getElementById("matchedList");
    matchedList.innerHTML = "";

    if (matched.length === 0) {
      matchedList.innerHTML = '<div class="empty-state">未匹配到可填充字段</div>';
    }

    matched.forEach((item, idx) => {
      const div = document.createElement("div");
      div.className = "match-item";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = true;
      cb.dataset.idx = idx;
      div.appendChild(cb);

      const info = document.createElement("div");
      info.className = "match-info";
      const labelDiv = document.createElement("div");
      labelDiv.className = "match-label";
      labelDiv.textContent = item.fieldLabel;
      const sourceDiv = document.createElement("div");
      sourceDiv.className = "match-source";
      sourceDiv.textContent = "页面字段：" + (item.elementLabel || "(未命名)");
      info.appendChild(labelDiv);
      info.appendChild(sourceDiv);
      div.appendChild(info);

      const conf = document.createElement("span");
      conf.className = "confidence-tag confidence-" + (item.confidence || "medium");
      conf.textContent = item.confidence === "high" ? "精确" : "模糊";
      div.appendChild(conf);

      let valueInput;
      const def = FIELD_DEFS[item.fieldKey];
      if (def && (def.type === "select" || def.type === "radio") && def.options) {
        valueInput = document.createElement("select");
        Object.keys(def.options).forEach((optVal) => {
          const opt = document.createElement("option");
          opt.value = optVal;
          opt.textContent = optVal;
          if (optVal === item.value) opt.selected = true;
          valueInput.appendChild(opt);
        });
      } else {
        valueInput = document.createElement("input");
        valueInput.type = "text";
        valueInput.value = item.value;
      }
      valueInput.dataset.idx = idx;
      valueInput.dataset.role = "value";
      div.appendChild(valueInput);

      matchedList.appendChild(div);
    });

    const unmatchedSection = document.getElementById("unmatchedSection");
    const unmatchedList = document.getElementById("unmatchedList");
    unmatchedList.innerHTML = "";

    if (unmatched.length === 0) {
      unmatchedSection.style.display = "none";
    } else {
      unmatchedSection.style.display = "block";
      const seen = new Set();
      unmatched.forEach((item) => {
        const key = item.elementLabel + "|" + item.elementType;
        if (seen.has(key)) return;
        seen.add(key);
        const div = document.createElement("div");
        div.className = "unmatched-item";
        div.textContent = item.elementLabel;
        const badge = document.createElement("span");
        badge.className = "type-badge";
        const typeMap = { text: "文本", textarea: "长文本", select: "下拉", checkbox: "复选", radio: "单选" };
        badge.textContent = typeMap[item.elementType] || item.elementType;
        div.appendChild(badge);
        if (item.reason) {
          const r = document.createElement("span");
          r.className = "type-badge";
          r.style.color = "#c62828";
          r.textContent = item.reason;
          div.appendChild(r);
        }
        unmatchedList.appendChild(div);
      });
    }
  }

  /* ---------- 确认填充 ---------- */
  async function confirmFill() {
    const tab = await getActiveTab();
    if (!tab) return;

    const items = [];
    const checkboxes = document.querySelectorAll("#matchedList .match-item input[type=checkbox]");
    const valueInputs = document.querySelectorAll("#matchedList [data-role=value]");
    const valueMap = {};
    valueInputs.forEach((inp) => { valueMap[inp.dataset.idx] = inp.value; });

    checkboxes.forEach((cb) => {
      if (cb.checked) {
        const idx = cb.dataset.idx;
        const item = cachedMatched[idx];
        if (item) {
          items.push({
            fieldKey: item.fieldKey,
            fieldLabel: item.fieldLabel,
            value: valueMap[idx] !== undefined ? valueMap[idx] : item.value,
            apply: true,
          });
        }
      }
    });

    if (items.length === 0) {
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: "FILLER_FILL", items });
      if (response) {
        renderResult(response.filled || [], response.failed || []);
        switchView("result");
      }
    } catch (e) {
      showResult(false, "填充失败：" + (e.message || e));
    }
  }

  /* ---------- 渲染结果 ---------- */
  function renderResult(filled, failed) {
    const icon = document.getElementById("resultIcon");
    const content = document.getElementById("resultContent");
    const filledCount = filled.length;
    const failedCount = failed.length;

    if (failedCount === 0) {
      icon.textContent = "✅";
    } else if (filledCount === 0) {
      icon.textContent = "❌";
    } else {
      icon.textContent = "⚠️";
    }

    let html = `<div>成功填充 <span class="count">${filledCount}</span> 个字段</div>`;
    if (failedCount > 0) {
      html += `<div>失败 <span class="count" style="color:#c62828">${failedCount}</span> 个</div>`;
      html += '<div class="fail-list">';
      failed.forEach((f) => {
        html += `<div>${f.fieldLabel}：${f.reason || "失败"}</div>`;
      });
      html += "</div>";
    }
    if (filledCount > 0) {
      html += '<div style="margin-top:8px;font-size:11px;color:#999">已填充字段已高亮显示，请核对后提交。</div>';
    }
    content.innerHTML = html;
  }

  function showResult(success, message) {
    const icon = document.getElementById("resultIcon");
    const content = document.getElementById("resultContent");
    icon.textContent = success ? "✅" : "❌";
    content.innerHTML = `<div>${message.replace(/\n/g, "<br>")}</div>`;
    switchView("result");
  }

  /* ---------- 配置管理 ---------- */
  async function newProfile() {
    const name = prompt("请输入新配置名称：", "配置" + (state.profiles.length + 1));
    if (!name) return;
    const p = FORM_FILLER.createDefaultProfile();
    p.name = name;
    state.profiles.push(p);
    state.activeProfileId = p.id;
    await saveState();
    renderProfileSelect();
    renderFields();
  }

  async function renameProfile() {
    const profile = getActiveProfile();
    if (!profile) return;
    const name = prompt("请输入新的配置名称：", profile.name);
    if (!name) return;
    profile.name = name;
    await saveState();
    renderProfileSelect();
  }

  async function delProfile() {
    if (state.profiles.length <= 1) {
      alert("至少需要保留一个配置");
      return;
    }
    const profile = getActiveProfile();
    if (!confirm(`确认删除配置「${profile.name}」吗？此操作不可撤销。`)) return;
    state.profiles = state.profiles.filter((p) => p.id !== profile.id);
    state.activeProfileId = state.profiles[0].id;
    await saveState();
    renderProfileSelect();
    renderFields();
  }

  async function switchProfile(id) {
    const profile = getActiveProfile();
    if (profile) profile.data = collectFormData();
    state.activeProfileId = id;
    await saveState();
    renderFields();
  }

  /* ---------- 初始化 ---------- */
  function bindEvents() {
    document.getElementById("profileSelect").addEventListener("change", (e) => switchProfile(e.target.value));
    document.getElementById("newProfileBtn").addEventListener("click", newProfile);
    document.getElementById("renameProfileBtn").addEventListener("click", renameProfile);
    document.getElementById("delProfileBtn").addEventListener("click", delProfile);

    document.getElementById("saveBtn").addEventListener("click", saveCurrentProfile);
    document.getElementById("scanBtn").addEventListener("click", scanAndFill);

    document.getElementById("confirmFillBtn").addEventListener("click", confirmFill);
    document.getElementById("cancelFillBtn").addEventListener("click", () => switchView("edit"));
    document.getElementById("resultDoneBtn").addEventListener("click", () => switchView("edit"));

    document.getElementById("mappingBtn").addEventListener("click", () => {
      if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
    });
  }

  async function init() {
    await loadState();
    renderProfileSelect();
    renderFields();
    bindEvents();
    switchView("edit");
  }

  init();
})();
