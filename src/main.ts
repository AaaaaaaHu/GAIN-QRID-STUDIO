import { createApp } from 'vue'
import App from './App.vue'
import { initAppearance } from './composables/useAppearance'
import './styles/theme.css'
import './styles/main.scss'

initAppearance()
createApp(App).mount('#app')
