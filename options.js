/* options.js - 字段映射设置页逻辑 */
(() => {
  "use strict";

  const FIELD_DEFS = FORM_FILLER.FIELD_DEFS;
  const CATEGORIES = FORM_FILLER.CATEGORIES;

  let customMappings = {};

  /* 加载已保存的自定义映射 */
  function loadMappings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["customMappings"], (res) => {
        customMappings = res.customMappings || {};
        resolve();
      });
    });
  }

  /* 渲染映射界面 */
  function renderMappings() {
    const container = document.getElementById("mappingsContainer");
    container.innerHTML = "";

    CATEGORIES.forEach((cat) => {
      const block = document.createElement("div");
      block.className = "category-block";

      const title = document.createElement("div");
      title.className = "category-title";
      title.textContent = cat;
      block.appendChild(title);

      Object.keys(FIELD_DEFS).forEach((key) => {
        const def = FIELD_DEFS[key];
        if (def.category !== cat) return;

        const item = document.createElement("div");
        item.className = "field-item";

        const row = document.createElement("div");
        row.className = "field-row";

        const label = document.createElement("div");
        label.className = "field-label";
        label.textContent = def.label;
        row.appendChild(label);

        const content = document.createElement("div");
        content.className = "field-content";

        // 内置别名展示
        const builtin = document.createElement("div");
        builtin.className = "builtin-aliases";
        builtin.innerHTML = "内置别名：";
        (def.aliases || []).forEach((a) => {
          const tag = document.createElement("span");
          tag.className = "tag";
          tag.textContent = a;
          builtin.appendChild(tag);
        });
        content.appendChild(builtin);

        // 自定义别名输入框
        const input = document.createElement("input");
        input.type = "text";
        input.className = "custom-input";
        input.dataset.fieldKey = key;
        input.placeholder = "输入自定义别名，多个用逗号分隔";
        const customs = customMappings[key] || [];
        input.value = customs.join("，");
        content.appendChild(input);

        const hint = document.createElement("div");
        hint.className = "custom-hint";
        hint.textContent = "例如表单里把" + def.label + "叫做其他名称时，在这里加上该名称";
        content.appendChild(hint);

        row.appendChild(content);
        item.appendChild(row);
        block.appendChild(item);
      });

      container.appendChild(block);
    });
  }

  /* 保存映射 */
  async function saveMappings() {
    const newMappings = {};
    document.querySelectorAll(".custom-input").forEach((input) => {
      const key = input.dataset.fieldKey;
      const raw = input.value.trim();
      if (raw) {
        // 支持中英文逗号分隔
        const aliases = raw.split(/[,，]+/).map((s) => s.trim()).filter(Boolean);
        if (aliases.length) newMappings[key] = aliases;
      }
    });

    customMappings = newMappings;
    await new Promise((resolve) => {
      chrome.storage.local.set({ customMappings: newMappings }, resolve);
    });

    const tip = document.getElementById("saveTip");
    tip.textContent = "✓ 保存成功";
    setTimeout(() => { tip.textContent = ""; }, 2500);
  }

  function bindEvents() {
    document.getElementById("saveBtn").addEventListener("click", saveMappings);
  }

  async function init() {
    await loadMappings();
    renderMappings();
    bindEvents();
  }

  init();
})();
