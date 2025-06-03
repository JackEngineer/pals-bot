// API 请求工具函数
const API_BASE = '/api/miniapp'

// 获取Telegram初始化数据
const getInitData = () => {
  // 首先尝试从Telegram WebApp获取真实数据
  const realInitData = window.Telegram?.WebApp?.initData || ''
  
  if (realInitData) {
    // 验证initData是否完整（包含必要的参数）
    const urlParams = new URLSearchParams(realInitData)
    const hasHash = urlParams.get('hash')
    const hasUser = urlParams.get('user')
    
    if (hasHash && hasUser) {
      console.log('📱 获取到完整的真实initData')
      return realInitData
    } else {
      console.log('⚠️ initData不完整，缺少必要参数:', {
        hasHash: !!hasHash,
        hasUser: !!hasUser,
        params: Array.from(urlParams.keys())
      })
    }
  }
  
  // 开发环境中可能没有Telegram WebApp环境，但仍需要一些认证标识
  if (import.meta.env.DEV) {
    console.log('🔧 开发环境：使用空initData（将触发后端模拟认证）')
    // 返回空字符串，让后端使用开发环境模拟数据
    return ''
  }
  
  console.log('⚠️ 生产环境但无完整initData')
  return ''
}

// API请求封装
export async function apiRequest<T = any>(
  endpoint: string, 
  options: RequestInit = {}
): Promise<T> {
  const url = API_BASE + endpoint
  const initData = getInitData()
  
  console.log('🌐 API请求开始:', {
    endpoint,
    method: options.method || 'GET',
    hasInitData: !!initData,
    fullUrl: url
  })
  
  const config: RequestInit = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  }

  try {
    let response: Response
    
    // 处理不同HTTP方法的initData传递
    if (config.method === 'GET' || config.method === 'HEAD') {
      // GET和HEAD请求通过URL参数传递initData
      const urlObj = new URL(url, window.location.origin)
      if (initData) {
        urlObj.searchParams.append('initData', initData)
      }
      
      const finalUrl = urlObj.toString()
      console.log('📤 发送GET请求:', finalUrl)
      
      response = await fetch(finalUrl, config)
    } else {
      // POST、PUT、DELETE等请求通过body传递initData
      if (!config.body) {
        config.body = JSON.stringify({ initData })
      } else if (typeof config.body === 'string') {
        try {
          const bodyObj = JSON.parse(config.body)
          config.body = JSON.stringify({ ...bodyObj, initData })
        } catch {
          // 如果body不是JSON，则创建新的对象
          config.body = JSON.stringify({ data: config.body, initData })
        }
      } else if (config.body && typeof config.body === 'object') {
        config.body = JSON.stringify({ ...config.body, initData })
      }
      
      console.log('📤 发送POST请求:', {
        url,
        method: config.method,
        bodyLength: config.body ? config.body.length : 0
      })
      
      response = await fetch(url, config)
    }
    
    console.log('📥 收到响应:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: Object.fromEntries(response.headers.entries())
    })
    
    if (!response.ok) {
      console.error('❌ HTTP错误:', {
        status: response.status,
        statusText: response.statusText
      })
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const data = await response.json()
    console.log('📋 解析响应数据:', {
      success: data.success,
      hasData: !!data.data,
      error: data.error || '无'
    })
    
    if (!data.success) {
      console.error('❌ API业务错误:', data.error)
      throw new Error(data.error || '请求失败')
    }
    
    console.log('✅ API请求成功:', endpoint)
    return data.data
    
  } catch (error) {
    console.error('❌ API请求失败:', {
      endpoint,
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined
    })
    throw error
  }
}

// 便捷的HTTP方法封装
export const api = {
  get: <T = any>(endpoint: string, params?: Record<string, any>) => {
    let url = endpoint
    if (params) {
      const searchParams = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value))
        }
      })
      const paramString = searchParams.toString()
      if (paramString) {
        url += (url.includes('?') ? '&' : '?') + paramString
      }
    }
    console.log('📊 api.get调用:', { endpoint, params, finalUrl: url })
    return apiRequest<T>(url, { method: 'GET' })
  },

  post: <T = any>(endpoint: string, data?: any) => {
    console.log('📊 api.post调用:', { endpoint, hasData: !!data })
    return apiRequest<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined
    })
  },

  put: <T = any>(endpoint: string, data?: any) => {
    console.log('📊 api.put调用:', { endpoint, hasData: !!data })
    return apiRequest<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined
    })
  },

  delete: <T = any>(endpoint: string) => {
    console.log('📊 api.delete调用:', { endpoint })
    return apiRequest<T>(endpoint, { method: 'DELETE' })
  }
}

export default api 