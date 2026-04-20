const BASE = '/api'

function getToken() {
  return localStorage.getItem('veda_token')
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
  return data
}

export const api = {
  // Auth
  login: (username, password) => request('POST', '/auth/login', { username, password }),
  me: () => request('GET', '/auth/me'),

  // Medicoes
  getMedicoes: () => request('GET', '/medicoes'),
  getMedicao: (id) => request('GET', `/medicoes/${id}`),
  updateMedicaoStatus: (id, status) => request('PATCH', `/medicoes/${id}/status`, { status }),

  // Orcamentos
  getOrcamentos: () => request('GET', '/orcamentos'),
  getOrcamento: (id) => request('GET', `/orcamentos/${id}`),
  createOrcamento: (data) => request('POST', '/orcamentos', data),
  updateOrcamento: (id, data) => request('PUT', `/orcamentos/${id}`, data),
  deleteOrcamento: (id) => request('DELETE', `/orcamentos/${id}`),
  approveOrcamento: (id) => request('POST', `/orcamentos/${id}/approve`),
  getOrcamentoPdfUrl: (id) => `${BASE}/orcamentos/${id}/pdf`,

  // Contratos
  getContratos: () => request('GET', '/contratos'),
  getContrato: (id) => request('GET', `/contratos/${id}`),
  createContrato: (data) => request('POST', '/contratos', data),
  updateContrato: (id, data) => request('PUT', `/contratos/${id}`, data),
  sendToZapSign: (id) => request('POST', `/contratos/${id}/zapsign`),
  getContratoPdfUrl: (id) => `${BASE}/contratos/${id}/pdf`,

  // Config
  getPrecos: () => request('GET', '/config/precos'),
  updatePrecos: (data) => request('PUT', '/config/precos', data),
}
