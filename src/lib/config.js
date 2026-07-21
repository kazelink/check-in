export const CONFIG = {
  // 会话有效期：2 天；活跃使用时自动滑动续期
  JWT_EXP: 2 * 86400,
  // 剩余有效期少于 1 天时，下一次成功请求会自动续期
  JWT_REFRESH_THRESHOLD: 1 * 86400,
  LOGIN: {
    MAX_ATTEMPTS: 5,
    LOCK_MS: 15 * 60 * 1000
  },
  // 整份状态 JSON 的大小上限
  STATE_MAX_BYTES: 1024 * 1024
};
