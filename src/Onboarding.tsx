import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import logoUrl from './assets/logo.svg'
import { Settings } from './components/Settings'

const slides = [
  {
    id: 'slide-1',
    title: '欢迎使用 Edge-Drop',
    description: 'Edge-Drop 隐藏在你的屏幕左边缘。将鼠标移到左边缘即可打开面板，移开则自动隐藏。',
    videoSrc: 'placeholder_welcome.mp4',
    placeholderColor: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)'
  },
  {
    id: 'slide-2',
    title: '收集任意内容',
    description: '当你按 Ctrl+C 复制文本、图片或文件时，Edge-Drop 会在后台自动捕获并保存。',
    videoSrc: 'placeholder_copy.mp4',
    placeholderColor: 'linear-gradient(135deg, #4FACFE 0%, #00F2FE 100%)'
  },
  {
    id: 'slide-3',
    title: '拖放到任意位置',
    description: '需要使用某项内容？打开面板，将卡片直接拖入任意应用、文件夹或文档即可。',
    videoSrc: 'placeholder_drag.mp4',
    placeholderColor: 'linear-gradient(135deg, #43E97B 0%, #38F9D7 100%)'
  },
  {
    id: 'slide-4',
    title: '探索文件堆叠',
    description: '复制多个文件会自动合并为堆叠。你可以拖走整个堆叠，或点击展开查看并提取单个文件。',
    videoSrc: 'placeholder_stacks.mp4',
    placeholderColor: 'linear-gradient(135deg, #FA709A 0%, #FEE140 100%)'
  },
  {
    id: 'slide-5-ungroup',
    title: '拆分堆叠',
    description: '想要拆分堆叠中的项目？点击展开堆叠，然后将子项拖到屏幕左边缘。会出现一条珊瑚色发光条——将项目拖放上去即可拆分为独立卡片。',
    videoSrc: 'placeholder_ungroup.mp4',
    placeholderColor: 'linear-gradient(135deg, #FAD961 0%, #F76B1C 100%)'
  },
  {
    id: 'slide-5',
    title: '合并项目',
    description: '将文件或图片卡片直接拖放到另一张卡片上即可合并。相关资源会被打包成堆叠，让剪贴板更整洁。',
    videoSrc: 'placeholder_merge.mp4',
    placeholderColor: 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)'
  },
  {
    id: 'slide-6',
    title: '配置你的剪贴板',
    description: '按需自定义 Edge-Drop 的工作方式。',
    videoSrc: '',
    placeholderColor: 'transparent'
  }
]

