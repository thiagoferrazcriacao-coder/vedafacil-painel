const BASE = '/api'

function getToken() {
  return localStorage.getItem('veda_token')
}

function normalizeId(data) {
  if (Array.isArray(data)) return data.map(normalizeId)
  if (data && typeof data === 'object' && '_id' in data) return { ...data, id: data._id }
  return data
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  })

  if (res.status === 401) {
    localStorage.removeItem('veda_token')
    localStorage.removeItem('veda_user')
    window.location.href = '/login'
    return
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return normalizeId(data)
}

export const api = {
  // Auth
  login: (username, password) => request('POST', '/auth/login', { username, password }),
  me: () => request('GET', '/auth/me'),

  // Medicoes
  getMedicoes: () => request('GET', '/medicoes'),
  getMedicao: (id) => request('GET', `/medicoes/${id}`),
  updateMedicaoStatus: (id, status) => request('PATCH', `/medicoes/${id}/status`, { status }),
  updateMedicao: (id, data) => request('PUT', `/medicoes/${id}`, data),

  // Orcamentos
  getOrcamentos: () => request('GET', '/orcamentos'),
  getOrcamento: (id) => request('GET', `/orcamentos/${id}`),
  createOrcamento: (data) => request('POST', '/orcamentos', data),
  updateOrcamento: (id, data) => request('PUT', `/orcamentos/${id}`, data),
  deleteOrcamento: (id) => request('DELETE', `/orcamentos/${id}`),
  deleteMedicao: (id) => request('DELETE', `/medicoes/${id}`),
  deleteContrato: (id) => request('DELETE', `/contratos/${id}`),
  approveOrcamento: (id) => request('POST', `/orcamentos/${id}/approve`),
  getOrcamentoPdfUrl: (id) => `${BASE}/orcamentos/${id}/pdf?token=${encodeURIComponent(getToken() || '')}`,

  // Contratos
  getContratos: () => request('GET', '/contratos'),
  getContrato: (id) => request('GET', `/contratos/${id}`),
  createContrato: (data) => request('POST', '/contratos', data),
  updateContrato: (id, data) => request('PUT', `/contratos/${id}`, data),
  sendToZapSign: (id, email, nomeSigner) => request('POST', `/zapsign-send`, { contratoId: id, email, nomeSigner }),
  getContratoPdfUrl: (id) => `${BASE}/contratos/${id}/pdf?token=${encodeURIComponent(getToken() || '')}`,
  getGarantiaPdfUrl: (id) => `${BASE}/contratos/${id}/garantia?token=${encodeURIComponent(getToken() || '')}`,
  getArtPdfUrl: (id) => `${BASE}/contratos/${id}/art?token=${encodeURIComponent(getToken() || '')}`,

  // Config
  getPrecos: () => request('GET', '/config/precos'),
  updatePrecos: (data) => request('PUT', '/config/precos', data),
  getProximoOrcamento: () => request('GET', '/config/proximo-orcamento'),

  // Usuários
  getUsuarios: () => request('GET', '/usuarios'),
  createUsuario: (data) => request('POST', '/usuarios', data),
  updateUsuario: (email, data) => request('PUT', `/usuarios/${encodeURIComponent(email)}`, data),
  deleteUsuario: (email) => request('DELETE', `/usuarios/${encodeURIComponent(email)}`),
  getUsuarioMe: () => request('GET', '/usuarios/me'),
}
