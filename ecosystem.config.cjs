module.exports = {
  apps: [
    {
      name: 'neuralyx-relay',
      script: 'scripts/edge-relay.js',
      cwd: 'D:\\DATA\\PORTFOLIO\\Navlink',
      interpreter: 'node',
      // ESM support
      node_args: '--experimental-vm-modules',
      watch: false,
      autorestart: true,
      max_restarts: 100,
      restart_delay: 3000,    // wait 3s before restart
      min_uptime: 5000,       // must stay up 5s to count as successful start
      exp_backoff_restart_delay: 1000, // exponential backoff on repeated crashes
      env: {
        NODE_ENV: 'production',
        PORT: '9223',
      },
      error_file: 'logs/relay-error.log',
      out_file: 'logs/relay-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'neuralyx-mcp',
      script: 'mcp-server/src/api.ts',
      cwd: 'D:\\DATA\\PORTFOLIO\\Navlink',
      interpreter: 'node',
      interpreter_args: '--import tsx/esm',
      watch: false,
      autorestart: true,
      max_restarts: 50,
      restart_delay: 5000,
      min_uptime: 10000,
      exp_backoff_restart_delay: 2000,
      env_file: '.env',
      env: {
        NODE_ENV: 'production',
        PORT: '8080',
        VITE_GEMINI_KEY: '',
        GEMINI_KEY: '',
        VITE_OPENAI_KEY: '',
        OPENAI_KEY: '',
        JSEARCH_API_KEY: '',
        TWOCAPTCHA_API_KEY: '',
        JOOBLE_API_KEY: '',
      },
      error_file: 'logs/mcp-error.log',
      out_file: 'logs/mcp-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
}
