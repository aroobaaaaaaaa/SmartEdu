import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { ThemeProvider } from './context/ThemeContext'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null, stack: null }
  }
  componentDidCatch(error, info) {
    console.error('CAUGHT:', error)
    console.error('STACK:', info.componentStack)
  }
  static getDerivedStateFromError(error) {
    return { error: error.toString() }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: 'monospace', background: '#fff' }}>
          <h2 style={{ color: 'red' }}>App crashed — error details:</h2>
          <pre style={{ color: 'red', whiteSpace: 'pre-wrap' }}>{this.state.error}</pre>
          <p style={{ color: '#666', marginTop: 20 }}>Also check the browser console (F12) for the full component stack trace.</p>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </ErrorBoundary>
)