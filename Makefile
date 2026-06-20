start:
	@pm2 start npm --name "atf-discord-2026" -- start

stop:
	@pm2 stop atf-discord-2026

rebuild:
	@pm2 stop atf-discord-2026
	@npm run build
	@pm2 start atf-discord-2026

logs:
	@pm2 logs atf-discord-2026 -f
