import React, { useState, useMemo, useEffect, useRef } from 'react'

const DOW_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTH_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

function toStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function buildDefault(dataInicio, dataTermino, inclSab) {
  if (!dataInicio || !dataTermino) return []
  const s = new Date(dataInicio + 'T12:00:00')
  const e = new Date(dataTermino + 'T12:00:00')
  if (isNaN(s) || isNaN(e) || s > e || (e - s) / 86400000 > 180) return []
  const result = []
  const cur = new Date(s)
  while (cur <= e) {
    const dow = cur.getDay()
    if (dow !== 0 && (dow !== 6 || inclSab)) result.push(toStr(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return result
}

/**
 * WorkdayPicker — selecionador de dias úteis de trabalho.
 *
 * Props:
 *   dataInicio  : 'YYYY-MM-DD' — início do range (controlado pelo parent)
 *   dataTermino : 'YYYY-MM-DD' — fim do range (controlado pelo parent)
 *   diasAtivos  : string[]     — dias já selecionados (da OS salva)
 *   onChange    : (diasAtivos: string[]) => void
 */
export default function WorkdayPicker({ dataInicio, dataTermino, diasAtivos = [], onChange }) {
  // Inicializa com sábados se algum sábado já estava ativo
  const [inclSab, setInclSab] = useState(() =>
    (diasAtivos || []).some(d => new Date(d + 'T12:00:00').getDay() === 6)
  )
  const inclSabRef = useRef(inclSab)

  // selected: Set<string> de datas ativas
  const [selected, setSelected] = useState(() => new Set(diasAtivos || []))

  // Ref das datas anteriores para detectar mudança
  const prevRange = useRef({ dataInicio, dataTermino })

  // Quando as datas mudam, rebuilda a seleção do zero
  useEffect(() => {
    const { dataInicio: prevI, dataTermino: prevT } = prevRange.current
    if (prevI === dataInicio && prevT === dataTermino) return
    prevRange.current = { dataInicio, dataTermino }
    const fresh = buildDefault(dataInicio, dataTermino, inclSabRef.current)
    setSelected(new Set(fresh))
    onChange(fresh)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataInicio, dataTermino])

  // Toggle sábados: adiciona/remove todos os sábados do range
  const handleToggleSab = () => {
    const next = !inclSab
    inclSabRef.current = next
    setInclSab(next)
    setSelected(prev => {
      const updated = new Set(prev)
      if (dataInicio && dataTermino) {
        const s = new Date(dataInicio + 'T12:00:00')
        const e = new Date(dataTermino + 'T12:00:00')
        if (!isNaN(s) && !isNaN(e) && s <= e) {
          const cur = new Date(s)
          while (cur <= e) {
            if (cur.getDay() === 6) {
              if (next) updated.add(toStr(cur))
              else updated.delete(toStr(cur))
            }
            cur.setDate(cur.getDate() + 1)
          }
        }
      }
      onChange([...updated].sort())
      return updated
    })
  }

  // Toggle individual: qualquer dia exceto domingo
  const toggleDay = (str, dow) => {
    if (dow === 0) return
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(str)) next.delete(str)
      else next.add(str)
      onChange([...next].sort())
      return next
    })
  }

  // Todos os dias no range para renderizar
  const allDays = useMemo(() => {
    if (!dataInicio || !dataTermino) return []
    const s = new Date(dataInicio + 'T12:00:00')
    const e = new Date(dataTermino + 'T12:00:00')
    if (isNaN(s) || isNaN(e) || s > e || (e - s) / 86400000 > 180) return []
    const days = []
    const cur = new Date(s)
    while (cur <= e) {
      days.push({ str: toStr(cur), dow: cur.getDay(), d: cur.getDate(), m: cur.getMonth() })
      cur.setDate(cur.getDate() + 1)
    }
    return days
  }, [dataInicio, dataTermino])

  if (allDays.length === 0) return null

  // Agrupar por semana (linhas de 7 dias)
  const weeks = []
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7))
  }

  return (
    <div className="mt-2 p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-xs font-semibold text-indigo-700">
          📅 {selected.size} dia(s) de trabalho selecionado(s)
        </span>
        <button
          type="button"
          onClick={handleToggleSab}
          className={`text-xs px-2.5 py-1 rounded-full font-semibold transition-colors ${
            inclSab
              ? 'bg-amber-400 text-white shadow-sm'
              : 'bg-white text-gray-500 border border-gray-300 hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300'
          }`}
        >
          {inclSab ? '✅ Sáb incluído' : '+ Sábados'}
        </button>
      </div>

      {/* Grade de dias */}
      <div className="space-y-1">
        {/* Header de dias da semana */}
        <div className="flex gap-1 mb-1">
          {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => (
            <div key={d} className="w-9 text-center text-[9px] font-semibold text-indigo-400 uppercase tracking-wide">
              {d}
            </div>
          ))}
        </div>

        {weeks.map((week, wi) => {
          // Calcula padding inicial para a primeira semana (alinha ao dia correto)
          const padStart = wi === 0 ? week[0].dow : 0
          return (
            <div key={wi} className="flex gap-1">
              {/* Padding vazio antes do primeiro dia */}
              {Array.from({ length: padStart }).map((_, pi) => (
                <div key={`pad-${pi}`} className="w-9" />
              ))}
              {week.map(({ str, dow, d, m }) => {
                const isSun = dow === 0
                const isSat = dow === 6
                const on = selected.has(str)

                return (
                  <button
                    key={str}
                    type="button"
                    disabled={isSun}
                    onClick={() => toggleDay(str, dow)}
                    title={`${DOW_SHORT[dow]} ${d}/${m + 1} — ${str}`}
                    className={`flex flex-col items-center w-9 py-1 rounded-lg text-xs font-medium transition-all select-none ${
                      isSun
                        ? 'opacity-25 cursor-not-allowed bg-red-100 text-red-400'
                        : on
                        ? isSat
                          ? 'bg-amber-400 text-white shadow-sm ring-1 ring-amber-500'
                          : 'bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-700'
                        : 'bg-white text-gray-300 border border-gray-200 hover:border-indigo-300 hover:text-indigo-500'
                    }`}
                  >
                    <span className="text-[8px] opacity-70 leading-none">{MONTH_SHORT[m]}</span>
                    <span className="font-bold leading-tight">{d}</span>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>

      <p className="text-[10px] text-indigo-400 mt-2">
        Clique nos dias para ativar/desativar · Dom sempre excluído · Sáb é opcional
      </p>
    </div>
  )
}
