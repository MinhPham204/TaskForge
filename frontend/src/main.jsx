import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { Provider } from 'react-redux'
import { store } from './store'
import { ThemeProvider } from './components/ThemeProvider.jsx'
import FeedbackHost from './components/FeedbackHost.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <ThemeProvider>
        <App />
        <FeedbackHost />
      </ThemeProvider>
    </Provider>
  </StrictMode>,
)
