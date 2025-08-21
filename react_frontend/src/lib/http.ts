import axios from 'axios'

const host = process.env.NODE_ENV === 'production' ? `http://${document.location.host}/` : 'http://localhost:8095/'

export const http = axios.create({
    baseURL: host
})

// Attach Authorization header from localStorage, if present
http.interceptors.request.use((config) => {
    const token = localStorage.getItem('user-token')
    if (token) {
        config.headers = config.headers || {}
        config.headers.Authorization = token
    }
    return config
})

// Global response interceptor: redirect to login on 401
http.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error && error.response && error.response.status === 401) {
            // Hard redirect keeps it framework-agnostic
            if (window.location.pathname !== '/login') {
                window.location.href = '/login'
            }
        }
        return Promise.reject(error)
    }
)