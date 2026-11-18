/**
 * 把 public/ 下的资源路径拼上 Vite 的 base。
 * 部署到 GitHub Pages 的子路径（/projects/afterglow/）时，/art、/models 这类
 * 绝对路径会指向站点根目录而 404，统一走这里即可同时兼容本地根路径部署。
 */
export const asset = (path: string): string => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;