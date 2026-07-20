export const CONFIG = {
  // 会话有效期：30 天（个人应用，减少重复登录）
  JWT_EXP: 30 * 86400,
  LOGIN: {
    MAX_ATTEMPTS: 5,
    LOCK_MS: 15 * 60 * 1000
  },
  // 整份状态 JSON 的大小上限
  STATE_MAX_BYTES: 1024 * 1024
};
