"use strict";

/** 终端 stdout 中一行事件；解析成功后不进入 xterm 普通输出 */
const PREFIX = "AGENTMUX_EVENT:";

/**
 * @param {string} line 不含换行符的一行
 * @returns {object | null} 解析成功返回事件对象；否则 null（应作为普通输出）
 */
function parseEventLine(line) {
  const raw = line.replace(/\r$/, "");
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
