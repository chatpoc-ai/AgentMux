"use strict";

/** 终端 stdout 中一行事件；解析成功后不进入 xterm 普通输出 */
const PREFIX = "AGENTMUX_EVENT:";

/**
 * 去掉行首常见控制字符，避免 echo/PTY 带 \\r 或 ANSI 时无法识别 PREFIX。
 * @param {string} s
 */
function normalizeLineForEvent(s) {
  let t = s.replace(/\r$/, "").replace(/^\uFEFF/, "");
  t = t.replace(/^[\r\n]+/, "");
  t = t.trimStart();
  while (t.length) {
    const m = t.match(/^\x1b\[[0-9;]*m/);
    if (!m) break;
    t = t.slice(m[0].length);
  }
  return t;
}

/**
 * @param {string} line 不含换行符的一行
 * @returns {object | null} 解析成功返回事件对象；否则 null（应作为普通输出）
 */
function parseEventLine(line) {
  const raw = normalizeLineForEvent(line);
  if (!raw.startsWith(PREFIX)) return null;
  try {
    return JSON.parse(raw.slice(PREFIX.length));
  } catch {
    return null;
  }
}

/**
 * @param {object} event
 * @returns {string}
 */
function formatEventLine(event) {
  return `${PREFIX}${JSON.stringify(event)}`;
}

module.exports = {
  PREFIX,
  parseEventLine,
  formatEventLine,
};
