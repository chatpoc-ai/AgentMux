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
  return stripLeadingEscapeSequences(t);
}

/**
 * 反复剥掉行首 CSI（如颜色、?2004h bracketed paste）和简单 OSC，直到稳定。
 * @param {string} s
 */
function stripLeadingEscapeSequences(s) {
  let t = s;
  let prevLen = -1;
  while (t.length !== prevLen) {
    prevLen = t.length;
    while (t.length) {
      const m = t.match(/^\x1b\[[0-9:;?]*[A-Za-z]/);
      if (!m) break;
      t = t.slice(m[0].length);
    }
    while (t.length) {
      const m = t.match(/^\x1b\][^\x07]*\x07/);
      if (!m) break;
      t = t.slice(m[0].length);
    }
    t = t.trimStart();
  }
  return t;
}

/**
 * @param {string} line 不含换行符的一行
 * @returns {object | null} 解析成功返回事件对象；否则 null（应作为普通输出）
 */
function parseEventLine(line) {
  let raw = normalizeLineForEvent(line);
  if (!raw.includes(PREFIX)) return null;
  const idx = raw.indexOf(PREFIX);
  if (idx > 0) {
    raw = raw.slice(idx);
    raw = normalizeLineForEvent(raw);
  }
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
