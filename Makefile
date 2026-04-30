prod_pm2_restart:
	@pm2 stop atf-discord-2026
	@npm run build
	@pm2 start atf-discord-2026

prod_pm2_logs:
	@pm2 logs atf-discord-2026 -f
