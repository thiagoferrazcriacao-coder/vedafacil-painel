/**
 * Utilitário para exibir fotos no painel.
 * Suporta tanto fotos antigas (base64) quanto novas (chaves R2).
 */

/**
 * Verifica se uma string é uma chave R2 (não é base64).
 */
export function isR2Key(str) {
  if (typeof str !== 'string') return false
  if (str.startsWith('data:')) return false
  if (str.length > 500) return false
  return str.includes('/') && !str.startsWith('http')
}

/**
 * Retorna a src para um <img> dado uma foto (base64 ou chave R2).
 * Para chaves R2, usa o endpoint /api/fotos/url que redireciona para presigned URL.
 *
 * @param {string} foto   Base64 string ou chave R2
 * @param {string} token  JWT token para autenticação
 * @returns {string}      src do <img>
 */
export function getPhotoSrc(foto, token) {
  if (!foto) return ''
  if (typeof foto !== 'string') return foto.data || ''
  if (foto.startsWith('data:')) return foto
  if (isR2Key(foto)) {
    const base = import.meta.env.VITE_API_URL || ''
    const t = token ? `&token=${encodeURIComponent(token)}` : ''
    return `${base}/api/fotos/url?key=${encodeURIComponent(foto)}${t}`
  }
  // Raw base64 without prefix
  return `data:image/jpeg;base64,${foto}`
}

/**
 * Hook-free component helper: retorna src para exibição de foto.
 * Usa o token do localStorage se disponível.
 *
 * @param {string} foto
 * @returns {string}
 */
export function resolvePhotoSrc(foto) {
  const token = localStorage.getItem('token') || ''
  return getPhotoSrc(foto, token)
}
