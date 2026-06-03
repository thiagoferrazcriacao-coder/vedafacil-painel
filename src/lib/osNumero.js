// Helper: formata número de OS considerando se é reparo
// OS normal: "3226"
// OS de reparo: "3226-1", "3226-2"...
export function fmtNumeroOS(os, padLength = 3) {
  if (!os) return ''
  const numeroBase = String(os.numero || '').padStart(padLength, '0')
  if ((os.tipo || 'normal') === 'reparo' && os.numReparo) {
    return `${numeroBase}-${os.numReparo}`
  }
  return numeroBase
}
