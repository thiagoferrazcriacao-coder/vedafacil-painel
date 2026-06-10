import React, { useEffect, useState } from 'react'

// Versículo bíblico do dia — aparece na primeira abertura do painel a cada dia.
// Usa a mesma chave por dia que os PWAs Medidor/Aplicador pra manter consistência.
// Endpoint público `/api/devocional/hoje` retorna { texto, referencia }.
export default function DevocionalModal() {
  const [data, setData] = useState(null)
  const [visivel, setVisivel] = useState(false)

  useEffect(() => {
    const hoje = new Date().toISOString().split('T')[0]
    const chave = `vf_painel_versiculo_visto_${hoje}`
    if (localStorage.getItem(chave)) return

    fetch('/api/devocional/hoje')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.texto) {
          setData(d)
          setVisivel(true)
        }
      })
      .catch(() => { /* sem versículo, segue a vida */ })
  }, [])

  function fechar() {
    const hoje = new Date().toISOString().split('T')[0]
    localStorage.setItem(`vf_painel_versiculo_visto_${hoje}`, '1')
    setVisivel(false)
  }

  if (!visivel || !data) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'linear-gradient(135deg, #c45d12 0%, #e87722 50%, #f59340 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '32px', textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 640, color: '#fff' }}>
        <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 4, opacity: 0.85, marginBottom: 24 }}>
          ✝ PALAVRA DO DIA
        </div>
        <div style={{
          fontSize: 'clamp(20px, 3.5vw, 28px)',
          lineHeight: 1.5,
          fontWeight: 500,
          fontStyle: 'italic',
          marginBottom: 28,
          textShadow: '0 2px 4px rgba(0,0,0,0.15)',
        }}>
          "{data.texto}"
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 40, opacity: 0.95 }}>
          — {data.referencia}
        </div>
        <button
          onClick={fechar}
          style={{
            background: '#fff',
            color: '#c45d12',
            border: 'none',
            padding: '16px 64px',
            borderRadius: 100,
            fontSize: 20,
            fontWeight: 800,
            letterSpacing: 2,
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
            transition: 'transform 0.12s',
          }}
          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.96)'}
          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          ✝ AMÉM
        </button>
      </div>
    </div>
  )
}