export function Onboarding() {
  const [currentIndex, setCurrentIndex] = useState(0)

  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      setCurrentIndex(currentIndex + 1)
    } else {
      finish()
    }
  }

  const handleSkip = () => {
    setCurrentIndex(slides.length - 1)
  }

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1)
    }
  }

  const finish = async () => {
    await window.edge.updateSettings({ tutorialCompleted: true })
    window.close()
  }

  const currentSlide = slides[currentIndex]

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#121212',
      color: '#fff',
      overflow: 'hidden',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Titlebar & Header */}
      <div style={{
        height: '60px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 24px',
        boxSizing: 'border-box',
        ...({ WebkitAppRegion: 'drag' } as any)
      }}>
        {/* Logo Area */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0px' }}>
          <img src={logoUrl} alt="Edge-Drop Logo" style={{ width: '42px', height: '42px' }} />
        </div>

        {/* Header Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', ...({ WebkitAppRegion: 'no-drag' } as any) }}>
          {currentIndex !== slides.length - 1 && (
            <button
              onClick={handleSkip}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#888',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: '6px',
                transition: 'color 0.2s, background 0.2s'
              }}
              onMouseOver={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)' }}
              onMouseOut={(e) => { e.currentTarget.style.color = '#888'; e.currentTarget.style.background = 'transparent' }}
            >
              跳过
            </button>
          )}
          <button
            onClick={() => window.edge.minimizeWindow()}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#888',
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s, color 0.2s'
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'; e.currentTarget.style.color = '#fff' }}
            onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#888' }}
            title="最小化"
          >
            <svg width="14" height="2" viewBox="0 0 14 2" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 1H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {currentSlide.id === 'slide-6' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'row', alignItems: 'stretch', padding: '16px 48px', gap: '40px', width: '100%', boxSizing: 'border-box', minHeight: 0 }}>
          {/* Left Side: Textual Description */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <h1 style={{ fontSize: '28px', margin: '0 0 16px 0', fontWeight: 700, letterSpacing: '-0.01em' }}>
              {currentSlide.title}
            </h1>
            <p style={{ fontSize: '15px', lineHeight: 1.6, color: 'rgba(255,255,255,0.7)', margin: '0 0 24px 0' }}>
              {currentSlide.description}
            </p>
            <div style={{ padding: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '8px' }}>快捷提示：</div>
              <ul style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', margin: 0, paddingLeft: '20px', lineHeight: 1.6 }}>
                <li>按 <strong>Alt + C</strong> 可快速开关剪贴板面板。</li>
                <li>随时点击右上角齿轮图标进入设置。</li>
                <li>将文件拖放到屏幕左边缘即可添加。</li>
                <li>先点击目标文本框，再点击剪贴板项可自动粘贴。</li>
                <li>文件可与文件合并（如 zip、md、json），图片可与图片合并（最多 10 项）。文本无法合并。</li>
              </ul>
            </div>
          </div>
          {/* Right Side: Settings */}
          <div style={{ flex: 1, background: '#1a1a1c', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.05)', boxShadow: '0 20px 40px rgba(0,0,0,0.4)', overflow: 'hidden', display: 'flex', minHeight: 0 }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', boxSizing: 'border-box' }}>
              <Settings />
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 48px' }}>
          {/* Video / Placeholder Area */}
          <div style={{
            width: '100%',
            maxWidth: '560px',
            height: '315px', // 16:9 aspect ratio
            background: '#1a1a1c',
            borderRadius: '16px',
            overflow: 'hidden',
            position: 'relative',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
            marginBottom: '36px',
            border: '1px solid rgba(255, 255, 255, 0.05)'
          }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={currentSlide.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: currentSlide.placeholderColor
                }}
              >
                <video
                  key={currentSlide.videoSrc}
                  src={`${currentSlide.videoSrc}?v=1`}
                  autoPlay
                  loop
                  muted
                  playsInline
                  onError={(e) => {
                    console.error("Video loading error:", currentSlide.videoSrc, e.currentTarget.error);
                  }}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover'
                  }}
                />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Text Area */}
          <div style={{ textAlign: 'center', height: '100px', maxWidth: '480px' }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={currentSlide.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              >
                <h1 style={{ fontSize: '24px', margin: '0 0 12px 0', fontWeight: 700, letterSpacing: '-0.01em' }}>
                  {currentSlide.title}
                </h1>
                <p style={{ fontSize: '15px', lineHeight: 1.6, color: 'rgba(255,255,255,0.6)', margin: 0 }}>
                  {currentSlide.description}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Footer Navigation */}
      <div style={{
        height: '80px',
        padding: '0 40px',
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        borderTop: '1px solid #333'
      }}>
        {/* Left Area (Previous) */}
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <button
            onClick={handlePrev}
            disabled={currentIndex === 0}
            style={{
              background: '#2a2a2a',
              border: '1px solid #444',
              color: currentIndex === 0 ? '#555' : '#fff',
              fontSize: '15px',
              fontWeight: 500,
              cursor: currentIndex === 0 ? 'default' : 'pointer',
              padding: '8px 20px',
              borderRadius: '6px',
              transition: 'background 0.2s',
              opacity: currentIndex === 0 ? 0 : 1, // Hide when disabled for perfect symmetry
              pointerEvents: currentIndex === 0 ? 'none' : 'auto'
            }}
            onMouseOver={(e) => { if (currentIndex !== 0) e.currentTarget.style.background = '#333' }}
            onMouseOut={(e) => { if (currentIndex !== 0) e.currentTarget.style.background = '#2a2a2a' }}
          >
            上一步
          </button>
        </div>

        {/* Center Area (Dots) */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {slides.map((_, i) => (
            <div
              key={i}
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: i === currentIndex ? '#fff' : '#444',
                transition: 'background 0.3s'
              }}
            />
          ))}
        </div>

        {/* Right Area (Next) */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handleNext}
            style={{
              background: '#fff',
              border: 'none',
              color: '#000',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              padding: '8px 24px',
              borderRadius: '6px',
              transition: 'transform 0.1s, opacity 0.2s'
            }}
            onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.96)'}
            onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            onMouseOver={(e) => e.currentTarget.style.opacity = '0.9'}
            onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
          >
            {currentIndex === slides.length - 1 ? '保存并开始使用' : '下一步'}
          </button>
        </div>
      </div>
    </div>
  )
}
