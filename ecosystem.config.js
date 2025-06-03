module.exports = {
  apps: [
    {
      name: 'pals-bot',
      script: 'dist/index.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        WEBAPP_URL: 'https://4621-183-94-71-108.ngrok-free.app'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        WEBAPP_URL: 'https://4621-183-94-71-108.ngrok-free.app'
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      kill_timeout: 5000,
      listen_timeout: 8000
    }
  ]
}; 