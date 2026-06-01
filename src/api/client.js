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
  getMe: () => request('GET', '/me'),
  changePassword: (data) => request('PATCH', '/auth/change-password', data),
  updateProfilePicture: (picture) => request('PATCH', '/auth/profile-picture', { picture }),

  // Medicoes
  getMedicoes: () => request('GET', '/medicoes'),
  getMedicao: (id) => request('GET', `/medicoes/${id}`),
  updateMedicaoStatus: (id, status) => request('PATCH', `/medicoes/${id}/status`, { status }),
  updateMedicao: (id, data) => request('PUT', `/medicoes/${id}`, data),
  updateMedicaoFotos: (id, locais) => request('PATCH', `/medicoes/${id}/fotos`, { locais }),
  adicionarLocalMedicao: (id, local) => request('PATCH', `/medicoes/${id}/adicionar-local`, { local }),
  createMedicaoManual: (data) => request('POST', '/medicoes/manual', data),

  // Orcamentos
  getOrcamentos: () => request('GET', '/orcamentos'),
  getOrcamento: (id) => request('GET', `/orcamentos/${id}`),
  createOrcamento: (data) => request('POST', '/orcamentos', data),
  duplicarOrcamento: (id) => request('POST', `/orcamentos/${id}/duplicar`),
  updateOrcamento: (id, data) => request('PUT', `/orcamentos/${id}`, data),
  deleteOrcamento: (id) => request('DELETE', `/orcamentos/${id}`),
  deleteMedicao: (id) => request('DELETE', `/medicoes/${id}`),
  deleteContrato: (id) => request('DELETE', `/contratos/${id}`),
  approveOrcamento: (id) => request('POST', `/orcamentos/${id}/approve`),
  desfazerAprovacao: (id) => request('POST', `/orcamentos/${id}/desfazer-aprovacao`),
  toggleEnviadoCliente: (id) => request('POST', `/orcamentos/${id}/enviado-cliente`),
  aceitarAlteracaoMedicao: (id) => request('POST', `/medicoes/${id}/aceitar-alteracao`),
  recusarAlteracaoMedicao: (id) => request('POST', `/medicoes/${id}/recusar-alteracao`),
  getOrcamentoPdfUrl: (id) => `${BASE}/orcamentos/${id}/pdf?token=${encodeURIComponent(getToken() || '')}`,

  // Contratos
  getContratos: () => request('GET', '/contratos'),
  getContrato: (id) => request('GET', `/contratos/${id}`),
  createContrato: (data) => request('POST', '/contratos', data),
  updateContrato: (id, data) => request('PUT', `/contratos/${id}`, data),
  getContratoTextoHtml: (id) => request('GET', `/contratos/${id}/texto-html`),
  updateContratoStatus: (id, status) => request('PATCH', `/contratos/${id}/status`, { status }),
  sendToZapSign: (id, email, nomeSigner) => request('POST', `/zapsign-send`, { contratoId: id, email, nomeSigner }),
  otimizarCroqui: (imagem) => request('POST', '/croqui/otimizar', { imagem }),
  getContratoPdfUrl: (id) => `${BASE}/contratos/${id}/pdf?token=${encodeURIComponent(getToken() || '')}&t=${Date.now()}`,
  getGarantiaPdfUrl: (id) => `${BASE}/contratos/${id}/garantia?token=${encodeURIComponent(getToken() || '')}`,
  getArtPdfUrl: (id) => `${BASE}/contratos/${id}/art?token=${encodeURIComponent(getToken() || '')}`,
  marcarGarantiaEnviada: (id) => request('POST', `/contratos/${id}/garantia/marcar-enviada`),

  // Garantias standalone (geradas a partir de OS)
  getGarantias: () => request('GET', '/garantias'),
  createGarantiasFromOS: (osIds) => request('POST', '/garantias/from-os', { osIds }),
  updateGarantia: (id, data) => request('PUT', `/garantias/${id}`, data),
  deleteGarantia: (id) => request('DELETE', `/garantias/${id}`),
  marcarGarantiaEnviadaNew: (id) => request('POST', `/garantias/${id}/marcar-enviada`),
  getGarantiaNewPdfUrl: (id) => `${BASE}/garantias/${id}/pdf?token=${encodeURIComponent(getToken() || '')}`,

  // Equipes
  getEquipes: () => request('GET', '/equipes'),
  createEquipe: (data) => request('POST', '/equipes', data),
  updateEquipe: (id, data) => request('PUT', `/equipes/${id}`, data),
  deleteEquipe: (id) => request('DELETE', `/equipes/${id}`),

  // Ordens de Serviço
  getOrdensServico: () => request('GET', '/ordens-servico'),
  getOrdemServico: (id) => request('GET', `/ordens-servico/${id}`),
  createOrdemServico: (data) => request('POST', '/ordens-servico', data),
  updateOrdemServico: (id, data) => request('PUT', `/ordens-servico/${id}`, data),
  updateOSStatus: (id, status, progresso) => request('PATCH', `/ordens-servico/${id}/status`, { status, progresso }),
  deleteOrdemServico: (id) => request('DELETE', `/ordens-servico/${id}`),
  redirecionarEquipe: (id, equipeId) => request('PATCH', `/ordens-servico/${id}/equipe`, { equipeId }),
  getGarantiaOSUrl: (id) => `${BASE}/ordens-servico/${id}/garantia?token=${encodeURIComponent(getToken() || '')}`,
  getOSPdfUrl: (id) => `${BASE}/ordens-servico/${id}/pdf?token=${encodeURIComponent(getToken() || '')}`,
  registrarConsumo: (id, data) => request('PATCH', `/aplicador/os/${id}/consumo`, data),
  getReparos: () => request('GET', '/ordens-servico?tipo=reparo'),
  createReparo: (data) => request('POST', '/ordens-servico', data),
  createReparoFromOS: (data) => request('POST', '/reparos/from-os', data),

  // Equipes — desempenho e ranking
  getEquipeDesempenho: (equipeId, inicio, fim) => request('GET', `/equipes/desempenho?equipeId=${equipeId}&inicio=${inicio}&fim=${fim}`),
  getEquipesRanking: (inicio, fim) => request('GET', `/equipes/ranking?inicio=${inicio}&fim=${fim}`),
  getEquipesLocalizacao: () => request('GET', '/equipes/localizacao'),

  // Compartilhamento
  compartilharOS: (id, data) => request('POST', `/aplicador/os/${id}/compartilhar`, data),

  // Dashboard
  getDashboardStats: (start, end) => request('GET', `/dashboard/stats?start=${start}&end=${end}`),

  // Croquis
  getCroquis: () => request('GET', '/croquis'),

  // Lixeira
  getLixeira: () => request('GET', '/lixeira'),
  restaurarItem: (id) => request('POST', `/lixeira/${id}/restaurar`),
  deletarPermanente: (id) => request('DELETE', `/lixeira/${id}`),

  // Config
  getPrecos: () => request('GET', '/config/precos'),
  updatePrecos: (data) => request('PUT', '/config/precos', data),
  getProximoOrcamento: () => request('GET', '/config/proximo-orcamento'),

  // Produtos — GVF Seal
  getProdutosDashboard: () => request('GET', '/produtos/dashboard'),
  getCompras: () => request('GET', '/produtos/compras'),
  addCompra: (data) => request('POST', '/produtos/compras', data),
  deleteCompra: (id) => request('DELETE', `/produtos/compras/${id}`),

  // Produtos — Injetores
  getInjetoresDashboard: () => request('GET', '/produtos/injetores/dashboard'),
  getComprasInjetores: () => request('GET', '/produtos/injetores/compras'),
  addCompraInjetor: (data) => request('POST', '/produtos/injetores/compras', data),
  deleteCompraInjetor: (id) => request('DELETE', `/produtos/injetores/compras/${id}`),

  // Estoque por Equipe / Semana
  getEstoqueEquipes: (semana) => request('GET', `/estoque-equipes${semana ? '?semana=' + encodeURIComponent(semana) : ''}`),
  setEstoqueEquipe: (equipeId, semana, recebido) => request('PUT', `/estoque-equipes/${equipeId}`, { semana, recebido }),

  // Usuários
  getUsuarios: () => request('GET', '/usuarios'),
  createUsuario: (data) => request('POST', '/usuarios', data),
  updateUsuario: (email, data) => request('PUT', `/usuarios/${encodeURIComponent(email)}`, data),
  deleteUsuario: (email) => request('DELETE', `/usuarios/${encodeURIComponent(email)}`),
  getUsuarioMe: () => request('GET', '/usuarios/me'),

  // Notifications
  getNotificationCounts: () => request('GET', '/notifications/counts'),

  // Push
  getPushVapidKey: () => request('GET', '/push/vapid-public-key'),
  pushSubscribe: (subscription) => request('POST', '/push/subscribe', { subscription }),
  pushUnsubscribe: () => request('DELETE', '/push/unsubscribe'),

  // Follow-up Agendamento
  getFollowupConexoes: () => request('GET', '/followup/conexoes'),
  saveFollowupConexao: (data) => request('POST', '/followup/conexoes', data),
  deleteFollowupConexao: (tecnico) => request('DELETE', `/followup/conexoes/${tecnico}`),
  getFollowupUsuarios: () => request('GET', '/followup/usuarios'),
  getFollowupEventos: () => request('GET', '/followup/eventos'),
  dispararFollowup: (data) => request('POST', '/followup/disparar', data),
  getFollowupLogs: () => request('GET', '/followup/logs'),
  getEvolutionStatus: () => request('GET', '/followup/evolution/status'),
  getEvolutionQr: () => request('GET', '/followup/evolution/qr'),
}
