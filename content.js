/* content.js
 * 内容脚本：表单识别、字段匹配、填充执行
 * 运行在每个页面的 isolated world，通过 chrome.runtime 消息与 popup 通信
 */
(() => {
  "use strict";

  /* 保存最近一次扫描结果（含 DOM 元素引用，不可序列化） */
  let lastScan = null;

  /* ---------- 工具函数 ---------- */

  function escapeForSelector(str) {
    return String(str).replace(/["\\]/g, "\\$&");
  }

  function normalize(str) {
    return String(str || "").trim().toLowerCase().replace(/\s+/g, "");
  }

  /* 获取一个表单元素关联的标签文本（多种策略） */
  function getLabelText(el) {
    const parts = [];

    // 1. label[for]
    if (el.id) {
      const labels = document.querySelectorAll(`label[for="${escapeForSelector(el.id)}"]`);
      labels.forEach((l) => parts.push(l.textContent));
    }

    // 2. 包裹式 label
    let parent = el.parentElement;
    let depth = 0;
    while (parent && depth < 2) {
      if (parent.tagName === "LABEL") {
        parts.push(parent.textContent);
        break;
      }
      parent = parent.parentElement;
      depth++;
    }

    // 3. aria-label
    if (el.getAttribute("aria-label")) parts.push(el.getAttribute("aria-label"));

    // 4. aria-labelledby
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      labelledBy.split(/\s+/).forEach((id) => {
        const ref = document.getElementById(id);
        if (ref) parts.push(ref.textContent);
      });
    }

    // 5. placeholder
    if (el.placeholder) parts.push(el.placeholder);

    // 6. title
    if (el.title) parts.push(el.title);

    // 7. name / id 属性（作为补充信号）
    if (el.name) parts.push(el.name);
    if (el.id) parts.push(el.id);

    // 8. 前导文本节点：兄弟节点、表格前单元格
    parts.push(getPrecedingText(el));

    return parts.filter(Boolean).join(" ");
  }

  /* 获取元素前方的说明文本（常见于表格布局、div 布局） */
  function getPrecedingText(el) {
    const texts = [];

    // 前一个兄弟节点
    let prev = el.previousSibling;
    while (prev) {
      const t = prev.textContent;
      if (t && t.trim()) {
        texts.unshift(t.trim());
        break;
      }
      prev = prev.previousSibling;
    }

    // 父元素的前一个兄弟子元素文本（如 label 文本在父级 div 前一个 span）
    const parent = el.parentElement;
    if (parent) {
      let pprev = parent.previousElementSibling;
      let d = 0;
      while (pprev && d < 2) {
        const t = pprev.textContent;
        if (t && t.trim() && t.trim().length < 40) {
          texts.unshift(t.trim());
          break;
        }
        pprev = pprev.previousElementSibling;
        d++;
      }
    }

    // 表格布局：前一个 td/th 的文本
    if (parent && (parent.tagName === "TD" || parent.tagName === "TH")) {
      const row = parent.parentElement;
      if (row) {
        const cells = Array.from(row.children);
        const idx = cells.indexOf(parent);
        if (idx > 0) {
          const prevCell = cells[idx - 1];
          texts.push(prevCell.textContent.trim());
        }
      }
    }

    return texts.filter(Boolean).join(" ");
  }

  /* 获取 radio/checkbox 选项自身的标签文本（用于匹配选项值） */
  function getOptionLabel(el) {
    const parts = [];

    // 包裹式 label
    let parent = el.parentElement;
    let depth = 0;
    while (parent && depth < 2) {
      if (parent.tagName === "LABEL") {
        parts.push(parent.textContent);
        break;
      }
      parent = parent.parentElement;
      depth++;
    }

    // label[for]
    if (el.id) {
      const labels = document.querySelectorAll(`label[for="${escapeForSelector(el.id)}"]`);
      labels.forEach((l) => parts.push(l.textContent));
    }

    // 后跟的文本节点
    let next = el.nextSibling;
    while (next) {
      const t = next.textContent;
      if (t && t.trim()) {
        parts.push(t.trim());
        break;
      }
      next = next.nextSibling;
    }

    if (el.getAttribute("aria-label")) parts.push(el.getAttribute("aria-label"));
    if (el.value) parts.push(el.value);
    if (el.title) parts.push(el.title);

    return parts.filter(Boolean).join(" ");
  }

  /* ---------- 字段匹配 ---------- */

  /*
   * 根据标签文本匹配字段定义
   * customMappings: { fieldKey: [别名...] } 用户自定义
   * 返回 { fieldKey, confidence } 或 null
   */
  function matchField(labelText, customMappings) {
    if (!labelText) return null;
    const text = normalize(labelText);
    if (!text) return null;

    const defs = FORM_FILLER.FIELD_DEFS;
    let bestMatch = null;
    let bestScore = 0;

    for (const key in defs) {
      const def = defs[key];
      const aliases = [...(def.aliases || [])];
      // 合并自定义映射
      if (customMappings && customMappings[key]) {
        aliases.push(...customMappings[key]);
      }
      for (const alias of aliases) {
        const a = normalize(alias);
        if (!a) continue;
        if (text === a) {
          // 完全匹配，最高分
          if (a.length > bestScore) { bestScore = a.length; bestMatch = { fieldKey: key, confidence: "high" }; }
        } else if (text.includes(a)) {
          // 包含匹配
          const score = a.length;
          if (score > bestScore) { bestScore = score; bestMatch = { fieldKey: key, confidence: "medium" }; }
        }
      }
    }

    return bestMatch;
  }

  /* 判断元素是否可填充 */
  function isFillable(el) {
    if (!el || el.disabled || el.readOnly) return false;
    const tag = el.tagName;
    if (tag === "INPUT") {
      const t = (el.type || "").toLowerCase();
      return ["text", "email", "tel", "number", "search", "url", "date", ""].includes(t);
    }
    return tag === "SELECT" || tag === "TEXTAREA";
  }

  const SKIP_INPUT_TYPES = ["hidden", "submit", "button", "file", "password", "image", "reset", "checkbox", "radio"];

  /* ---------- 扫描表单 ---------- */

  function scanForm(profileData, customMappings) {
    const matched = [];
    const unmatched = [];
    const seenRadios = new Set(); // radio 按 name 去重

    const elements = document.querySelectorAll("input, select, textarea");

    elements.forEach((el) => {
      const tag = el.tagName;
      const inputType = tag === "INPUT" ? (el.type || "").toLowerCase() : "";

      // 跳过不可填充类型
      if (tag === "INPUT" && SKIP_INPUT_TYPES.includes(inputType)) return;
      if (tag === "INPUT" && SKIP_INPUT_TYPES.includes(inputType)) return;
      if (el.disabled || el.readOnly) return;

      // radio 按组处理
      if (tag === "INPUT" && inputType === "radio") {
        const groupName = el.name || el.id;
        if (groupName && seenRadios.has(groupName)) return;
        if (groupName) seenRadios.add(groupName);

        const labelText = getLabelText(el);
        const m = matchField(labelText, customMappings);
        if (m) {
          const def = FORM_FILLER.FIELD_DEFS[m.fieldKey];
          const value = profileData[m.fieldKey];
          if (value && def.options && def.options[value]) {
            matched.push({
              fieldKey: m.fieldKey,
              fieldLabel: def.label,
              value: value,
              elementType: "radio",
              elementLabel: labelText.slice(0, 60),
              confidence: m.confidence,
              groupName: groupName,
            });
            // 保存元素引用
            storeScanItem(m.fieldKey, { type: "radio", name: groupName, el: el });
          }
        }
        return;
      }

      // checkbox 单独处理（勾选类）
      if (tag === "INPUT" && inputType === "checkbox") {
        const labelText = getLabelText(el);
        const m = matchField(labelText, customMappings);
        if (m) {
          const value = profileData[m.fieldKey];
          matched.push({
            fieldKey: m.fieldKey,
            fieldLabel: FORM_FILLER.FIELD_DEFS[m.fieldKey].label,
            value: value,
            elementType: "checkbox",
            elementLabel: labelText.slice(0, 60),
            confidence: m.confidence,
          });
          storeScanItem(m.fieldKey, { type: "checkbox", el: el, value: value });
        } else {
          unmatched.push({ elementType: "checkbox", elementLabel: labelText.slice(0, 60) || el.name || el.id || "(复选框)" });
        }
        return;
      }

      // 普通 input / select / textarea
      if (!isFillable(el) && tag !== "SELECT") {
        // select 总是可处理
      }

      const labelText = getLabelText(el);
      const m = matchField(labelText, customMappings);

      if (m) {
        const def = FORM_FILLER.FIELD_DEFS[m.fieldKey];
        const value = profileData[m.fieldKey];
        const elType = tag === "SELECT" ? "select" : (tag === "TEXTAREA" ? "textarea" : "text");

        if (value !== undefined && value !== null && value !== "") {
          matched.push({
            fieldKey: m.fieldKey,
            fieldLabel: def.label,
            value: value,
            elementType: elType,
            elementLabel: labelText.slice(0, 60),
            confidence: m.confidence,
          });
          storeScanItem(m.fieldKey, { type: elType, el: el, def: def, value: value });
        } else {
          // 匹配到了但配置为空
          unmatched.push({
            elementType: elType,
            elementLabel: labelText.slice(0, 60) || "(未命名字段)",
            reason: "配置为空",
          });
        }
      } else {
        // 未匹配
        if (labelText && labelText.trim()) {
          const elType = tag === "SELECT" ? "select" : (tag === "TEXTAREA" ? "textarea" : "text");
          unmatched.push({
            elementType: elType,
            elementLabel: labelText.slice(0, 60),
          });
        }
      }
    });

    return { matched, unmatched };
  }

  /* 保存扫描项的元素引用（按 fieldKey，支持多元素） */
  const scanStore = {};
  function storeScanItem(fieldKey, item) {
    if (!scanStore[fieldKey]) scanStore[fieldKey] = [];
    scanStore[fieldKey].push(item);
  }

  /* ---------- 填充执行 ---------- */

  /* 设置 input/textarea 的值并触发事件（兼容 React/Vue） */
  function setNativeValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const protoSetter = Object.getOwnPropertyDescriptor(proto, "value");
    const ownSetter = Object.getOwnPropertyDescriptor(el, "value");

    if (protoSetter && ownSetter && protoSetter.set !== ownSetter.set) {
      protoSetter.set.call(el, value);
    } else if (protoSetter && protoSetter.set) {
      protoSetter.set.call(el, value);
    } else if (ownSetter && ownSetter.set) {
      ownSetter.set.call(el, value);
    } else {
      el.value = value;
    }

    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  /* 填充 select */
  function fillSelect(el, value, def) {
    const targetAliases = (def.options && def.options[value]) ? def.options[value] : [value];
    const normAliases = targetAliases.map(normalize);

    // 精确匹配优先
    for (const option of el.options) {
      const ot = normalize(option.text);
      const ov = normalize(option.value);
      if (normAliases.includes(ot) || normAliases.includes(ov)) {
        el.value = option.value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }
    // 包含匹配
    for (const option of el.options) {
      const ot = normalize(option.text);
      const ov = normalize(option.value);
      if (normAliases.some((a) => ot.includes(a) || ov.includes(a))) {
        el.value = option.value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }
    return false;
  }

  /* 填充 radio 组 */
  function fillRadio(groupName, value, def) {
    const targetAliases = (def.options && def.options[value]) ? def.options[value] : [value];
    const normAliases = targetAliases.map(normalize);

    const selector = groupName
      ? `input[type="radio"][name="${escapeForSelector(groupName)}"]`
      : `input[type="radio"]`;
    const group = document.querySelectorAll(selector);

    for (const radio of group) {
      const ol = normalize(getOptionLabel(radio));
      if (normAliases.some((a) => ol === a || ol.includes(a) || a.includes(ol))) {
        radio.checked = true;
        radio.dispatchEvent(new Event("change", { bubbles: true }));
        radio.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        return true;
      }
    }
    return false;
  }

  /* 填充 checkbox */
  function fillCheckbox(el, value) {
    const want = ["是", "yes", "true", "1", "y", "接受", "同意", "有"].includes(normalize(value));
    el.checked = want;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return true;
  }

  /* 高亮元素 */
  function highlight(el) {
    if (!el) return;
    el.classList.add("form-filler-highlight");
    setTimeout(() => el.classList.remove("form-filler-highlight"), 3000);
    // 同时高亮 label
  }

  /* 执行填充（接收 popup 确认后的 items） */
  function fillForm(items) {
    const filled = [];
    const failed = [];

    items.forEach((item) => {
      if (!item.apply) return;
      const stored = scanStore[item.fieldKey];
      if (!stored || !stored.length) {
        failed.push({ fieldKey: item.fieldKey, fieldLabel: item.fieldLabel, reason: "未找到元素" });
        return;
      }

      let success = false;
      const value = item.value;

      for (const s of stored) {
        try {
          if (s.type === "text" || s.type === "textarea") {
            setNativeValue(s.el, value);
            highlight(s.el);
            success = true;
          } else if (s.type === "select") {
            const ok = fillSelect(s.el, value, s.def);
            if (ok) { highlight(s.el); success = true; }
          } else if (s.type === "radio") {
            const def = FORM_FILLER.FIELD_DEFS[item.fieldKey];
            const ok = fillRadio(s.name, value, def);
            if (ok) { success = true; }
          } else if (s.type === "checkbox") {
            const ok = fillCheckbox(s.el, value);
            if (ok) { highlight(s.el); success = true; }
          }
        } catch (e) {
          console.warn("[网申助手] 填充失败:", item.fieldKey, e);
        }
      }

      if (success) {
        filled.push({ fieldKey: item.fieldKey, fieldLabel: item.fieldLabel, value: value });
      } else {
        failed.push({ fieldKey: item.fieldKey, fieldLabel: item.fieldLabel, reason: "无法匹配选项" });
      }
    });

    return { filled, failed };
  }

  /* ---------- 消息监听 ---------- */

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "FILLER_SCAN") {
      // 清空上一次扫描存储
      for (const k in scanStore) delete scanStore[k];
      const result = scanForm(msg.profileData || {}, msg.customMappings || {});
      lastScan = result;
      sendResponse({ type: "FILLER_SCAN_RESULT", matched: result.matched, unmatched: result.unmatched });
      return true;
    }

    if (msg.type === "FILLER_FILL") {
      const result = fillForm(msg.items || []);
      sendResponse({ type: "FILLER_FILL_RESULT", filled: result.filled, failed: result.failed });
      return true;
    }

    if (msg.type === "FILLER_PING") {
      sendResponse({ type: "FILLER_PONG", ok: true });
      return true;
    }
  });

  /* 页面就绪日志（调试用） */
  console.log("[网申助手] 内容脚本已加载，可识别并填充表单。");
})();
