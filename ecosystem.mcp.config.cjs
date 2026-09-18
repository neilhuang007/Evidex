module.exports = {
  apps: [
    {
      name: 'evidex-mcp',
      script: 'dist/mcp/index.js',
      args: ['--http'],
      cwd: __dirname,
      autorestart: true,
      restart_delay: 2000,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        EVIDEX_API_URL: 'https://ev1dex.com',
        MCP_HOST: '127.0.0.1',
        MCP_PORT: '3002',
        MCP_PUBLIC_URL: 'https://javavirtualenvironment.com/evidex',
        MCP_ALLOWED_HOSTS: 'javavirtualenvironment.com,www.javavirtualenvironment.com'
      }
    }
  ]
};
